import type { Request, Response, NextFunction } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function auditAdminActions(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || req.user?.role !== 'admin') {
    next();
    return;
  }

  const originalPath = req.originalUrl.split('?')[0];
  const match = originalPath.match(/^\/api\/servers\/(\d+)(?:\/(?:vs|virtual-servers)\/(\d+))?/);
  const user = req.user as any;
  res.once('finish', () => {
    req.app.locals.prisma.auditLog.create({
      data: {
        userId: Number.isInteger(Number(user?.id)) ? Number(user.id) : null,
        username: user?.username ? String(user.username) : null,
        method: req.method,
        path: originalPath.slice(0, 500),
        statusCode: res.statusCode,
        serverConfigId: match ? Number(match[1]) : null,
        virtualServerId: match?.[2] ? Number(match[2]) : null,
        ipAddress: req.ip?.slice(0, 100) || null,
      },
    }).catch((error: any) => console.error(`[Audit] Failed to record action: ${error.message}`));
  });
  next();
}
