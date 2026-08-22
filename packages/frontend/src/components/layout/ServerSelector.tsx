import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServers, useVirtualServers } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { Server } from 'lucide-react';

export function ServerSelector() {
  const { selectedConfigId, selectedSid, setServer, setSid, clearServer } = useServerStore();
  const { data: servers } = useServers();
  const { data: virtualServers } = useVirtualServers();

  // Auto-select first server if none selected
  useEffect(() => {
    if (!servers) return;
    if (servers.length === 0) {
      if (selectedConfigId) clearServer();
      return;
    }
    if (!selectedConfigId || !servers.some((server: any) => server.id === selectedConfigId)) {
      setServer(servers[0].id);
    }
  }, [servers, selectedConfigId, setServer, clearServer]);

  // Auto-select first virtual server
  useEffect(() => {
    if (selectedConfigId && !selectedSid && virtualServers?.length > 0) {
      setSid(virtualServers[0].virtualserver_id);
    }
  }, [virtualServers, selectedConfigId, selectedSid, setSid]);

  return (
    <div className="flex items-center gap-2">
      <Server className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedConfigId?.toString() || ''}
        onValueChange={(v) => setServer(parseInt(v))}
      >
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="Select server..." />
        </SelectTrigger>
        <SelectContent>
          {servers?.map((s: any) => (
            <SelectItem key={s.id} value={s.id.toString()}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {virtualServers && virtualServers.length > 1 && (
        <>
          <span className="text-muted-foreground text-xs">/</span>
          <Select
            value={selectedSid?.toString() || ''}
            onValueChange={(v) => setSid(parseInt(v))}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Virtual server..." />
            </SelectTrigger>
            <SelectContent>
              {virtualServers.map((vs: any) => (
                <SelectItem key={vs.virtualserver_id} value={vs.virtualserver_id.toString()}>
                  {vs.virtualserver_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}
