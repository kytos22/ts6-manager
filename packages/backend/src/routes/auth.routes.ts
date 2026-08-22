import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { validatePassword } from '../utils/validate-password.js';

export const authRoutes: Router = Router();

authRoutes.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new AppError(400, 'Username and password required');

    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.enabled) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    const payload = { id: user.id, username: user.username, role: user.role };
    const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiry } as jwt.SignOptions);
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const family = nanoid();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt, family },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
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
      },
    });
  } catch (err) { next(err); }
});

authRoutes.put('/password', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError(400, 'Both passwords required');

    const pwError = validatePassword(newPassword);
    if (pwError) throw new AppError(400, pwError);

    const prisma = req.app.locals.prisma;
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
