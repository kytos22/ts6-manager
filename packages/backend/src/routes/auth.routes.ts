import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { validatePassword, loadPasswordPolicy } from '../utils/validate-password.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { generateMfaSecret, buildOtpAuthUrl, verifyTotp, generateRecoveryCodes, consumeRecoveryCode } from '../utils/mfa.js';
import QRCode from 'qrcode';

export const authRoutes: Router = Router();

/** A user can attempt local password login only if enabled and has a local password. */
export function canLocalLogin(user: { enabled: boolean; passwordHash: string | null } | null): boolean {
  return !!user && user.enabled && !!user.passwordHash;
}

export function requirePasswordHash(passwordHash: string | null): string {
  if (!passwordHash) throw new AppError(400, 'Not available for SSO accounts');
  return passwordHash;
}

// Short-lived token proving the password step passed, scoped to the MFA step.
const MFA_CHALLENGE_TTL = '5m';
function signMfaChallenge(userId: number): string {
  return jwt.sign({ mfa: true, id: userId }, config.jwtSecret, { expiresIn: MFA_CHALLENGE_TTL } as jwt.SignOptions);
}
function verifyMfaChallenge(token: string): number {
  const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as any;
  if (!payload?.mfa || !payload.id) throw new AppError(401, 'Invalid MFA session');
  return payload.id;
}

// Issue access + refresh tokens and the user payload (shared by login and the MFA step).
async function issueSession(prisma: any, user: any) {
  const payload = { id: user.id, username: user.username, role: user.role };
  const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiry } as jwt.SignOptions);
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const family = nanoid();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt, family } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, language: user.language },
  };
}

authRoutes.post('/login', async (req: Request, res: Response, next) => {
  const journal = req.app.locals.connectionJournal;
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new AppError(400, 'Username and password required');

    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!canLocalLogin(user)) {
      journal?.recordWebLogin(String(username), req.ip || '', false);
      throw new AppError(401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash as string);
    if (!valid) {
      journal?.recordWebLogin(user.username, req.ip || '', false);
      throw new AppError(401, 'Invalid credentials');
    }

    journal?.recordWebLogin(user.username, req.ip || '', true);

    // MFA gate: don't issue tokens until the second factor is verified.
    if (user.mfaEnabled) {
      res.json({ mfaRequired: true, mfaToken: signMfaChallenge(user.id) });
      return;
    }
    if (user.mfaRequired) {
      // Admin-forced but not yet set up — the client must enroll first.
      res.json({ mfaSetupRequired: true, mfaToken: signMfaChallenge(user.id) });
      return;
    }

    res.json(await issueSession(prisma, user));
  } catch (err) { next(err); }
});

const REFRESH_ROTATION_GRACE_MS = 15_000;

function signAccessToken(user: any): string {
  const payload = { id: user.id, username: user.username, role: user.role };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiry } as jwt.SignOptions);
}

async function findGraceReplacement(prisma: any, stored: any) {
  if (!stored?.replacedBy) return null;

  const replacement = await prisma.refreshToken.findUnique({
    where: { token: stored.replacedBy },
    include: { user: true },
  });
  if (!replacement || !replacement.user.enabled || replacement.expiresAt < new Date()) {
    return null;
  }

  const ageMs = Date.now() - replacement.createdAt.getTime();
  return ageMs <= REFRESH_ROTATION_GRACE_MS ? replacement : null;
}

async function revokeRefreshFamily(prisma: any, stored: any): Promise<void> {
  if (stored.family) {
    await prisma.refreshToken.deleteMany({ where: { family: stored.family } });
  } else {
    await prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
  }
}

// Second login step: verify a TOTP or recovery code against the MFA challenge.
authRoutes.post('/login/mfa', async (req: Request, res: Response, next) => {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) throw new AppError(400, 'MFA token and code required');

    const userId = verifyMfaChallenge(mfaToken);
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.enabled || !user.mfaEnabled || !user.mfaSecret) {
      throw new AppError(401, 'Invalid MFA session');
    }

    const okTotp = verifyTotp(String(code), decrypt(user.mfaSecret));
    if (!okTotp) {
      // Fall back to a one-time recovery code
      const stored: string[] = user.mfaRecoveryCodes ? JSON.parse(decrypt(user.mfaRecoveryCodes)) : [];
      const remaining = consumeRecoveryCode(String(code), stored);
      if (!remaining) throw new AppError(401, 'Invalid code');
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaRecoveryCodes: encrypt(JSON.stringify(remaining)) },
      });
    }

    res.json(await issueSession(prisma, user));
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'MFA session expired, please log in again'));
    }
    next(err);
  }
});

authRoutes.post('/refresh', async (req: Request, res: Response, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError(400, 'Refresh token required');

    const prisma = req.app.locals.prisma;
    let stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored) throw new AppError(401, 'Invalid refresh token');

    // Keep rotated tokens as tombstones. A short grace period makes refresh
    // idempotent across concurrent requests and browser tabs. Reuse after the
    // grace period is treated as suspicious and revokes the token family.
    if (stored.replacedBy) {
      const replacement = await findGraceReplacement(prisma, stored);
      if (replacement) {
        return res.json({
          accessToken: signAccessToken(replacement.user),
          refreshToken: replacement.token,
        });
      }

      console.warn(`[SECURITY] Refresh token reuse detected for user ${stored.userId}. Revoking token family.`);
      await revokeRefreshFamily(prisma, stored);
      throw new AppError(401, 'Invalid refresh token');
    }

    if (stored.expiresAt < new Date() || !stored.user.enabled) {
      await prisma.refreshToken.deleteMany({ where: { id: stored.id } });
      throw new AppError(401, 'Invalid refresh token');
    }

    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    try {
      await prisma.$transaction(async (tx: any) => {
        // Atomically claim this token. Only one concurrent request can rotate it.
        const claimed = await tx.refreshToken.updateMany({
          where: { id: stored.id, replacedBy: null },
          data: { replacedBy: newRefreshToken },
        });
        if (claimed.count !== 1) {
          throw new AppError(409, 'Refresh token already rotated');
        }

        await tx.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: stored.userId,
            expiresAt,
            family: stored.family,
          },
        });
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        stored = await prisma.refreshToken.findUnique({
          where: { id: stored.id },
          include: { user: true },
        });
        const replacement = await findGraceReplacement(prisma, stored);
        if (replacement) {
          return res.json({
            accessToken: signAccessToken(replacement.user),
            refreshToken: replacement.token,
          });
        }
      }
      throw err;
    }

    res.json({
      accessToken: signAccessToken(stored.user),
      refreshToken: newRefreshToken,
    });
  } catch (err) { next(err); }
});

authRoutes.post('/logout', async (req: Request, res: Response, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const prisma = req.app.locals.prisma;
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.status(204).send();
  } catch (err) { next(err); }
});

authRoutes.get('/me', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        mfaRequired: user.mfaRequired,
        language: user.language,
      },
    });
  } catch (err) { next(err); }
});

const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'es', 'it'];

// PUT /api/auth/language — persist the current user's UI language
authRoutes.put('/language', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const { language } = req.body;
    if (!SUPPORTED_LANGUAGES.includes(language)) throw new AppError(400, 'Unsupported language');
    await req.app.locals.prisma.user.update({ where: { id: req.user!.id }, data: { language } });
    res.json({ language });
  } catch (err) { next(err); }
});

// ─── MFA enrollment (self-service) ───────────────────────────

// Start enrollment: generate a pending secret + QR. Allowed either with a
// normal session or with an MFA challenge token (admin-forced first setup).
async function resolveEnrollUser(req: Request): Promise<{ prisma: any; user: any }> {
  const prisma = req.app.locals.prisma;
  let userId = req.user?.id;
  if (!userId && req.body?.mfaToken) userId = verifyMfaChallenge(req.body.mfaToken);
  if (!userId) throw new AppError(401, 'Authentication required');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.enabled) throw new AppError(401, 'Invalid session');
  return { prisma, user };
}

authRoutes.post('/mfa/setup', async (req: Request, res: Response, next) => {
  try {
    const { prisma, user } = await resolveEnrollUser(req);
    if (user.mfaEnabled) throw new AppError(400, 'MFA is already enabled');

    const secret = generateMfaSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaPendingSecret: encrypt(secret) } });

    const otpauth = buildOtpAuthUrl(secret, user.username);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ secret, otpauth, qrDataUrl });
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) return next(new AppError(401, 'MFA session expired'));
    next(err);
  }
});

authRoutes.post('/mfa/enable', async (req: Request, res: Response, next) => {
  try {
    const { code } = req.body;
    if (!code) throw new AppError(400, 'Verification code required');
    const { prisma, user } = await resolveEnrollUser(req);
    if (user.mfaEnabled) throw new AppError(400, 'MFA is already enabled');
    if (!user.mfaPendingSecret) throw new AppError(400, 'Start MFA setup first');

    const secret = decrypt(user.mfaPendingSecret);
    if (!verifyTotp(String(code), secret)) throw new AppError(401, 'Invalid code');

    const { plain, hashed } = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecret: encrypt(secret),
        mfaPendingSecret: null,
        mfaRecoveryCodes: encrypt(JSON.stringify(hashed)),
      },
    });
    res.json({ success: true, recoveryCodes: plain });
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) return next(new AppError(401, 'MFA session expired'));
    next(err);
  }
});

authRoutes.post('/mfa/disable', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const { password } = req.body;
    if (!password) throw new AppError(400, 'Password required');
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Password is incorrect');
    if (user.mfaRequired) throw new AppError(403, 'MFA is required by an administrator and cannot be disabled');

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaRecoveryCodes: null },
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

authRoutes.put('/password', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError(400, 'Both passwords required');

    const prisma = req.app.locals.prisma;
    const pwError = validatePassword(newPassword, await loadPasswordPolicy(prisma));
    if (pwError) throw new AppError(400, pwError);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError(401, 'Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Revoke all refresh tokens on password change
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.status(204).send();
  } catch (err) { next(err); }
});
