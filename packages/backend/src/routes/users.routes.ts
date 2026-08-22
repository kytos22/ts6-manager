import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { validatePassword } from '../utils/validate-password.js';

const VALID_ROLES = ['admin', 'viewer'];

function parseServerConfigIds(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AppError(400, 'serverConfigIds must be an array');
  }
  const ids = [...new Set(value.map((id) => Number(id)))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new AppError(400, 'serverConfigIds contains an invalid server ID');
  }
  return ids;
}

async function validateServerConfigIds(prisma: any, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const count = await prisma.tsServerConfig.count({ where: { id: { in: ids } } });
  if (count !== ids.length) {
    throw new AppError(400, 'One or more assigned servers do not exist');
  }
}

const publicUser = (user: any) => ({
  ...user,
  serverConfigIds: (user.serverAccess || []).map((access: any) => access.serverConfigId),
  serverAccess: undefined,
});

export const userRoutes: Router = Router();

userRoutes.use(requireRole('admin'));

userRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const users = await prisma.user.findMany({
      select: {
        id: true, username: true, displayName: true, role: true, enabled: true,
        createdAt: true, lastLoginAt: true,
        serverAccess: { select: { serverConfigId: true } },
      },
      orderBy: { id: 'asc' },
    });
    res.json(users.map(publicUser));
  } catch (err) { next(err); }
});

userRoutes.post('/', async (req: Request, res: Response, next) => {
  try {
    const { username, password, displayName, role, serverConfigIds: rawServerConfigIds } = req.body;
    if (!username || !password || !displayName) throw new AppError(400, 'Username, password, and display name required');

    const pwError = validatePassword(password);
    if (pwError) throw new AppError(400, pwError);

    const assignedRole = role || 'viewer';
    if (!VALID_ROLES.includes(assignedRole)) throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);

    const prisma = req.app.locals.prisma;
    const serverConfigIds = parseServerConfigIds(rawServerConfigIds) ?? [];
    await validateServerConfigIds(prisma, serverConfigIds);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username, passwordHash, displayName, role: assignedRole,
        serverAccess: serverConfigIds.length
          ? { create: serverConfigIds.map((serverConfigId) => ({ serverConfigId })) }
          : undefined,
      },
    });

    res.status(201).json({ id: user.id, username: user.username });
  } catch (err) { next(err); }
});

userRoutes.put('/:userId', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(String(req.params.userId));
    const data: any = {};
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, enabled: true } });
    if (!target) throw new AppError(404, 'User not found');

    if (req.body.displayName !== undefined) data.displayName = req.body.displayName;
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
      data.role = req.body.role;
    }
    if (req.body.enabled !== undefined) data.enabled = req.body.enabled;
    if (req.body.password) {
      const pwError = validatePassword(req.body.password);
      if (pwError) throw new AppError(400, pwError);
      data.passwordHash = await bcrypt.hash(req.body.password, 12);
    }

    const removesOwnAdminAccess = id === req.user!.id
      && ((data.role !== undefined && data.role !== 'admin') || data.enabled === false);
    if (removesOwnAdminAccess) {
      throw new AppError(400, 'Cannot remove your own administrator access');
    }

    const removesActiveAdmin = target.role === 'admin' && target.enabled
      && (data.role === 'viewer' || data.enabled === false);
    if (removesActiveAdmin) {
      const otherActiveAdmins = await prisma.user.count({ where: { role: 'admin', enabled: true, id: { not: id } } });
      if (otherActiveAdmins === 0) throw new AppError(400, 'Cannot remove the last active administrator');
    }

    const serverConfigIds = parseServerConfigIds(req.body.serverConfigIds);
    if (serverConfigIds !== undefined) {
      await validateServerConfigIds(prisma, serverConfigIds);
      data.serverAccess = {
        deleteMany: {},
        create: serverConfigIds.map((serverConfigId) => ({ serverConfigId })),
      };
    }

    await prisma.user.update({ where: { id }, data });
    res.status(204).send();
  } catch (err) { next(err); }
});

userRoutes.delete('/:userId', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(String(req.params.userId));
    if (id === req.user!.id) throw new AppError(400, 'Cannot delete your own account');
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, enabled: true } });
    if (!target) throw new AppError(404, 'User not found');
    if (target.role === 'admin' && target.enabled) {
      const otherActiveAdmins = await prisma.user.count({ where: { role: 'admin', enabled: true, id: { not: id } } });
      if (otherActiveAdmins === 0) throw new AppError(400, 'Cannot delete the last active administrator');
    }
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
});
