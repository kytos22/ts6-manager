import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireServerAccess } from '../middleware/server-access.js';
const mocks = vi.hoisted(() => ({ read: vi.fn(), project: vi.fn(), port: vi.fn() }));
vi.mock('../ts-client/prometheus.js', () => ({
  MetricsReader: class { read = mocks.read; }, metricsPort: mocks.port, projectDashboard: mocks.project,
}));
import { dashboardRoutes } from './dashboard.routes.js';
let server: Server;
let base: string;
const execute = vi.fn(async (_sid: number, command: string) => {
  if (command === 'serverinfo') return [{ virtualserver_name: 'Test', virtualserver_status: 'online' }];
  if (command === 'serverrequestconnectioninfo') return [{}];
  return [];
});
beforeEach(async () => {
  vi.clearAllMocks(); mocks.port.mockReturnValue(9187); mocks.read.mockResolvedValue({});
  mocks.project.mockImplementation((_s, sid, admin) => ({ source: 'prometheus', sid, ...(admin ? { instance: {} } : {}) }));
  const app = express();
  app.locals.prisma = {
    user: { findUnique: async ({ where }: any) => ({ enabled: true, role: where.id === 1 ? 'admin' : 'viewer' }) },
    userServerAccess: { findUnique: async ({ where }: any) => where.userId_serverConfigId.serverConfigId === 1 ? {} : null },
    tsServerConfig: { findUnique: async () => ({ enabled: true, host: 'ts6' }) },
  };
  app.locals.connectionPool = { getClient: () => ({ execute }) };
  app.use(authMiddleware);
  app.use('/servers/:configId/vs/:sid/dashboard', requireServerAccess(), dashboardRoutes);
  await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
async function request(id?: number, configId = 1) {
  return fetch(`${base}/servers/${configId}/vs/1/dashboard`, { headers: id ? {
    Authorization: `Bearer ${jwt.sign({ id, username: 'test' }, config.jwtSecret, { expiresIn: '1m' })}`,
  } : {} });
}
describe('Dashboard metrics integration', () => {
  it('does not scrape for unauthenticated or forbidden users', async () => {
    expect((await request()).status).toBe(401);
    expect((await request(2, 2)).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('uses metrics without Query commands and respects admin/viewer projection', async () => {
    expect(await (await request(1)).json()).toHaveProperty('instance');
    expect(await (await request(2)).json()).not.toHaveProperty('instance');
    expect(mocks.project).toHaveBeenLastCalledWith({}, 1, false);
    expect(execute).not.toHaveBeenCalled();
  });
  it('falls back to Query with a visible source when metrics fail', async () => {
    mocks.read.mockRejectedValue(new Error('unavailable'));
    const r = await request(1); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ source: 'query', metricsStatus: 'unavailable', serverName: 'Test' });
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it('does not scrape configurations without opt-in', async () => {
    mocks.port.mockReturnValue(null);
    expect(await (await request(1)).json()).toMatchObject({ source: 'query', metricsStatus: 'disabled' });
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
