import { Router, Request, Response } from 'express';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { MetricsReader, metricsPort, projectDashboard } from '../ts-client/prometheus.js';

export const dashboardRoutes: Router = Router({ mergeParams: true });
const metrics = new MetricsReader();

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};

dashboardRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const sid = parseInt(String(req.params.sid));
    const configId = Number(req.params.configId);
    if (!Number.isInteger(sid) || sid <= 0) { res.status(400).json({ error: 'Invalid virtual server ID' }); return; }
    const port = metricsPort(configId);
    if (port !== null) {
      try {
        const server = await req.app.locals.prisma.tsServerConfig.findUnique({ where: { id: configId } });
        if (!server?.enabled) throw new Error('Server disabled');
        const scrape = await metrics.read(server.host, port);
        res.json(projectDashboard(scrape, sid, req.user?.role === 'admin'));
        return;
      } catch { /* Query fallback; never present stale metrics as current. */ }
    }
    const client = getClient(req);

    const [serverInfo, clientList, channelList, connectionInfo] = await Promise.all([
      client.execute(sid, 'serverinfo'),
      client.execute(sid, 'clientlist'),
      client.execute(sid, 'channellist'),
      client.execute(sid, 'serverrequestconnectioninfo'),
    ]);

    const info = Array.isArray(serverInfo) ? serverInfo[0] : serverInfo;
    const connInfo = Array.isArray(connectionInfo) ? connectionInfo[0] : connectionInfo;
    const clients = Array.isArray(clientList) ? clientList : [];
    const channels = Array.isArray(channelList) ? channelList : [];

    const onlineClients = clients.filter((c: any) => String(c.client_type) === '0');

    res.json({
      source: 'query', metricsStatus: port === null ? 'disabled' : 'unavailable',
      sampledAt: new Date().toISOString(), status: info.virtualserver_status || 'online',
      serverName: info.virtualserver_name,
      platform: info.virtualserver_platform,
      version: info.virtualserver_version,
      onlineUsers: onlineClients.length,
      maxClients: Number(info.virtualserver_maxclients) || 0,
      uptime: Number(info.virtualserver_uptime) || 0,
      channelCount: channels.length,
      bandwidth: {
        incoming: Number(connInfo.connection_bandwidth_received_last_second_total) || 0,
        outgoing: Number(connInfo.connection_bandwidth_sent_last_second_total) || 0,
      },
      packetloss: Number(info.virtualserver_total_packetloss_total) || 0,
      ping: Number(info.virtualserver_total_ping) || 0,
    });
  } catch (err) { next(err); }
});
