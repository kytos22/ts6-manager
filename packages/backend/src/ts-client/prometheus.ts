import axios from 'axios';

export interface Sample { name: string; labels: Record<string, string>; value: number }
export interface Scrape { samples: Sample[]; at: number; cpuPercent: number | null }

// Prometheus text exposition: quoted labels may contain commas, braces and escapes.
export function parseMetrics(text: string): Sample[] {
  const samples: Sample[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_:][\w:]*)(?:\{((?:[^"\\]|"(?:[^"\\]|\\.)*")*)\})?\s+([^\s]+)(?:\s+\d+)?\s*$/);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    const labels: Record<string, string> = Object.create(null);
    const raw = match[2] || '';
    const labelPattern = /([a-zA-Z_][\w]*)="((?:[^"\\]|\\.)*)"(?:,\s*|$)/g;
    let label; let end = 0;
    while ((label = labelPattern.exec(raw))) {
      if (label.index !== end) break;
      labels[label[1]] = label[2].replace(/\\(\\|"|n)/g, (_, c) => c === 'n' ? '\n' : c);
      end = labelPattern.lastIndex;
    }
    if (end !== raw.length) continue;
    samples.push({ name: match[1], labels, value });
  }
  return samples;
}

const metric = (samples: Sample[], name: string, labels: Record<string, string> = {}) =>
  samples.find(s => s.name === name && Object.entries(labels).every(([k, v]) => s.labels[k] === v));
const val = (samples: Sample[], name: string, labels: Record<string, string> = {}) => metric(samples, name, labels)?.value ?? null;

export function cpuRate(previous: Scrape | undefined, samples: Sample[], at: number): number | null {
  if (!previous || at <= previous.at || at - previous.at > 60000) return null;
  if (val(previous.samples, 'process_start_time_seconds') !== val(samples, 'process_start_time_seconds')) return null;
  const a = val(previous.samples, 'process_cpu_seconds_total');
  const b = val(samples, 'process_cpu_seconds_total');
  return a !== null && b !== null && b >= a ? (b - a) / ((at - previous.at) / 1000) * 100 : null;
}

export function projectDashboard(scrape: Scrape, sid: number, admin: boolean) {
  const s = scrape.samples;
  const identity = metric(s, 'teamspeak_virtualserver_info', { virtualserver_id: String(sid) });
  if (!identity?.labels.virtualserver_unique_identifier) throw new Error('Virtual server absent from metrics');
  const labels = { virtualserver_unique_identifier: identity.labels.virtualserver_unique_identifier };
  const get = (name: string, extra: Record<string, string> = {}) => val(s, name, { ...labels, ...extra });
  const required = (name: string, extra: Record<string, string> = {}) => {
    const v = get(name, extra); if (v === null) throw new Error('Incomplete metrics'); return v;
  };
  const now = val(s, 'teamspeak_host_timestamp_seconds');
  const started = required('teamspeak_virtualserver_start_timestamp_seconds');
  if (now === null) throw new Error('Missing server clock');
  return {
    serverName: identity.labels.name, platform: identity.labels.platform, version: identity.labels.version,
    onlineUsers: Math.max(0, required('teamspeak_clients_online') - required('teamspeak_query_clients_online')),
    maxClients: required('teamspeak_max_clients'), channelCount: required('teamspeak_channels_online'),
    uptime: Math.max(0, now - started),
    status: metric(s, 'teamspeak_virtualserver_state', { ...labels, state: 'online' })?.value === 1 ? 'online' : 'offline',
    bandwidth: {
      incoming: required('teamspeak_connection_bandwidth_bytes_per_second', { direction: 'received' }),
      outgoing: required('teamspeak_connection_bandwidth_bytes_per_second', { direction: 'sent' }),
    },
    ping: required('teamspeak_ping_seconds') * 1000,
    packetloss: required('teamspeak_packetloss_ratio', { traffic_class: 'speech' }),
    packetlossKind: 'speech',
    source: 'prometheus', sampledAt: new Date(scrape.at).toISOString(),
    fileTransfer: {
      incoming: get('teamspeak_filetransfer_bandwidth_bytes_per_second', { direction: 'received' }),
      outgoing: get('teamspeak_filetransfer_bandwidth_bytes_per_second', { direction: 'sent' }),
    },
    // Instance data must never escape through a viewer's virtual-server dashboard.
    ...(admin ? { instance: {
      cpuPercent: scrape.cpuPercent, memoryBytes: val(s, 'process_resident_memory_bytes'),
      querySessions: val(s, 'teamspeak_query_sessions'),
      licenseValid: val(s, 'teamspeak_license_valid'),
      licenseExpires: val(s, 'teamspeak_license_expires_timestamp_seconds'),
    } } : {}),
  };
}

// Demand-driven only. Coalesce viewers and virtual servers sharing one instance.
export class MetricsReader {
  private cache = new Map<string, { at: number; data?: Scrape; pending?: Promise<Scrape>; failed?: boolean }>();
  async read(host: string, port: number): Promise<Scrape> {
    if (!/^[a-zA-Z0-9_.:[\]-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid metrics target');
    const key = `${host}:${port}`;
    const old = this.cache.get(key);
    if (old?.pending) return old.pending;
    if (old && Date.now() - old.at < 8000) {
      if (old.failed) throw new Error('Metrics unavailable');
      if (old.data) return old.data;
    }
    const entry: { at: number; data?: Scrape; pending?: Promise<Scrape>; failed?: boolean } = { at: Date.now(), data: old?.data };
    const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    entry.pending = (async () => {
      try {
        const response = await axios.get<string>(`http://${hostPart}:${port}/metrics`, {
          timeout: 2500, maxContentLength: 2 * 1024 * 1024, maxRedirects: 0, responseType: 'text', proxy: false,
        });
        const samples = parseMetrics(response.data);
        if (!metric(samples, 'teamspeak_build_info')) throw new Error('Not TeamSpeak metrics');
        const at = Date.now();
        entry.data = { samples, at, cpuPercent: cpuRate(old?.data, samples, at) };
        entry.at = at; entry.failed = false;
        return entry.data;
      } catch { entry.failed = true; entry.at = Date.now(); throw new Error('Metrics unavailable'); }
      finally { entry.pending = undefined; }
    })();
    this.cache.set(key, entry);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    return entry.pending;
  }
}

export function metricsPort(configId: number): number | null {
  // Operator-controlled allowlist, never a URL supplied by the browser.
  const ids = (process.env.TS_METRICS_CONFIG_IDS || '').split(',').map(x => x.trim());
  if (!ids.includes(String(configId))) return null;
  const port = Number(process.env.TS_METRICS_PORT || 9187);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}
