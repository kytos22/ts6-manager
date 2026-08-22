import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';

export const serverGroupRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};
const getSid = (req: Request) => parseInt(String(req.params.sid));

serverGroupRoutes.get('/', async (req: Request, res: Response, next) => {
  try { res.json(await getClient(req).execute(getSid(req), 'servergrouplist')); } catch (err) { next(err); }
});

serverGroupRoutes.post('/', requireRole('admin'), async (req: Request, res: Response, next) => {
  try { res.status(201).json(await getClient(req).execute(getSid(req), 'servergroupadd', req.body)); } catch (err) { next(err); }
});

serverGroupRoutes.put('/:sgid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergrouprename', { sgid: String(req.params.sgid), ...req.body }));
  } catch (err) { next(err); }
});

serverGroupRoutes.delete('/:sgid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergroupdel', { sgid: String(req.params.sgid), force: 1 }));
  } catch (err) { next(err); }
});

serverGroupRoutes.post('/:sgid/copy', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergroupcopy', { ssgid: String(req.params.sgid), ...req.body }));
  } catch (err) { next(err); }
});

serverGroupRoutes.get('/:sgid/members', async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergroupclientlist', { sgid: String(req.params.sgid), '-names': '' }));
  } catch (err) { next(err); }
});

serverGroupRoutes.post('/:sgid/members', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const sgid = Number(req.params.sgid);
    const cldbid = Number(req.body.cldbid);
    if (!Number.isInteger(sgid) || sgid <= 0 || !Number.isInteger(cldbid) || cldbid <= 0) {
      res.status(400).json({ error: 'Valid server group and client database IDs are required' });
      return;
    }

    const groups = await getClient(req).execute(getSid(req), 'servergrouplist');
    const group = Array.isArray(groups) ? groups.find((candidate: any) => Number(candidate.sgid) === sgid) : undefined;
    if (!group || Number(group.type) !== 1) {
      res.status(400).json({ error: 'Only regular server groups can be assigned to clients' });
      return;
    }

    res.json(await getClient(req).execute(getSid(req), 'servergroupaddclient', {
      sgid: String(sgid), cldbid: String(cldbid),
    }));
  } catch (err) { next(err); }
});

serverGroupRoutes.delete('/:sgid/members/:cldbid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergroupdelclient', { sgid: String(req.params.sgid), cldbid: String(req.params.cldbid) }));
  } catch (err) { next(err); }
});

serverGroupRoutes.get('/:sgid/permissions', async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergrouppermlist', { sgid: String(req.params.sgid), '-permsid': '' }));
  } catch (err) { next(err); }
});

serverGroupRoutes.put('/:sgid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergroupaddperm', { sgid: String(req.params.sgid), ...req.body }));
  } catch (err) { next(err); }
});

serverGroupRoutes.delete('/:sgid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    res.json(await getClient(req).execute(getSid(req), 'servergroupdelperm', { sgid: String(req.params.sgid), ...req.body }));
  } catch (err) { next(err); }
});
