import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { parseMetrics, projectDashboard, cpuRate, MetricsReader, metricsPort, type Scrape } from './prometheus.js';
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
const fixture = (uid = 'one', sid = 1) => `
teamspeak_build_info{version="6.0.0-beta13"} 1
teamspeak_virtualserver_info{virtualserver_id="${sid}",virtualserver_unique_identifier="${uid}",name="A, {B}",platform="Linux"} 1
teamspeak_host_timestamp_seconds 100
teamspeak_virtualserver_start_timestamp_seconds{virtualserver_unique_identifier="${uid}"} 50
teamspeak_virtualserver_state{virtualserver_unique_identifier="${uid}",state="online"} 1
teamspeak_clients_online{virtualserver_unique_identifier="${uid}"} 7
teamspeak_query_clients_online{virtualserver_unique_identifier="${uid}"} 2
teamspeak_max_clients{virtualserver_unique_identifier="${uid}"} 32
teamspeak_channels_online{virtualserver_unique_identifier="${uid}"} 46
teamspeak_connection_bandwidth_bytes_per_second{virtualserver_unique_identifier="${uid}",direction="received"} 123
teamspeak_connection_bandwidth_bytes_per_second{virtualserver_unique_identifier="${uid}",direction="sent"} 456
teamspeak_packetloss_ratio{virtualserver_unique_identifier="${uid}",traffic_class="speech"} 0.01
teamspeak_ping_seconds{virtualserver_unique_identifier="${uid}"} 0.023
process_cpu_seconds_total 12
process_start_time_seconds 1
process_resident_memory_bytes 1024
`;
const scrape = (text = fixture(), at = 10000): Scrape => ({ samples: parseMetrics(text), at, cpuPercent: null });
beforeEach(() => { vi.restoreAllMocks(); vi.mocked(axios.get).mockReset(); });
describe('Prometheus parser and virtual-server projection', () => {
  it('handles quoted commas/braces, escapes, exponent and optional timestamp', () => {
    const s = parseMetrics('# HELP a text\na{x="a, {b}\\n\\\"c\\\\"} 1.2e3 123\nb NaN\nc +Inf\ninvalid !');
    expect(s).toEqual([{ name: 'a', labels: { x: 'a, {b}\n"c\\' }, value: 1200 }]);
  });
  it('maps UID rather than assuming every series contains sid; converts units', () => {
    const d = projectDashboard(scrape(fixture('other', 2) + fixture()), 1, false);
    expect(d.onlineUsers).toBe(5); expect(d.ping).toBe(23); expect(d.packetloss).toBe(0.01);
    expect(d.bandwidth).toEqual({ incoming: 123, outgoing: 456 }); expect(d.uptime).toBe(50);
    expect(d).not.toHaveProperty('instance'); expect(JSON.stringify(d)).not.toContain('other');
  });
  it('exposes process figures only for administrators', () => {
    expect(projectDashboard(scrape(), 1, true).instance?.memoryBytes).toBe(1024);
  });
  it('rejects absent virtual servers and incomplete samples instead of substituting zeros', () => {
    expect(() => projectDashboard(scrape(), 9, true)).toThrow();
    expect(() => projectDashboard(scrape(fixture().replace(/teamspeak_ping_seconds[^\n]+/, '')), 1, false)).toThrow();
  });
  it('ignores non-finite values and malformed labels', () => {
    expect(parseMetrics('x{broken} 1\ny{a="b",oops} 2\nz NaN')).toEqual([]);
  });
});
describe('CPU rates', () => {
  it('uses elapsed sample time; permits more than one core', () => {
    expect(cpuRate(scrape(), scrape(fixture().replace('total 12', 'total 27')).samples, 20000)).toBe(150);
  });
  it('omits first sample, restart, counter reset, long gap and duplicate time', () => {
    const a = scrape();
    expect(cpuRate(undefined, a.samples, 20000)).toBeNull();
    expect(cpuRate(a, scrape(fixture().replace('seconds 1\n', 'seconds 2\n')).samples, 20000)).toBeNull();
    expect(cpuRate(a, scrape(fixture().replace('total 12', 'total 1')).samples, 20000)).toBeNull();
    expect(cpuRate(a, a.samples, 100000)).toBeNull();
    expect(cpuRate(a, a.samples, 10000)).toBeNull();
  });
});
describe('Demand-driven scrape cache', () => {
  it('deduplicates concurrent requests and cached samples; bounds response and redirects', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: fixture() });
    const reader = new MetricsReader();
    const [a, b] = await Promise.all([reader.read('ts6', 9187), reader.read('ts6', 9187)]);
    expect(a).toBe(b); expect(await reader.read('ts6', 9187)).toBe(a); expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith('http://ts6:9187/metrics', expect.objectContaining({ timeout: 2500, maxRedirects: 0, maxContentLength: 2097152 }));
  });
  it('negative-caches failures and does not return old samples as live', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10000);
    vi.mocked(axios.get).mockResolvedValueOnce({ data: fixture() }).mockRejectedValue(new Error('private target'));
    const reader = new MetricsReader(); await reader.read('ts6', 9187);
    vi.spyOn(Date, 'now').mockReturnValue(20000);
    await expect(reader.read('ts6', 9187)).rejects.toThrow('Metrics unavailable');
    await expect(reader.read('ts6', 9187)).rejects.toThrow('Metrics unavailable');
    expect(axios.get).toHaveBeenCalledTimes(2);
  });
  it('rejects wrong endpoint and URL-shaped hosts', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: '<html>not metrics</html>' });
    await expect(new MetricsReader().read('ts6', 9187)).rejects.toThrow();
    await expect(new MetricsReader().read('ts6/path', 9187)).rejects.toThrow('Invalid metrics target');
  });
  it('requires explicit configuration opt-in', () => {
    vi.stubEnv('TS_METRICS_CONFIG_IDS', '1, 3'); vi.stubEnv('TS_METRICS_PORT', '9187');
    expect(metricsPort(1)).toBe(9187); expect(metricsPort(2)).toBeNull();
    vi.stubEnv('TS_METRICS_PORT', 'invalid'); expect(metricsPort(1)).toBeNull(); vi.unstubAllEnvs();
  });
});
