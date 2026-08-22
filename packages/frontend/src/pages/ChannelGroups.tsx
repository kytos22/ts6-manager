import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAssignChannelGroup, useChannelGroupClients, useChannelGroups, useCopyChannelGroup,
  useCreateChannelGroup, useDeleteChannelGroup, useRenameChannelGroup,
} from '@/hooks/use-groups';
import { useClientDatabase } from '@/hooks/use-clients';
import { useChannels } from '@/hooks/use-channels';
import { useVirtualServerInfo } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { GroupIconDialog } from '@/components/shared/GroupIconDialog';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ShieldCheck, Plus, ChevronRight, Pencil, Copy, Image, KeyRound, Trash2, UserPlus, Users, Hash } from 'lucide-react';
import { toast } from 'sonner';

type Group = { cgid: number; name: string; type: number; iconid: number };

export default function ChannelGroups() {
  const navigate = useNavigate();
  const { selectedConfigId, selectedSid } = useServerStore();
  const isAdmin = useAuthStore((state) => state.isAdmin());
  const { data, isLoading } = useChannelGroups();
  const { data: virtualInfo } = useVirtualServerInfo();
  const { data: channelsData } = useChannels();
  const { data: clientData } = useClientDatabase();
  const createGroup = useCreateChannelGroup();
  const renameGroup = useRenameChannelGroup();
  const copyGroup = useCopyChannelGroup();
  const deleteGroup = useDeleteChannelGroup();
  const assignGroup = useAssignChannelGroup();
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const { data: assignmentData } = useChannelGroupClients(selectedGroup);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'copy' | 'icon' | 'assign' | null>(null);
  const [name, setName] = useState('');
  const [assignClient, setAssignClient] = useState('');
  const [assignChannel, setAssignChannel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const groups: Group[] = useMemo(() => (Array.isArray(data) ? data : []).map((group: any) => ({ ...group, cgid: Number(group.cgid), type: Number(group.type), iconid: Number(group.iconid) || 0 })), [data]);
  const assignments = useMemo(() => Array.isArray(assignmentData) ? assignmentData : [], [assignmentData]);
  const channels = useMemo(() => (Array.isArray(channelsData) ? channelsData : []).map((channel: any) => ({ cid: Number(channel.cid), name: channel.channel_name || `Channel ${channel.cid}` })), [channelsData]);
  const clients = useMemo(() => (Array.isArray(clientData) ? clientData : []).map((client: any) => ({ cldbid: Number(client.cldbid), name: client.client_nickname || `DBID ${client.cldbid}` })), [clientData]);
  const channelNames = useMemo(() => new Map(channels.map((channel) => [channel.cid, channel.name])), [channels]);
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.cldbid, client.name])), [clients]);
  const current = groups.find((group) => group.cgid === selectedGroup) || null;
  const info = Array.isArray(virtualInfo) ? virtualInfo[0] : virtualInfo;
  const defaultIds = new Set([Number(info?.virtualserver_default_channel_group), Number(info?.virtualserver_default_channel_admin_group)]);
  const protectedGroup = !!current && (current.type !== 1 || defaultIds.has(current.cgid));

  if (!selectedConfigId || !selectedSid) return <EmptyState icon={ShieldCheck} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  const openNameDialog = (type: 'create' | 'rename' | 'copy') => {
    setName(type === 'create' ? '' : type === 'copy' ? `${current?.name || ''} Copy` : current?.name || '');
    setDialog(type);
  };
  const submitNameDialog = () => {
    if (!name.trim()) return;
    const done = (message: string) => { toast.success(message); setDialog(null); setName(''); };
    const fail = (error: any) => toast.error(error?.response?.data?.error || 'Group operation failed');
    if (dialog === 'create') createGroup.mutate(name.trim(), { onSuccess: () => done('Channel group created'), onError: fail });
    if (dialog === 'rename' && current) renameGroup.mutate({ cgid: current.cgid, name: name.trim() }, { onSuccess: () => done('Channel group renamed'), onError: fail });
    if (dialog === 'copy' && current) copyGroup.mutate({ cgid: current.cgid, name: name.trim() }, { onSuccess: () => done('Channel group copied'), onError: fail });
  };
  const submitAssignment = () => {
    if (!current || !assignClient || !assignChannel) return;
    assignGroup.mutate({ cgid: current.cgid, cldbid: Number(assignClient), cid: Number(assignChannel) }, {
      onSuccess: () => { toast.success('Channel group assigned'); setDialog(null); setAssignClient(''); setAssignChannel(''); },
      onError: (error: any) => toast.error(error?.response?.data?.error || 'Could not assign channel group'),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Channel Groups</h1><p className="text-sm text-muted-foreground mt-0.5">Manage groups and their channel-specific assignments</p></div>
        {isAdmin && <Button size="sm" onClick={() => openNameDialog('create')}><Plus className="h-4 w-4 mr-1" />Create Group</Button>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Groups ({groups.length})</CardTitle></CardHeader><CardContent className="p-0"><ScrollArea className="h-[560px]"><div className="p-2 space-y-0.5">{groups.map((group) => (
          <button key={group.cgid} onClick={() => setSelectedGroup(group.cgid)} className={cn('flex items-center justify-between w-full rounded-md px-3 py-2 text-sm text-left', selectedGroup === group.cgid ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50')}>
            <div className="flex items-center gap-2 min-w-0">{group.iconid ? <TeamSpeakIcon configId={selectedConfigId} sid={selectedSid} iconId={group.iconid} className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}<span className="truncate">{group.name}</span></div>
            <div className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px] font-mono-data">{group.cgid}</Badge><ChevronRight className="h-3 w-3" /></div>
          </button>
        ))}</div></ScrollArea></CardContent></Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{current ? current.name : 'Assignments'}{protectedGroup && <Badge variant="outline">Protected</Badge>}</CardTitle>
            {current && isAdmin && <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="sm" onClick={() => setDialog('assign')}><UserPlus className="h-3.5 w-3.5 mr-1" />Assign</Button>
              <Button variant="outline" size="sm" onClick={() => openNameDialog('rename')}><Pencil className="h-3.5 w-3.5 mr-1" />Rename</Button>
              <Button variant="outline" size="sm" onClick={() => openNameDialog('copy')}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('icon')}><Image className="h-3.5 w-3.5 mr-1" />Icon</Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/permissions?layer=channel-group&id=${current.cgid}`)}><KeyRound className="h-3.5 w-3.5 mr-1" />Permissions</Button>
              <Button variant="outline" size="sm" className="text-destructive" disabled={protectedGroup} onClick={() => setDeleteTarget(current)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>}
          </div></CardHeader>
          <CardContent>{!current ? <p className="text-sm text-muted-foreground text-center py-16">Select a group to manage it</p> : <ScrollArea className="h-[485px]"><div className="space-y-1">{assignments.length ? assignments.map((assignment: any, index: number) => {
            const cldbid = Number(assignment.cldbid);
            const cid = Number(assignment.cid);
            return <div key={`${cldbid}-${cid}-${index}`} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/30"><div><p className="text-sm">{assignment.client_nickname || clientNames.get(cldbid) || `DBID ${cldbid}`}</p><p className="text-xs text-muted-foreground font-mono-data">DBID {cldbid}</p></div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Hash className="h-3.5 w-3.5" />{assignment.channel_name || channelNames.get(cid) || `Channel ${cid}`}</div></div>;
          }) : <p className="text-sm text-muted-foreground text-center py-12">No assignments found for this group</p>}</div></ScrollArea>}</CardContent>
        </Card>
      </div>

      <Dialog open={dialog === 'create' || dialog === 'rename' || dialog === 'copy'} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog === 'create' ? 'Create' : dialog === 'rename' ? 'Rename' : 'Copy'} Channel Group</DialogTitle></DialogHeader><div><Label className="text-xs">Group name</Label><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={submitNameDialog} disabled={!name.trim()}>Save</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={dialog === 'assign'} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>Assign {current?.name}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label className="text-xs">Client</Label><Select value={assignClient} onValueChange={setAssignClient}><SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger><SelectContent>{clients.map((client) => <SelectItem key={client.cldbid} value={String(client.cldbid)}>{client.name} (DBID {client.cldbid})</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">Channel</Label><Select value={assignChannel} onValueChange={setAssignChannel}><SelectTrigger><SelectValue placeholder="Select a channel" /></SelectTrigger><SelectContent>{channels.map((channel) => <SelectItem key={channel.cid} value={String(channel.cid)}>{channel.name}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={submitAssignment} disabled={!assignClient || !assignChannel || assignGroup.isPending}>Assign group</Button></DialogFooter></DialogContent></Dialog>
      {current && <GroupIconDialog open={dialog === 'icon'} onOpenChange={(open) => { if (!open) setDialog(null); }} targetType="channelGroup" targetId={current.cgid} groupName={current.name} currentIconId={current.iconid} />}
      <ConfirmDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="Delete channel group?" description={`Delete "${deleteTarget?.name}"? Its channel assignments and permissions will be lost.`} confirmLabel="Delete group" destructive loading={deleteGroup.isPending} onConfirm={() => deleteTarget && deleteGroup.mutate(deleteTarget.cgid, { onSuccess: () => { toast.success('Channel group deleted'); setDeleteTarget(null); setSelectedGroup(null); }, onError: (error: any) => toast.error(error?.response?.data?.error || 'Could not delete group') })} />
    </div>
  );
}
