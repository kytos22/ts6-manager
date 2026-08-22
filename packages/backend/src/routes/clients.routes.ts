import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { TSApiError } from '../middleware/error-handler.js';

export const clientRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};
const getSid = (req: Request) => parseInt(String(req.params.sid));

clientRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    // M2: Only include -ip flag for admin users
    const flags: Record<string, string> = {
      '-uid': '', '-away': '', '-voice': '', '-times': '', '-groups': '', '-info': '', '-country': '',
    };
    if (req.user?.role === 'admin') {
      flags['-ip'] = '';
    }
    const result = await getClient(req).execute(getSid(req), 'clientlist', flags);
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.get('/database', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'clientdblist', {
      start: req.query.start || 0, duration: req.query.duration || 100,
    });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.get('/database/:cldbid', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'clientdbinfo', { cldbid: String(req.params.cldbid) });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.get('/:clid', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'clientinfo', { clid: String(req.params.clid) });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.put('/:clid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const clid = Number(req.params.clid);
    const cldbid = Number(req.body.cldbid);
    if (!Number.isInteger(clid) || clid <= 0 || !Number.isInteger(cldbid) || cldbid <= 0) {
      res.status(400).json({ error: 'Valid client and database IDs are required' });
      return;
    }

    const hasDescription = Object.prototype.hasOwnProperty.call(req.body, 'client_description');
    const hasTalker = Object.prototype.hasOwnProperty.call(req.body, 'client_is_talker');
    if (!hasDescription && !hasTalker) {
      res.status(400).json({ error: 'No supported client fields were provided' });
      return;
    }

    if (hasDescription) {
      const description = String(req.body.client_description ?? '');
      if (description.length > 200) {
        res.status(400).json({ error: 'Client description must be 200 characters or fewer' });
        return;
      }
      await getClient(req).execute(getSid(req), 'clientdbedit', {
        cldbid: String(cldbid), client_description: description,
      });
    }

    if (hasTalker) {
      const talker = Number(req.body.client_is_talker);
      if (talker !== 0 && talker !== 1) {
        res.status(400).json({ error: 'Talker must be either 0 or 1' });
        return;
      }
      await getClient(req).execute(getSid(req), 'clientedit', {
        clid: String(clid), client_is_talker: String(talker),
      });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

clientRoutes.post('/:clid/kick', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const clid = Number(req.params.clid);
    const reasonid = Number(req.body.reasonid ?? 5);
    if (!Number.isInteger(clid) || clid <= 0 || ![4, 5].includes(reasonid)) {
      res.status(400).json({ error: 'A valid connected client and kick type are required' });
      return;
    }
    const result = await getClient(req).execute(getSid(req), 'clientkick', {
      clid: String(clid), reasonid: String(reasonid), reasonmsg: req.body.reasonmsg,
    });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.post('/:clid/ban', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'banclient', {
      clid: String(req.params.clid), time: req.body.time || 0, banreason: req.body.banreason,
    });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.post('/:clid/move', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'clientmove', {
      clid: String(req.params.clid), cid: req.body.cid, cpw: req.body.cpw,
    });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.post('/:clid/poke', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'clientpoke', {
      clid: String(req.params.clid), msg: req.body.msg,
    });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.post('/:clid/message', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'sendtextmessage', {
      targetmode: 1, target: String(req.params.clid), msg: req.body.msg,
    });
    res.json(result);
  } catch (err) { next(err); }
});

clientRoutes.get('/:cldbid/permissions', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'clientpermlist', {
      cldbid: String(req.params.cldbid), '-permsid': '',
    });
    res.json(result);
  } catch (err) {
    // TS3 error 1281 = database_empty_result → client has no permissions yet
    if (err instanceof TSApiError && err.code === 1281) {
      res.json([]);
      return;
    }
    next(err);
  }
});

clientRoutes.put('/:cldbid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const cldbid = String(req.params.cldbid);
    const { permsid, permvalue, permnegated, permskip } = req.body;
    // Resolve permission name to numeric ID
    const permLookup = await getClient(req).execute(getSid(req), 'permidgetbyname', { permsid });
    const permid = permLookup?.[0]?.permid;
    if (!permid) throw new Error(`Unknown permission: ${permsid}`);
    await getClient(req).executePost(getSid(req), 'clientaddperm', {
      cldbid, permid: String(permid), permvalue: String(permvalue ?? 0),
      permnegated: String(permnegated ?? 0), permskip: String(permskip ?? 0),
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

clientRoutes.delete('/:cldbid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const cldbid = String(req.params.cldbid);
    const { permsid } = req.body;
    const permLookup = await getClient(req).execute(getSid(req), 'permidgetbyname', { permsid });
    const permid = permLookup?.[0]?.permid;
    if (!permid) throw new Error(`Unknown permission: ${permsid}`);
    await getClient(req).executePost(getSid(req), 'clientdelperm', {
      cldbid, permid: String(permid),
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

clientRoutes.get('/:clid/groups', async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'servergroupsbyclientid', {
      cldbid: String(req.params.clid),
    });
    res.json(result);
  } catch (err) { next(err); }
});
