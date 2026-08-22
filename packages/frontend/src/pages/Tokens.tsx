import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tokensApi } from '@/api/bans.api';
import { useServerStore } from '@/stores/server.store';
import { useServerGroups, useChannelGroups } from '@/hooks/use-groups';
import { useChannels } from '@/hooks/use-channels';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { KeyRound, Trash2, Copy, Shield, ShieldCheck, Hash } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

export default function Tokens() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  const { data, isLoading } = useQuery({ queryKey: ['tokens', c, s], queryFn: () => tokensApi.list(c!, s!), enabled: !!c && !!s });
  const { data: serverGroupsData } = useServerGroups();
  const { data: channelGroupsData } = useChannelGroups();
  const { data: channelsData } = useChannels();
  const qc = useQueryClient();
  const deleteToken = useMutation({ mutationFn: (token: string) => tokensApi.delete(c!, s!, token), onSuccess: () => qc.invalidateQueries({ queryKey: ['tokens'] }) });

  const tokens = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const serverGroups = useMemo(
    () => new Map((Array.isArray(serverGroupsData) ? serverGroupsData : []).map((group: any) => [String(group.sgid), group])),
    [serverGroupsData],
  );
  const channelGroups = useMemo(
    () => new Map((Array.isArray(channelGroupsData) ? channelGroupsData : []).map((group: any) => [String(group.cgid), group])),
    [channelGroupsData],
  );
  const channels = useMemo(
    () => new Map((Array.isArray(channelsData) ? channelsData : []).map((channel: any) => [String(channel.cid), channel])),
    [channelsData],
  );

  const columns: ColumnDef<any>[] = useMemo(() => [
    { accessorKey: 'token', header: 'Token', cell: ({ getValue }) => (
      <div className="flex items-center gap-1">
        <span className="font-mono-data text-xs truncate max-w-[200px]">{getValue() as string}</span>
        <button onClick={() => { navigator.clipboard.writeText(getValue() as string); toast.success('Copied'); }} className="p-1 hover:bg-muted rounded"><Copy className="h-3 w-3 text-muted-foreground" /></button>
      </div>
    )},
    { accessorKey: 'token_type', header: 'Type', cell: ({ getValue }) => {
      const tokenType = Number(getValue());
      if (tokenType === 0) {
        return <span className="inline-flex items-center gap-1.5 text-xs"><Shield className="h-3.5 w-3.5 text-violet-400" />Server Group</span>;
      }
      if (tokenType === 1) {
        return <span className="inline-flex items-center gap-1.5 text-xs"><ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />Channel Group</span>;
      }
      return <span className="text-xs text-muted-foreground">Unknown</span>;
    }},
    { id: 'target', header: 'Target', cell: ({ row }) => {
      const tokenType = Number(row.original.token_type);
      const groupId = String(row.original.token_id1);
      const channelId = String(row.original.token_id2);
      const group: any = tokenType === 0 ? serverGroups.get(groupId) : channelGroups.get(groupId);
      const channel: any = tokenType === 1 ? channels.get(channelId) : null;

      return (
        <div className="space-y-1 min-w-[180px]">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {tokenType === 0
              ? <Shield className="h-3.5 w-3.5 text-violet-400 shrink-0" />
              : <ShieldCheck className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
            <span>{group?.name || `Unknown group (${groupId})`}</span>
            {Number(group?.iconid) !== 0 && (
              <span title={`Assigned TeamSpeak icon: ${group.iconid}`} className="inline-flex">
                <TeamSpeakIcon configId={c!} sid={s!} iconId={group.iconid} className="h-3.5 w-3.5 text-emerald-400" />
              </span>
            )}
          </div>
          {tokenType === 1 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5">
              <Hash className="h-3 w-3 shrink-0" />
              <span>{channel?.channel_name || `Unknown channel (${channelId})`}</span>
              {Number(channel?.channel_icon_id) !== 0 && (
                <span title={`Assigned TeamSpeak icon: ${channel.channel_icon_id}`} className="inline-flex">
                  <TeamSpeakIcon configId={c!} sid={s!} iconId={channel.channel_icon_id} className="h-3 w-3 text-emerald-400" />
                </span>
              )}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground font-mono-data pl-5">
            Group {groupId}{tokenType === 1 ? ` · Channel ${channelId}` : ''}
          </div>
        </div>
      );
    }},
    { accessorKey: 'token_description', header: 'Description', cell: ({ getValue }) => <span className="text-xs">{(getValue() as string) || '-'}</span> },
    { id: 'actions', header: '', cell: ({ row }) => (
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteToken.mutate(row.original.token, { onSuccess: () => toast.success('Token deleted') })}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    )},
  ], [deleteToken, serverGroups, channelGroups, channels, c, s]);

  if (!c || !s) return <EmptyState icon={KeyRound} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Privilege Keys</h1>
      <DataTable columns={columns} data={tokens} searchKey="token_description" searchPlaceholder="Search tokens..." />
    </div>
  );
}
