import { Router, Request, Response } from 'express';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { TSApiError } from '../middleware/error-handler.js';

export const logRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};
const getSid = (req: Request) => parseInt(String(req.params.sid));

logRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const parsedLines = Number(req.query.lines || 100);
    const requestedLines = Math.min(500, Math.max(1, Number.isFinite(parsedLines) ? Math.trunc(parsedLines) : 100));
    const result: Record<string, string>[] = [];
    let beginPos = req.query.begin_pos ? String(req.query.begin_pos) : undefined;
    let previousPos: string | undefined;

    while (result.length < requestedLines) {
      const pageSize = Math.min(100, requestedLines - result.length);
      let page: Record<string, string>[];
      try {
        page = await getClient(req).execute(getSid(req), 'logview', {
          lines: pageSize,
          reverse: req.query.reverse || 1,
          instance: req.query.instance || 0,
          begin_pos: beginPos,
        });
      } catch (err) {
        if (err instanceof TSApiError && err.code === 1281) break;
        throw err;
      }

      if (!Array.isArray(page) || page.length === 0) break;
      result.push(...page);

      const nextPos = page[0]?.last_pos;
      if (page.length < pageSize || !nextPos || nextPos === '0' || nextPos === previousPos) break;
      previousPos = nextPos;
      beginPos = nextPos;
    }

    res.json(result.slice(0, requestedLines));
  } catch (err) { next(err); }
});
