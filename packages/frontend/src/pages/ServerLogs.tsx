import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsApi } from '@/api/bans.api';
import { serversApi } from '@/api/servers.api';
import { useServerStore } from '@/stores/server.store';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-destructive bg-destructive/10 border-destructive/20',
  WARNING: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  INFO: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  DEBUG: 'text-muted-foreground bg-muted/50 border-border/50',
};

const LOG_SOURCE_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d+)?/;
const LOG_DISPLAY_TIMESTAMP_RE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(\.\d+)?/;
const LOG_ENTRY_RE = /^\|([A-Z]+)\s*\|([^|]+)\|(\d+)\s*\|(.*)$/;
const TIME_ZONES = [
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Atlantic/Canary", label: "Canary Islands" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "Asia/Tokyo", label: "Tokyo" },
];

const LOG_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
function getLogTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = LOG_TIME_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    LOG_TIME_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

function localizeLogTimestamp(line: string, timeZone: string): string {
  const match = line.match(LOG_SOURCE_TIMESTAMP_RE);
  if (!match) return line;

  const fractional = (match[7] || "").slice(1);
  const milliseconds = Number((fractional + "000").slice(0, 3));
  const timestamp = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]), milliseconds,
  ));
  if (Number.isNaN(timestamp.getTime())) return line;

  const parts = Object.fromEntries(
    getLogTimeFormatter(timeZone).formatToParts(timestamp).map((part) => [part.type, part.value]),
  );
  const localized = parts.day + "/" + parts.month + "/" + parts.year + " "
    + parts.hour + ":" + parts.minute + ":" + parts.second;
  return localized + (match[7] || "") + line.slice(match[0].length);
}

function parseLevel(line: string): string {
  if (line.includes('|ERROR')) return 'ERROR';
  if (line.includes('|WARNING')) return 'WARNING';
  if (line.includes('|INFO')) return 'INFO';
  if (line.includes('|DEBUG')) return 'DEBUG';
  return 'INFO';
}

export default function ServerLogs() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  const [lines, setLines] = useState('100');
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem('ts6-log-timezone') || 'Europe/Madrid');

  useEffect(() => {
    localStorage.setItem('ts6-log-timezone', timeZone);
  }, [timeZone]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', c, s, lines],
    queryFn: () => logsApi.get(c!, s!, parseInt(lines)),
    enabled: !!c && !!s,
  });
  const { data: virtualServerInfo } = useQuery({
    queryKey: ['virtual-server-info', c, s],
    queryFn: () => serversApi.getVirtualInfo(c!, s!),
    enabled: !!c && !!s,
    staleTime: 300_000,
  });

  const logs = useMemo(() => {
    const raw = Array.isArray(data) ? data : [];
    return raw
      .map((entry: any) => {
        const line = typeof entry === 'string' ? entry : entry.l || entry.msg || JSON.stringify(entry);
        const display = localizeLogTimestamp(line, timeZone);
        const timestampMatch = display.match(LOG_DISPLAY_TIMESTAMP_RE);
        const remainder = timestampMatch ? display.slice(timestampMatch[0].length).trimStart() : display;
        const detailMatch = remainder.match(LOG_ENTRY_RE);
        const source = detailMatch?.[2].trim() || null;
        const logSid = detailMatch?.[3] || null;
        const serverName = virtualServerInfo?.[0]?.virtualserver_name;
        const sourceLabel = source?.startsWith("VirtualServer")
          ? (serverName || "Server " + (logSid || s))
          : source;
        return {
          raw: line,
          timestamp: timestampMatch?.[0] || null,
          sourceLabel,
          message: detailMatch ? detailMatch[4].trim() : remainder,
          level: detailMatch?.[1].trim() || parseLevel(line),
        };
      })
      .filter((entry) => {
        if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false;
        if (filter && !entry.raw.toLowerCase().includes(filter.toLowerCase())) return false;
        return true;
      });
  }, [data, filter, levelFilter, timeZone, virtualServerInfo, s]);

  if (!c || !s) return <EmptyState icon={ScrollText} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Server Logs</h1>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-1', isFetching && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filter logs..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Levels</SelectItem>
            <SelectItem value="ERROR">Error</SelectItem>
            <SelectItem value="WARNING">Warning</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
            <SelectItem value="DEBUG">Debug</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timeZone} onValueChange={setTimeZone}>
          <SelectTrigger className="w-[170px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIME_ZONES.map((zone) => (
              <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={lines} onValueChange={setLines}>
          <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 lines</SelectItem>
            <SelectItem value="100">100 lines</SelectItem>
            <SelectItem value="250">250 lines</SelectItem>
            <SelectItem value="500">500 lines</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden shadow-sm">
        <ScrollArea className="h-[calc(100vh-260px)]">
          <div className="p-3 space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-10">No log entries found.</p>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5 group hover:bg-muted/10 rounded px-1">
                  {entry.timestamp && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shrink-0 font-mono-data whitespace-nowrap mt-0.5">
                      {entry.timestamp}
                    </span>
                  )}
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-mono-data uppercase tracking-wider mt-0.5', LEVEL_COLORS[entry.level] || LEVEL_COLORS.INFO)}>
                    {entry.level.slice(0, 3)}
                  </span>
                  {entry.sourceLabel && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-400 shrink-0 font-mono-data whitespace-nowrap mt-0.5">
                      {entry.sourceLabel}
                    </span>
                  )}
                  <span className="text-xs font-mono-data text-muted-foreground leading-relaxed break-all">
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <p className="text-xs text-muted-foreground">{logs.length} entries shown · Times shown in {timeZone}</p>
    </div>
  );
}
