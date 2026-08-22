import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { WebQueryClient } from '../ts-client/webquery-client.js';
import { decrypt } from '../utils/crypto.js';

export const channelRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};
const getSid = (req: Request) => parseInt(String(req.params.sid));

channelRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channellist', {
      '-topic': '', '-flags': '', '-voice': '', '-limits': '', '-icon': '', '-secondsempty': '', '-banners': '',
    });
    res.json(result);
  } catch (err) { next(err); }
});

channelRoutes.get('/:cid', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channelinfo', { cid: String(req.params.cid) });
    res.json(result);
  } catch (err) { next(err); }
});

channelRoutes.post('/', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channelcreate', req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

channelRoutes.put('/:cid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channeledit', { cid: String(req.params.cid), ...req.body });
    res.json(result);
  } catch (err) { next(err); }
});

channelRoutes.delete('/:cid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channeldelete', {
      cid: String(req.params.cid), force: req.query.force || 1,
    });
    res.json(result);
  } catch (err) { next(err); }
});

channelRoutes.post('/:cid/move', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channelmove', {
      cid: String(req.params.cid), ...req.body,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// Channel chat is tied to the Query client's current channel. Use a short-lived,
// isolated WebQuery connection so the panel's shared connection is never moved.
channelRoutes.post('/:cid/message', requireRole('admin'), async (req: Request, res: Response, next) => {
  let temporaryClient: WebQueryClient | null = null;
  try {
    const configId = parseInt(String(req.params.configId));
    const sid = getSid(req);
    const cid = parseInt(String(req.params.cid));
    const message = typeof req.body?.msg === 'string' ? req.body.msg.trim() : '';
    if (!Number.isInteger(cid) || cid <= 0) throw new AppError(400, 'A valid channel ID is required');
    if (!message) throw new AppError(400, 'Message is required');
    if (message.length > 1024) throw new AppError(400, 'Message must be 1024 characters or fewer');

    const config = await req.app.locals.prisma.tsServerConfig.findUnique({ where: { id: configId } });
    if (!config || !config.enabled) throw new AppError(404, 'Server config not found or disabled');

    temporaryClient = new WebQueryClient(
      config.host,
      config.webqueryPort,
      decrypt(config.apiKey),
      config.useHttps,
    );

    // Confirm the destination exists before moving this isolated Query client.
    await temporaryClient.execute(sid, 'channelinfo', { cid });
    const who = await temporaryClient.execute(sid, 'whoami');
    const identity = Array.isArray(who) ? who[0] : who;
    const clid = Number(identity?.client_id ?? identity?.clid ?? identity?.clientid);
    if (!Number.isInteger(clid) || clid <= 0) throw new AppError(502, 'Query client identity was not returned');

    try {
      await temporaryClient.execute(sid, 'clientupdate', { client_nickname: `TS6-Manager-Message-${cid}` });
    } catch { /* A duplicate nickname does not prevent message delivery. */ }
    await temporaryClient.execute(sid, 'clientmove', { clid, cid });
    await temporaryClient.execute(sid, 'sendtextmessage', { targetmode: 2, target: 0, msg: message });
    res.json({ success: true });
  } catch (err) { next(err); }
  finally { temporaryClient?.destroy(); }
});

channelRoutes.get('/:cid/permissions', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channelpermlist', {
      cid: String(req.params.cid), '-permsid': '',
    });
    res.json(result);
  } catch (err) { next(err); }
});

channelRoutes.put('/:cid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channeladdperm', {
      cid: String(req.params.cid), ...req.body,
    });
    res.json(result);
  } catch (err) { next(err); }
});

channelRoutes.delete('/:cid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'channeldelperm', {
      cid: String(req.params.cid), ...req.body,
    });
    res.json(result);
  } catch (err) { next(err); }
});
