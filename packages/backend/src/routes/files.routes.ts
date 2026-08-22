import { createHash } from 'node:crypto';
import net from 'node:net';
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError, TSApiError } from '../middleware/error-handler.js';
import { parseQueryResponse, tsEscape } from '@ts6/common';
import type { BotEngine } from '../bot-engine/engine.js';

export const fileRoutes: Router = Router({ mergeParams: true });

const getConfigId = (req: Request) => parseInt(String(req.params.configId));
const getSid = (req: Request) => parseInt(String(req.params.sid));

interface IconCacheEntry {
  data: Buffer;
  contentType: string;
  etag: string;
  verifiedAt: number;
}

const ICON_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ICON_BYTES = 1024 * 1024;
const MAX_CACHED_ICONS = 256;
const iconCache = new Map<string, IconCacheEntry>();
const iconDownloads = new Map<string, Promise<IconCacheEntry>>();
let nextClientTransferId = 1;

const allocateClientTransferId = () => {
  const id = nextClientTransferId;
  nextClientTransferId = nextClientTransferId >= 65535 ? 1 : nextClientTransferId + 1;
  return id;
};

/**
 * Execute a ServerQuery command via the shared SSH connection (EventBridge).
 * Reuses the same SSH session used for bot events — no extra server slots.
 */
async function sshExecute(
  req: Request,
  command: string,
  params: Record<string, string>,
): Promise<Record<string, string>[]> {
  const engine: BotEngine = req.app.locals.botEngine;
  if (!engine) throw new AppError(503, 'Bot engine not available');

  const bridge = engine.getEventBridge();
  const configId = getConfigId(req);
  const sid = getSid(req);

  // Build raw ServerQuery command string
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${tsEscape(v)}`)
    .join(' ');
  const fullCommand = paramStr ? `${command} ${paramStr}` : command;

  let rawResponse: string;
  try {
    rawResponse = await bridge.executeCommand(configId, sid, fullCommand);
  } catch (err: any) {
    // Convert "TS error {code}: {msg}" to TSApiError
    const match = err.message?.match(/^TS error (\d+): (.+)$/);
    if (match) {
      throw new TSApiError(parseInt(match[1]), match[2]);
    }
    throw err;
  }

  if (!rawResponse.trim()) return [];
  return parseQueryResponse(rawResponse);
}

function normalizeIconId(rawValue: string): string {
  if (!/^-?\d+$/.test(rawValue)) {
    throw new AppError(400, 'Invalid TeamSpeak icon ID');
  }

  let value = BigInt(rawValue);
  if (value < 0) value += 4294967296n;
  if (value <= 0 || value > 4294967295n) {
    throw new AppError(400, 'Invalid TeamSpeak icon ID');
  }
  return value.toString();
}

function detectImageType(data: Buffer): string {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 6 && (data.subarray(0, 6).toString('ascii') === 'GIF87a' || data.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return 'image/gif';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (data.length >= 2 && data.subarray(0, 2).toString('ascii') === 'BM') {
    return 'image/bmp';
  }
  throw new AppError(415, 'The TeamSpeak icon is not a supported image');
}

function downloadTransfer(host: string, port: number, ftkey: string, expectedSize: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const socket = net.createConnection({ host, port });

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(Buffer.concat(chunks, received));
    };

    socket.setTimeout(10000);
    socket.once('connect', () => socket.write(ftkey));
    socket.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > expectedSize || received > MAX_ICON_BYTES) {
        return finish(new AppError(502, 'TeamSpeak returned an oversized icon'));
      }
      chunks.push(chunk);
      if (received === expectedSize) finish();
    });
    socket.once('end', () => {
      if (received !== expectedSize) {
        finish(new AppError(502, `Incomplete TeamSpeak icon download (${received}/${expectedSize} bytes)`));
      } else {
        finish();
      }
    });
    socket.once('timeout', () => finish(new AppError(504, 'TeamSpeak icon download timed out')));
    socket.once('error', (err) => finish(err));
  });
}

function uploadTransfer(host: string, port: number, ftkey: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.createConnection({ host, port });
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(15000);
    socket.once('connect', () => {
      socket.write(ftkey, (keyError) => {
        if (keyError) return finish(keyError);
        socket.end(data);
      });
    });
    socket.once('close', (hadError) => {
      if (!hadError) finish();
    });
    socket.once('timeout', () => finish(new AppError(504, 'TeamSpeak icon upload timed out')));
    socket.once('error', (err) => finish(err));
  });
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function getTransferHost(req: Request, transferIp?: string): Promise<string> {
  if (transferIp) return transferIp;
  const prisma = req.app.locals.prisma;
  const config = await prisma.tsServerConfig.findUnique({
    where: { id: getConfigId(req) },
    select: { host: true },
  });
  if (!config) throw new AppError(404, 'Server configuration not found');
  return config.host;
}

async function fetchIcon(req: Request, iconId: string): Promise<IconCacheEntry> {
  const transfer = (await sshExecute(req, 'ftinitdownload', {
    clientftfid: String(allocateClientTransferId()),
    name: `/icon_${iconId}`,
    cid: '0',
    cpw: '',
    seekpos: '0',
  }))[0];

  if (!transfer?.ftkey || !transfer.port || !transfer.size) {
    throw new AppError(502, 'TeamSpeak did not provide icon transfer details');
  }
  if (transfer.ftkey.length !== 32) {
    throw new AppError(502, 'TeamSpeak provided an invalid transfer key');
  }

  const port = Number(transfer.port);
  const size = Number(transfer.size);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(size) || size < 1 || size > MAX_ICON_BYTES) {
    throw new AppError(502, 'TeamSpeak provided invalid icon transfer details');
  }

  const data = await downloadTransfer(await getTransferHost(req, transfer.ip), port, transfer.ftkey, size);
  const contentType = detectImageType(data);
  const digest = createHash('sha256').update(data).digest('base64url');
  return {
    data,
    contentType,
    etag: `"${digest}"`,
    verifiedAt: Date.now(),
  };
}

fileRoutes.get('/icons', async (req: Request, res: Response, next) => {
  try {
    const files = await sshExecute(req, 'ftgetfilelist', { cid: '0', cpw: '', path: '/icons' });
    const icons = files
      .filter((file) => file.type === '1' && /^icon_\d+$/.test(file.name || ''))
      .map((file) => ({
        id: file.name.slice(5),
        name: file.name,
        size: Number(file.size) || 0,
        datetime: Number(file.datetime) || 0,
      }))
      .sort((a, b) => b.datetime - a.datetime || a.id.localeCompare(b.id));
    res.json(icons);
  } catch (err: any) {
    if (err instanceof TSApiError && err.code === 1281) return res.json([]);
    next(err);
  }
});

fileRoutes.post('/icons', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const encoded = String(req.body.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new AppError(400, 'A valid base64 encoded image is required');
    }
    const data = Buffer.from(encoded, 'base64');
    if (data.length < 1 || data.length > MAX_ICON_BYTES) {
      throw new AppError(400, 'The icon must be between 1 byte and 1 MB');
    }
    const contentType = detectImageType(data);
    const iconId = crc32(data);
    if (iconId <= 1000) {
      throw new AppError(400, 'This image produced a reserved TeamSpeak icon ID; modify it slightly and try again');
    }

    const transfer = (await sshExecute(req, 'ftinitupload', {
      clientftfid: String(allocateClientTransferId()),
      name: `/icon_${iconId}`,
      cid: '0',
      cpw: '',
      size: String(data.length),
      overwrite: '1',
      resume: '0',
    }))[0];
    if (!transfer?.ftkey || !transfer.port || transfer.ftkey.length !== 32) {
      throw new AppError(502, 'TeamSpeak did not provide valid icon upload details');
    }
    const port = Number(transfer.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new AppError(502, 'TeamSpeak provided an invalid upload port');
    }

    await uploadTransfer(await getTransferHost(req, transfer.ip), port, transfer.ftkey, data);
    const digest = createHash('sha256').update(data).digest('base64url');
    const cacheKey = `${getConfigId(req)}:${getSid(req)}:${iconId}`;
    iconCache.set(cacheKey, {
      data,
      contentType,
      etag: `"${digest}"`,
      verifiedAt: Date.now(),
    });
    res.status(201).json({ id: String(iconId), size: data.length, contentType });
  } catch (err) { next(err); }
});

fileRoutes.post('/icons/assign', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const targetType = String(req.body.targetType || '');
    const rawIconId = String(req.body.iconId ?? '');
    const iconId = rawIconId === '0' ? '0' : normalizeIconId(rawIconId);
    const targetId = Number(req.body.targetId);
    if (targetType !== 'server' && (!Number.isInteger(targetId) || targetId <= 0)) {
      throw new AppError(400, 'A valid target ID is required');
    }

    if (targetType === 'server') {
      await sshExecute(req, 'serveredit', { virtualserver_icon_id: iconId });
    } else if (targetType === 'channel') {
      await sshExecute(req, 'channeledit', { cid: String(targetId), channel_icon_id: iconId });
    } else if (['serverGroup', 'channelGroup', 'client'].includes(targetType)) {
      const permission = (await sshExecute(req, 'permidgetbyname', { permsid: 'i_icon_id' }))[0];
      if (!permission?.permid) throw new AppError(502, 'TeamSpeak did not resolve the icon permission');
      const idField = targetType === 'serverGroup' ? 'sgid' : targetType === 'channelGroup' ? 'cgid' : 'cldbid';
      const addCommand = targetType === 'serverGroup'
        ? 'servergroupaddperm'
        : targetType === 'channelGroup' ? 'channelgroupaddperm' : 'clientaddperm';
      const deleteCommand = targetType === 'serverGroup'
        ? 'servergroupdelperm'
        : targetType === 'channelGroup' ? 'channelgroupdelperm' : 'clientdelperm';
      if (iconId === '0') {
        try {
          await sshExecute(req, deleteCommand, { [idField]: String(targetId), permid: permission.permid });
        } catch (err) {
          if (!(err instanceof TSApiError) || err.code !== 1281) throw err;
        }
      } else {
        const unsigned = BigInt(iconId);
        const signed = unsigned > 2147483647n ? unsigned - 4294967296n : unsigned;
        await sshExecute(req, addCommand, {
          [idField]: String(targetId),
          permid: permission.permid,
          permvalue: signed.toString(),
          permnegated: '0',
          permskip: '0',
        });
      }
    } else {
      throw new AppError(400, 'Invalid icon assignment target');
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

fileRoutes.delete('/icons/:iconId', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const iconId = normalizeIconId(String(req.params.iconId));
    await sshExecute(req, 'ftdeletefile', { cid: '0', cpw: '', name: `/icon_${iconId}` });
    iconCache.delete(`${getConfigId(req)}:${getSid(req)}:${iconId}`);
    res.status(204).send();
  } catch (err) { next(err); }
});

fileRoutes.get('/icon/:iconId', async (req: Request, res: Response, next) => {
  try {
    const iconId = normalizeIconId(String(req.params.iconId));
    const cacheKey = `${getConfigId(req)}:${getSid(req)}:${iconId}`;
    let entry = iconCache.get(cacheKey);

    if (!entry || Date.now() - entry.verifiedAt >= ICON_CACHE_TTL_MS) {
      let pending = iconDownloads.get(cacheKey);
      if (!pending) {
        pending = fetchIcon(req, iconId).finally(() => iconDownloads.delete(cacheKey));
        iconDownloads.set(cacheKey, pending);
      }
      entry = await pending;
      iconCache.delete(cacheKey);
      iconCache.set(cacheKey, entry);
      while (iconCache.size > MAX_CACHED_ICONS) {
        const oldestKey = iconCache.keys().next().value;
        if (oldestKey === undefined) break;
        iconCache.delete(oldestKey);
      }
    }

    res.set({
      'Content-Type': entry.contentType,
      'Content-Length': String(entry.data.length),
      'Cache-Control': 'private, max-age=300, must-revalidate',
      ETag: entry.etag,
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
    res.send(entry.data);
  } catch (err: any) {
    if (err instanceof TSApiError && err.code === 1281) {
      return next(new AppError(404, 'TeamSpeak icon not found'));
    }
    next(err);
  }
});

// List files in a channel directory
// Uses shared SSH connection because ft* commands are not supported via WebQuery HTTP
fileRoutes.get('/:cid', async (req: Request, res: Response, next) => {
  try {
    const result = await sshExecute(req, 'ftgetfilelist', {
      cid: String(req.params.cid),
      cpw: String(req.query.cpw || ''),
      path: String(req.query.path || '/'),
    });
    res.json(result);
  } catch (err: any) {
    // TS3 error 1281 = database_empty_result → empty directory
    if (err instanceof TSApiError && err.code === 1281) {
      return res.json([]);
    }
    if (err.message?.includes('SSH not connected') || err.message?.includes('SSH credentials')) {
      return next(new AppError(400, 'SSH credentials not configured for this server. File browsing requires SSH access because WebQuery HTTP does not support ft* commands.'));
    }
    next(err);
  }
});

// Create directory
fileRoutes.post('/:cid/mkdir', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await sshExecute(req, 'ftcreatedir', {
      cid: String(req.params.cid),
      cpw: '',
      dirname: req.body.dirname,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// Delete file
fileRoutes.delete('/:cid/file', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const result = await sshExecute(req, 'ftdeletefile', {
      cid: String(req.params.cid),
      cpw: '',
      name: req.body.name,
    });
    res.json(result);
  } catch (err) { next(err); }
});
