import { Router, Request, Response } from 'express';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { requireRole } from '../middleware/rbac.js';
import { TSApiError } from '../middleware/error-handler.js';

export const messageRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};
const getSid = (req: Request) => parseInt(String(req.params.sid));

messageRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'messagelist'));
  } catch (err) {
    if (err instanceof TSApiError && err.code === 1281) {
      return res.json([]);
    }
    next(err);
  }
});

messageRoutes.get('/:msgid', async (req: Request, res: Response, next) => {
  try { res.json(await getClient(req).execute(getSid(req), 'messageget', { msgid: String(req.params.msgid) })); } catch (err) { next(err); }
});

messageRoutes.patch('/:msgid/read', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await getClient(req).execute(getSid(req), 'messageupdateflag', {
      msgid: String(req.params.msgid),
      flag: req.body.read === false ? '0' : '1',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// M1: Write operations require admin role
messageRoutes.post('/', requireRole('admin'), async (req: Request, res: Response, next) => {
  try { res.status(201).json(await getClient(req).execute(getSid(req), 'messageadd', req.body)); } catch (err) { next(err); }
});

messageRoutes.delete('/:msgid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try { res.json(await getClient(req).execute(getSid(req), 'messagedel', { msgid: String(req.params.msgid) })); } catch (err) { next(err); }
});
