import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClients, useKickClient, useBanClient, usePokeClient, useMessageClient, useMoveClient } from '@/hooks/use-clients';
import { useServerGroups, useChannelGroups } from '@/hooks/use-groups';
import { useChannels } from '@/hooks/use-channels';
import { clientsApi } from '@/api/clients.api';
import { groupsApi } from '@/api/groups.api';
import { iconsApi } from '@/api/icons.api';
import { useServerStore } from '@/stores/server.store';
import { useAuthStore } from '@/stores/auth.store';
import { DataTable } from '@/components/shared/DataTable';
import { ClientTeamSpeakIcons } from '@/components/shared/ClientTeamSpeakIcons';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatUptime } from '@/lib/utils';
import { Users, MoreHorizontal, LogOut, Ban, MessageSquare, Zap, Move, UserRoundCog, KeyRound, Shield, Image as ImageIcon, X, VolumeX } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

type ClientAction = 'message' | 'poke' | 'kick-channel' | 'kick-server' | 'ban';
const first = (value: any) => Array.isArray(value) ? value[0] : value;
const errorText = (error: any, fallback: string) => error?.response?.data?.error || error?.message || fallback;

function ClientsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  const isAdmin = useAuthStore((state) => state.isAdmin());
  const { data, isLoading } = useClients();
  const { data: serverGroupData } = useServerGroups();
  const { data: channelGroupData } = useChannelGroups();
  const { data: channelData } = useChannels();
  const kickClient = useKickClient();
  const banClient = useBanClient();
  const pokeClient = usePokeClient();
  const messageClient = useMessageClient();
  const moveClient = useMoveClient();

  const [target, setTarget] = useState<any | null>(null);
  const [action, setAction] = useState<{ type: ClientAction; client: any } | null>(null);
  const [message, setMessage] = useState('');
  const [moveCid, setMoveCid] = useState('');
  const [addSgid, setAddSgid] = useState('');
  const [channelGroupId, setChannelGroupId] = useState('');
  const [iconId, setIconId] = useState('');
  const [removeGroup, setRemoveGroup] = useState<{ sgid: number; name: string } | null>(null);
  const [banDuration, setBanDuration] = useState('3600');
  const [clientDescription, setClientDescription] = useState('');
  const [clientTalker, setClientTalker] = useState(false);

  const clients = useMemo(() => Array.isArray(data) ? data.filter((client: any) => String(client.client_type) === '0') : [], [data]);
  const allServerGroupList = useMemo(() => Array.isArray(serverGroupData) ? serverGroupData : [], [serverGroupData]);
  const serverGroupList = useMemo(() => allServerGroupList.filter((group: any) => Number(group.type) === 1), [allServerGroupList]);
  const channelGroupList = useMemo(() => Array.isArray(channelGroupData) ? channelGroupData : [], [channelGroupData]);
  const channelList = useMemo(() => Array.isArray(channelData) ? channelData.filter((channel: any) => !String(channel.channel_name || '').includes('spacer')) : [], [channelData]);
  const serverGroups = useMemo(() => new Map(allServerGroupList.map((group: any) => [String(group.sgid), group])), [allServerGroupList]);
  const channelGroups = useMemo(() => new Map(channelGroupList.map((group: any) => [String(group.cgid), group])), [channelGroupList]);
  const channels = useMemo(() => new Map(channelList.map((channel: any) => [String(channel.cid), channel])), [channelList]);

  useEffect(() => {
    const requestedClid = Number(searchParams.get('clid'));
    if (!Number.isInteger(requestedClid) || requestedClid <= 0 || Number(target?.clid) === requestedClid) return;
    const client = clients.find((candidate: any) => Number(candidate.clid) === requestedClid);
    if (!client) return;
    setTarget(client);
    setMoveCid(String(client.cid || ''));
    setChannelGroupId(String(client.client_channel_group_id || ''));
    setAddSgid('');
    setIconId('');
    setClientDescription(String(client.client_description || ''));
    setClientTalker(Number(client.client_is_talker) === 1);
    setSearchParams({}, { replace: true });
  }, [clients, searchParams, setSearchParams, target?.clid]);

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['client-detail', c, s, target?.clid],
    queryFn: () => clientsApi.get(c!, s!, Number(target.clid)),
    enabled: !!c && !!s && !!target,
  });
  // clientinfo does not repeat the clid used to request it. Preserve fields
  // from the live client row so actions never degrade to /clients/NaN/...
  // after the detail query finishes.
  const detail = target ? { ...target, ...(first(detailData) || {}) } : null;
  useEffect(() => {
    const loaded = first(detailData);
    if (!target || !loaded) return;
    setClientDescription(String(loaded.client_description || ''));
    setClientTalker(Number(loaded.client_is_talker) === 1);
  }, [detailData, target]);
  const { data: iconData } = useQuery({
    queryKey: ['teamspeak-icons', c, s],
    queryFn: () => iconsApi.list(c!, s!),
    enabled: isAdmin && !!c && !!s && !!target,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['client-detail', c, s, target?.clid] });
  };
  const addGroupMutation = useMutation({
    mutationFn: (value: { sgid: number; cldbid: number }) => groupsApi.addServerGroupMember(c!, s!, value.sgid, value.cldbid),
    onSuccess: () => { refresh(); setAddSgid(''); toast.success('Server group added'); },
    onError: (error: any) => toast.error(errorText(error, 'Failed to add server group')),
  });
  const removeGroupMutation = useMutation({
    mutationFn: (value: { sgid: number; cldbid: number }) => groupsApi.removeServerGroupMember(c!, s!, value.sgid, value.cldbid),
    onSuccess: () => { refresh(); setRemoveGroup(null); toast.success('Server group removed'); },
    onError: (error: any) => toast.error(errorText(error, 'Failed to remove server group')),
  });
  const assignChannelGroup = useMutation({
    mutationFn: (value: { cgid: number; cid: number; cldbid: number }) => groupsApi.assignChannelGroup(c!, s!, value.cgid, value.cid, value.cldbid),
    onSuccess: () => { refresh(); toast.success('Channel group updated'); },
    onError: (error: any) => toast.error(errorText(error, 'Failed to update channel group')),
  });
  const assignIcon = useMutation({
    mutationFn: (value: string) => iconsApi.assign(c!, s!, { iconId: value, targetType: 'client', targetId: Number(detail.client_database_id) }),
    onSuccess: (_, value) => { refresh(); setIconId(''); toast.success(value === '0' ? 'Personal icon removed' : 'Personal icon assigned'); },
    onError: (error: any) => toast.error(errorText(error, 'Failed to assign client icon')),
  });
  const editClient = useMutation({
    mutationFn: (value: { client_description?: string; client_is_talker?: number }) => clientsApi.edit(c!, s!, Number(detail.clid), {
      cldbid: Number(detail.client_database_id), ...value,
    }),
    onSuccess: () => { refresh(); toast.success('Client profile updated'); },
    onError: (error: any) => toast.error(errorText(error, 'Failed to update client profile')),
  });

  const currentSgids = String(detail?.client_servergroups || '').split(',').filter(Boolean);
  const availableGroups = serverGroupList.filter((group: any) => !currentSgids.includes(String(group.sgid)));

  const openTarget = (client: any) => {
    setTarget(client);
    setMoveCid(String(client.cid || ''));
    setChannelGroupId(String(client.client_channel_group_id || ''));
    setAddSgid('');
    setIconId('');
    setClientDescription(String(client.client_description || ''));
    setClientTalker(Number(client.client_is_talker) === 1);
  };
  const openAction = (type: ClientAction, client: any) => {
    setAction({ type, client });
    setMessage('');
    setBanDuration('3600');
  };
  const send = () => {
    if (!action || !message.trim()) return;
    const mutation = action.type === 'poke' ? pokeClient : messageClient;
    mutation.mutate({ clid: Number(action.client.clid), msg: message.trim() }, {
      onSuccess: () => { toast.success(action.type === 'poke' ? 'Poke sent' : 'Private message sent'); setAction(null); },
      onError: (error: any) => toast.error(errorText(error, 'Failed to send message')),
    });
  };
  const kick = () => {
    if (!action) return;
    const channelOnly = action.type === 'kick-channel';
    kickClient.mutate({ clid: Number(action.client.clid), reasonid: channelOnly ? 4 : 5, reasonmsg: message.trim() || (channelOnly ? 'Kicked from channel by administrator' : 'Kicked by administrator') }, {
      onSuccess: () => { toast.success(channelOnly ? 'Client kicked from channel' : 'Client kicked from server'); setAction(null); setTarget(null); },
      onError: (error: any) => toast.error(errorText(error, 'Failed to kick client')),
    });
  };
  const ban = () => {
    if (!action) return;
    banClient.mutate({ clid: Number(action.client.clid), time: Number(banDuration), banreason: message.trim() || 'Banned by administrator' }, {
      onSuccess: () => { toast.success('Client banned'); setAction(null); setTarget(null); },
      onError: (error: any) => toast.error(errorText(error, 'Failed to ban client')),
    });
  };

  const columns: ColumnDef<any>[] = useMemo(() => [
    { accessorKey: 'client_nickname', header: 'Nickname', cell: ({ row }) => <div className="flex items-center gap-2"><div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-mono-data text-primary">{row.original.client_nickname?.[0]?.toUpperCase() || '?'}</div><span className="font-medium">{row.original.client_nickname}</span></div> },
    { id: 'icons', header: 'Icons', cell: ({ row }) => <ClientTeamSpeakIcons client={row.original} configId={c!} sid={s!} serverGroups={serverGroups} channelGroups={channelGroups} /> },
    { id: 'channel', header: 'Channel', cell: ({ row }) => <span className="text-xs">{(channels.get(String(row.original.cid)) as any)?.channel_name || `#${row.original.cid}`}</span> },
    { accessorKey: 'client_country', header: 'Country', cell: ({ getValue }) => <span className="font-mono-data text-xs">{String(getValue() || '-')}</span> },
    { accessorKey: 'client_idle_time', header: 'Idle', cell: ({ getValue }) => <span className="font-mono-data text-xs text-muted-foreground">{formatUptime(Math.floor(Number(getValue() || 0) / 1000))}</span> },
    { accessorKey: 'client_away', header: 'Status', cell: ({ row }) => String(row.original.client_away) === '1' ? <Badge variant="warning" className="text-[10px]">Away</Badge> : String(row.original.client_input_muted) === '1' ? <Badge variant="secondary" className="text-[10px]">Muted</Badge> : <Badge variant="success" className="text-[10px]">Active</Badge> },
    { id: 'actions', header: '', cell: ({ row }) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onSelect={() => openTarget(row.original)}><UserRoundCog className="mr-2 h-4 w-4" />{isAdmin ? 'Manage client' : 'View details'}</DropdownMenuItem>{isAdmin && <><DropdownMenuItem onSelect={() => openAction('message', row.original)}><MessageSquare className="mr-2 h-4 w-4" />Private message</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction('poke', row.original)}><Zap className="mr-2 h-4 w-4" />Poke</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => openAction('kick-channel', row.original)}><VolumeX className="mr-2 h-4 w-4" />Kick from channel</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction('kick-server', row.original)}><LogOut className="mr-2 h-4 w-4" />Kick from server</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => openAction('ban', row.original)}><Ban className="mr-2 h-4 w-4" />Ban client…</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu> },
  ], [c, s, isAdmin, serverGroups, channelGroups, channels]);

  if (!c || !s) return <EmptyState icon={Users} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold">Clients</h1><p className="text-sm text-muted-foreground mt-0.5">{clients.length} online</p></div>
    <DataTable columns={columns} data={clients} searchKey="client_nickname" searchPlaceholder="Search clients..." />

    {target && <Dialog open onOpenChange={(open) => { if (!open) setTarget(null); }}>
      <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Client · {target?.client_nickname}</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">{detailLoading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading client details…</div> : <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Database ID" value={detail?.client_database_id} mono />
            <Info label="Unique ID" value={detail?.client_unique_identifier} mono />
            <Info label="Platform / Version" value={`${detail?.client_platform || '-'} · ${detail?.client_version || '-'}`} />
            <div className="rounded-md border p-3 sm:col-span-2 lg:col-span-3"><p className="text-[10px] uppercase text-muted-foreground">Description</p><p className="text-sm whitespace-pre-wrap">{detail?.client_description || 'No description'}</p></div>
          </section>
          {isAdmin && <>
            <Section title="Profile settings">
              <div className="space-y-1"><div className="flex items-center justify-between"><Label className="text-xs">Stored description</Label><span className="text-[10px] text-muted-foreground">{clientDescription.length}/200</span></div><Textarea value={clientDescription} onChange={(event) => setClientDescription(event.target.value.slice(0, 200))} maxLength={200} /></div>
              <div className="flex items-center justify-between rounded-md border p-3"><div><Label>Talker</Label><p className="text-xs text-muted-foreground">Allow this client to talk when talk power is enforced.</p></div><Switch checked={clientTalker} onCheckedChange={setClientTalker} /></div>
              <Button size="sm" disabled={editClient.isPending || (clientDescription === String(detail?.client_description || '') && clientTalker === (Number(detail?.client_is_talker) === 1))} onClick={() => {
                const changes: { client_description?: string; client_is_talker?: number } = {};
                if (clientDescription !== String(detail?.client_description || '')) changes.client_description = clientDescription;
                if (clientTalker !== (Number(detail?.client_is_talker) === 1)) changes.client_is_talker = clientTalker ? 1 : 0;
                editClient.mutate(changes);
              }}>{editClient.isPending ? 'Saving…' : 'Save profile'}</Button>
            </Section>
            <Section title="Communication and permissions"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openAction('message', detail)}><MessageSquare className="h-3.5 w-3.5 mr-1" />Message</Button><Button size="sm" variant="outline" onClick={() => openAction('poke', detail)}><Zap className="h-3.5 w-3.5 mr-1" />Poke</Button><Button size="sm" variant="outline" onClick={() => navigate(`/permissions?layer=client&id=${detail.client_database_id}`)}><KeyRound className="h-3.5 w-3.5 mr-1" />Permissions</Button></div></Section>
            <Section title="Channel">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Select value={moveCid} onValueChange={setMoveCid}><SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger><SelectContent>{channelList.map((channel: any) => <SelectItem key={channel.cid} value={String(channel.cid)}>{channel.channel_name}</SelectItem>)}</SelectContent></Select><Button disabled={!moveCid || Number(moveCid) === Number(detail.cid) || moveClient.isPending} onClick={() => moveClient.mutate({ clid: Number(detail.clid), cid: Number(moveCid) }, { onSuccess: () => { refresh(); toast.success('Client moved'); }, onError: (error: any) => toast.error(errorText(error, 'Failed to move client')) })}><Move className="h-4 w-4 mr-1" />Move</Button></div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Select value={channelGroupId} onValueChange={setChannelGroupId}><SelectTrigger><SelectValue placeholder="Channel group" /></SelectTrigger><SelectContent>{channelGroupList.map((group: any) => <SelectItem key={group.cgid} value={String(group.cgid)}>{group.name}</SelectItem>)}</SelectContent></Select><Button disabled={!channelGroupId || Number(channelGroupId) === Number(detail.client_channel_group_id) || assignChannelGroup.isPending} onClick={() => assignChannelGroup.mutate({ cgid: Number(channelGroupId), cid: Number(detail.cid), cldbid: Number(detail.client_database_id) })}>Apply group</Button></div>
            </Section>
            <Section title="Server groups">
              <div className="flex flex-wrap gap-2">{currentSgids.map((sgid) => { const group: any = serverGroups.get(sgid); return <Badge key={sgid} variant="secondary" className="gap-1.5 py-1">{group && Number(group.iconid) !== 0 && <TeamSpeakIcon configId={c} sid={s} iconId={group.iconid} className="h-3.5 w-3.5" />}{group?.name || `SGID ${sgid}`}<button aria-label={`Remove ${group?.name || sgid}`} onClick={() => setRemoveGroup({ sgid: Number(sgid), name: group?.name || `SGID ${sgid}` })}><X className="h-3 w-3" /></button></Badge>; })}</div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Select value={addSgid} onValueChange={setAddSgid}><SelectTrigger><SelectValue placeholder="Add server group" /></SelectTrigger><SelectContent>{availableGroups.map((group: any) => <SelectItem key={group.sgid} value={String(group.sgid)}>{group.name}</SelectItem>)}</SelectContent></Select><Button disabled={!addSgid || addGroupMutation.isPending} onClick={() => addGroupMutation.mutate({ sgid: Number(addSgid), cldbid: Number(detail.client_database_id) })}><Shield className="h-4 w-4 mr-1" />Add</Button></div>
            </Section>
            <Section title="Personal icon">
              <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 max-h-32 overflow-y-auto rounded-md border p-2">{(Array.isArray(iconData) ? iconData : []).map((icon: any) => <button key={icon.id} title={`Icon ${icon.id}`} onClick={() => setIconId(String(icon.id))} className={`rounded border p-1.5 ${iconId === String(icon.id) ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-transparent hover:bg-muted'}`}><TeamSpeakIcon configId={c} sid={s} iconId={icon.id} className="h-6 w-6 mx-auto" /></button>)}{(!Array.isArray(iconData) || iconData.length === 0) && <p className="col-span-full text-xs text-muted-foreground py-3 text-center">No custom icons available.</p>}</div>
              <div className="flex gap-2"><Button size="sm" disabled={!iconId || assignIcon.isPending} onClick={() => assignIcon.mutate(iconId)}><ImageIcon className="h-4 w-4 mr-1" />Assign selected</Button>{Number(detail?.client_icon_id) !== 0 && <Button size="sm" variant="outline" disabled={assignIcon.isPending} onClick={() => assignIcon.mutate('0')}>Remove personal icon</Button>}</div>
            </Section>
            <Section title="Disconnect client" danger><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openAction('kick-channel', detail)}><VolumeX className="h-4 w-4 mr-1" />Kick from channel</Button><Button size="sm" variant="outline" onClick={() => openAction('kick-server', detail)}><LogOut className="h-4 w-4 mr-1" />Kick from server</Button><Button size="sm" variant="destructive" onClick={() => openAction('ban', detail)}><Ban className="h-4 w-4 mr-1" />Ban…</Button></div></Section>
          </>}
        </div>}</ScrollArea><DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>}

    <Dialog open={action?.type === 'message' || action?.type === 'poke'} onOpenChange={(open) => { if (!open) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{action?.type === 'poke' ? 'Poke' : 'Private message'} · {action?.client.client_nickname}</DialogTitle></DialogHeader><div><Label className="text-xs">Message</Label><Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1024} autoFocus /><p className="text-[10px] text-muted-foreground text-right">{message.length}/1024</p></div><DialogFooter><Button variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button disabled={!message.trim() || pokeClient.isPending || messageClient.isPending} onClick={send}>Send</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={action?.type === 'ban'} onOpenChange={(open) => { if (!open) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>Ban · {action?.client.client_nickname}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label className="text-xs">Duration</Label><Select value={banDuration} onValueChange={setBanDuration}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="600">10 minutes</SelectItem><SelectItem value="3600">1 hour</SelectItem><SelectItem value="86400">24 hours</SelectItem><SelectItem value="604800">7 days</SelectItem><SelectItem value="0">Permanent</SelectItem></SelectContent></Select></div><div><Label className="text-xs">Reason</Label><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Banned by administrator" /></div><p className="text-xs text-destructive">This disconnects the client and prevents reconnection for the selected duration.</p></div><DialogFooter><Button variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button variant="destructive" disabled={banClient.isPending} onClick={ban}>Confirm ban</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={action?.type === 'kick-channel' || action?.type === 'kick-server'} onOpenChange={(open) => { if (!open) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{action?.type === 'kick-channel' ? 'Kick from channel' : 'Kick from server'} · {action?.client.client_nickname}</DialogTitle></DialogHeader><div><Label className="text-xs">Reason</Label><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional" /></div><DialogFooter><Button variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button variant="destructive" disabled={kickClient.isPending} onClick={kick}>Confirm kick</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog open={!!removeGroup} onOpenChange={(open) => { if (!open) setRemoveGroup(null); }} title="Remove server group?" description={`Remove "${removeGroup?.name || ''}" from ${target?.client_nickname || 'this client'}?`} confirmLabel="Remove group" destructive onConfirm={() => removeGroup && removeGroupMutation.mutate({ sgid: removeGroup.sgid, cldbid: Number(detail.client_database_id) })} loading={removeGroupMutation.isPending} />
  </div>;
}

function Info({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  return <div className="rounded-md border p-3 min-w-0"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`${mono ? 'font-mono-data ' : ''}text-xs truncate`} title={String(value || '-')}>{String(value || '-')}</p></div>;
}

function Section({ title, children, danger = false }: { title: string; children: ReactNode; danger?: boolean }) {
  return <section className="space-y-3 border-t pt-4"><h3 className={`text-xs font-semibold uppercase tracking-wide ${danger ? 'text-destructive' : 'text-muted-foreground'}`}>{title}</h3>{children}</section>;
}

class ClientsErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const diagnostic = `${error.name}: ${error.message} | ${info.componentStack || ''}`.slice(0, 1200);
    fetch(`/api/auth/me?clients_render_error=${encodeURIComponent(diagnostic)}`).catch(() => undefined);
  }

  render() {
    if (this.state.error) {
      return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-5 space-y-2"><h1 className="text-lg font-semibold">Clients could not be displayed</h1><p className="text-sm text-muted-foreground">The error was recorded for diagnosis. Other sections of the panel remain available.</p><p className="font-mono-data text-xs text-destructive break-all">{this.state.error.message}</p></div>;
    }
    return this.props.children;
  }
}

export default function Clients() {
  return <ClientsErrorBoundary><ClientsPage /></ClientsErrorBoundary>;
}
