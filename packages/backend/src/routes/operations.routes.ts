import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError, TSApiError } from '../middleware/error-handler.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { encrypt, decrypt } from '../utils/crypto.js';

export const operationsRoutes: Router = Router({ mergeParams: true });
operationsRoutes.use(requireRole('admin'));

const ids = (req: Request) => ({
  configId: parseInt(String(req.params.configId)),
  sid: parseInt(String(req.query.sid ?? req.body?.sid ?? 0)),
});
const client = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(ids(req).configId);
};
const one = (value: any) => Array.isArray(value) ? value[0] : value;
const validSid = (sid: number) => {
  if (!Number.isInteger(sid) || sid <= 0) throw new AppError(400, 'A valid virtual server ID is required');
};
const listOrEmpty = async (operation: () => Promise<any>) => {
  try { return await operation(); }
  catch (error) {
    // TeamSpeak uses 1281 (database empty result set) for a successful empty list.
    if (error instanceof TSApiError && error.code === 1281) return [];
    throw error;
  }
};

// Temporary passwords
operationsRoutes.get('/temporary-passwords', async (req, res, next) => {
  try {
    const { sid } = ids(req); validSid(sid);
    res.json(await listOrEmpty(() => client(req).execute(sid, 'servertemppasswordlist')));
  } catch (error) { next(error); }
});

operationsRoutes.post('/temporary-passwords', async (req, res, next) => {
  try {
    const { sid } = ids(req); validSid(sid);
    const pw = typeof req.body.pw === 'string' ? req.body.pw : '';
    const desc = typeof req.body.desc === 'string' ? req.body.desc.trim() : '';
    const duration = Number(req.body.duration);
    const tcid = Number(req.body.tcid || 0);
    const tcpw = typeof req.body.tcpw === 'string' ? req.body.tcpw : '';
    if (!pw || pw.length > 128) throw new AppError(400, 'Password is required and must be 128 characters or fewer');
    if (!Number.isInteger(duration) || duration < 60 || duration > 31_536_000) throw new AppError(400, 'Duration must be between 60 seconds and 365 days');
    if (!Number.isInteger(tcid) || tcid < 0) throw new AppError(400, 'Invalid destination channel');
    await client(req).execute(sid, 'servertemppasswordadd', { pw, desc: desc.slice(0, 200), duration, tcid, tcpw });
    res.status(201).json({ success: true });
  } catch (error) { next(error); }
});

operationsRoutes.delete('/temporary-passwords', async (req, res, next) => {
  try {
    const { sid } = ids(req); validSid(sid);
    const pw = typeof req.body?.pw === 'string' ? req.body.pw : '';
    if (!pw) throw new AppError(400, 'Password is required');
    await client(req).execute(sid, 'servertemppassworddel', { pw });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// Encrypted local snapshot library
operationsRoutes.get('/snapshots', async (req, res, next) => {
  try {
    const { configId, sid } = ids(req); validSid(sid);
    const rows = await req.app.locals.prisma.serverSnapshot.findMany({
      where: { serverConfigId: configId, virtualServerId: sid },
      select: { id: true, name: true, sizeBytes: true, createdByName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (error) { next(error); }
});

operationsRoutes.post('/snapshots', async (req, res, next) => {
  try {
    const { configId, sid } = ids(req); validSid(sid);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!name || name.length > 100) throw new AppError(400, 'Snapshot name is required and must be 100 characters or fewer');
    const raw = await client(req).execute(sid, 'serversnapshotcreate', password ? { password } : undefined);
    const payload = one(raw);
    if (!payload?.data || !payload?.version) throw new AppError(502, 'TeamSpeak returned an invalid snapshot');
    const serialized = JSON.stringify(payload);
    const row = await req.app.locals.prisma.serverSnapshot.create({
      data: {
        name,
        serverConfigId: configId,
        virtualServerId: sid,
        encryptedData: encrypt(serialized),
        sizeBytes: Buffer.byteLength(serialized),
        createdById: Number((req.user as any)?.id) || null,
        createdByName: (req.user as any)?.username || null,
      },
      select: { id: true, name: true, sizeBytes: true, createdAt: true },
    });
    res.status(201).json(row);
  } catch (error) { next(error); }
});

operationsRoutes.post('/snapshots/:snapshotId/restore', async (req, res, next) => {
  try {
    const { configId, sid } = ids(req); validSid(sid);
    if (req.body.confirmation !== 'RESTORE') throw new AppError(400, 'Type RESTORE to confirm');
    const snapshotId = Number(req.params.snapshotId);
    const row = await req.app.locals.prisma.serverSnapshot.findFirst({
      where: { id: snapshotId, serverConfigId: configId, virtualServerId: sid },
    });
    if (!row) throw new AppError(404, 'Snapshot not found');
    const payload = JSON.parse(decrypt(row.encryptedData));
    const params: Record<string, any> = { ...payload };
    if (req.body.keepFiles !== false) params['-keepfiles'] = '';
    if (typeof req.body.password === 'string' && req.body.password) params.password = req.body.password;
    const result = await client(req).executePost(sid, 'serversnapshotdeploy', params);
    res.json({ success: true, mapping: result });
  } catch (error) { next(error); }
});

operationsRoutes.delete('/snapshots/:snapshotId', async (req, res, next) => {
  try {
    const { configId, sid } = ids(req); validSid(sid);
    const result = await req.app.locals.prisma.serverSnapshot.deleteMany({
      where: { id: Number(req.params.snapshotId), serverConfigId: configId, virtualServerId: sid },
    });
    if (!result.count) throw new AppError(404, 'Snapshot not found');
    res.json({ success: true });
  } catch (error) { next(error); }
});

// WebQuery API keys
operationsRoutes.get('/api-keys', async (req, res, next) => {
  try {
    const { sid } = ids(req);
    res.json(await listOrEmpty(() => client(req).execute(sid > 0 ? sid : 0, 'apikeylist', { cldbid: '*' })));
  } catch (error) { next(error); }
});

operationsRoutes.post('/api-keys', async (req, res, next) => {
  try {
    const { sid } = ids(req);
    const scope = String(req.body.scope || 'read');
    const lifetime = Number(req.body.lifetime ?? 14);
    const cldbid = req.body.cldbid === '' || req.body.cldbid == null ? undefined : Number(req.body.cldbid);
    if (!['read', 'write', 'manage'].includes(scope)) throw new AppError(400, 'Invalid API key scope');
    if (!Number.isInteger(lifetime) || lifetime < 0 || lifetime > 3650) throw new AppError(400, 'Lifetime must be between 0 and 3650 days');
    if (cldbid !== undefined && (!Number.isInteger(cldbid) || cldbid <= 0)) throw new AppError(400, 'Invalid owner database ID');
    res.status(201).json(await client(req).execute(sid > 0 ? sid : 0, 'apikeyadd', { scope, lifetime, cldbid }));
  } catch (error) { next(error); }
});

operationsRoutes.delete('/api-keys/:keyId', async (req, res, next) => {
  try {
    const { sid } = ids(req);
    await client(req).execute(sid > 0 ? sid : 0, 'apikeydel', { id: Number(req.params.keyId) });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// SSH ServerQuery logins
operationsRoutes.get('/query-logins', async (req, res, next) => {
  try {
    const { sid } = ids(req);
    res.json(await listOrEmpty(() => client(req).execute(sid > 0 ? sid : 0, 'queryloginlist', { '-count': '' })));
  } catch (error) { next(error); }
});

operationsRoutes.post('/query-logins', async (req, res, next) => {
  try {
    const { sid } = ids(req);
    const name = typeof req.body.client_login_name === 'string' ? req.body.client_login_name.trim() : '';
    const cldbid = req.body.cldbid === '' || req.body.cldbid == null ? undefined : Number(req.body.cldbid);
    if (!name || name.length > 64 || !/^[A-Za-z0-9_.-]+$/.test(name)) throw new AppError(400, 'Login name may contain letters, numbers, dot, underscore and hyphen');
    if (sid > 0 && (!Number.isInteger(cldbid) || Number(cldbid) <= 0)) throw new AppError(400, 'Client database ID is required for a virtual-server login');
    res.status(201).json(await client(req).execute(sid > 0 ? sid : 0, 'queryloginadd', { client_login_name: name, cldbid }));
  } catch (error) { next(error); }
});

operationsRoutes.delete('/query-logins/:cldbid', async (req, res, next) => {
  try {
    const { sid } = ids(req);
    await client(req).execute(sid > 0 ? sid : 0, 'querylogindel', { cldbid: Number(req.params.cldbid) });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// Unified operational status. Opening this page also establishes the existing
// event bridge when SSH credentials are configured, enabling the live feed.
operationsRoutes.get('/health', async (req, res, next) => {
  try {
    const { configId, sid } = ids(req); validSid(sid);
    const checks: any[] = [];
    let serverInfo: any = null;
    try {
      const version = one(await client(req).execute(0, 'version'));
      checks.push({ id: 'webquery', label: 'WebQuery', status: 'ok', detail: version?.version || 'Connected' });
    } catch (error: any) { checks.push({ id: 'webquery', label: 'WebQuery', status: 'error', detail: error.message }); }
    try {
      serverInfo = one(await client(req).execute(sid, 'serverinfo'));
      checks.push({ id: 'virtual-server', label: 'Virtual server', status: 'ok', detail: serverInfo?.virtualserver_status || 'Online' });
    } catch (error: any) { checks.push({ id: 'virtual-server', label: 'Virtual server', status: 'error', detail: error.message }); }
    try {
      await req.app.locals.prisma.$queryRawUnsafe('SELECT 1');
      checks.push({ id: 'database', label: 'Panel database', status: 'ok', detail: 'Available' });
    } catch (error: any) { checks.push({ id: 'database', label: 'Panel database', status: 'error', detail: error.message }); }

    const config = await req.app.locals.prisma.tsServerConfig.findUnique({ where: { id: configId } });
    const bridge = req.app.locals.botEngine?.getEventBridge?.();
    if (!config?.sshUsername || !config.sshPassword) {
      checks.push({ id: 'ssh-query', label: 'SSH Query events', status: 'warning', detail: 'Credentials not configured' });
    } else {
      if (!bridge?.isConnected(configId, sid)) {
        try { await bridge?.connectServer(configId, sid); } catch { /* reflected below */ }
      }
      checks.push({ id: 'ssh-query', label: 'SSH Query events', status: bridge?.isConnected(configId, sid) ? 'ok' : 'error', detail: bridge?.isConnected(configId, sid) ? 'Connected' : 'Disconnected' });
    }

    const alerts: any[] = checks.filter((check) => check.status !== 'ok').map((check) => ({ level: check.status, message: `${check.label}: ${check.detail}` }));
    if (serverInfo) {
      const online = Math.max(0, Number(serverInfo.virtualserver_clientsonline || 0) - Number(serverInfo.virtualserver_queryclientsonline || 0));
      const max = Number(serverInfo.virtualserver_maxclients || 0);
      if (max > 0 && online / max >= 0.9) alerts.push({ level: 'warning', message: `Client capacity is at ${Math.round(online / max * 100)}%` });
      const loss = Number(serverInfo.virtualserver_total_packetloss_total || 0);
      if (loss >= 0.05) alerts.push({ level: 'warning', message: `Packet loss is ${(loss * 100).toFixed(2)}%` });
    }
    res.json({ checkedAt: new Date().toISOString(), checks, alerts });
  } catch (error) { next(error); }
});

operationsRoutes.get('/audit', async (req, res, next) => {
  try {
    const { configId } = ids(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(await req.app.locals.prisma.auditLog.findMany({
      where: { OR: [{ serverConfigId: configId }, { serverConfigId: null }] },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }));
  } catch (error) { next(error); }
});
