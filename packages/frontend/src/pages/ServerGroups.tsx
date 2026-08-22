import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAddServerGroupMember, useCopyServerGroup, useCreateServerGroup, useDeleteServerGroup,
  useRemoveServerGroupMember, useRenameServerGroup, useServerGroupMembers, useServerGroups,
} from '@/hooks/use-groups';
import { useClientDatabase } from '@/hooks/use-clients';
import { useVirtualServerInfo } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { GroupIconDialog } from '@/components/shared/GroupIconDialog';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Shield, Plus, Trash2, Users, ChevronRight, Pencil, Copy, Image, KeyRound, UserPlus, UserMinus, Search } from 'lucide-react';
import { toast } from 'sonner';

type Group = { sgid: number; name: string; type: number; iconid: number };
type Member = { cldbid: number; client_nickname?: string };

export default function ServerGroups() {
  const navigate = useNavigate();
  const { selectedConfigId, selectedSid } = useServerStore();
  const isAdmin = useAuthStore((state) => state.isAdmin());
  const { data, isLoading } = useServerGroups();
  const { data: virtualInfo } = useVirtualServerInfo();
  const { data: databaseClients } = useClientDatabase();
  const createGroup = useCreateServerGroup();
  const deleteGroup = useDeleteServerGroup();
  const renameGroup = useRenameServerGroup();
  const copyGroup = useCopyServerGroup();
  const addMember = useAddServerGroupMember();
  const removeMember = useRemoveServerGroupMember();
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const { data: memberData } = useServerGroupMembers(selectedGroup);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'copy' | 'icon' | 'member' | null>(null);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const groups: Group[] = useMemo(() => (Array.isArray(data) ? data : []).map((group: any) => ({
    ...group, sgid: Number(group.sgid), type: Number(group.type), iconid: Number(group.iconid) || 0,
  })), [data]);
  const members: Member[] = useMemo(() => (Array.isArray(memberData) ? memberData : []).map((member: any) => ({ ...member, cldbid: Number(member.cldbid) })), [memberData]);
  const current = groups.find((group) => group.sgid === selectedGroup) || null;
  const info = Array.isArray(virtualInfo) ? virtualInfo[0] : virtualInfo;
  const defaultServerGroup = Number(info?.virtualserver_default_server_group) || 0;
  const protectedGroup = !!current && (current.type !== 1 || current.sgid === defaultServerGroup);
  const availableClients = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.cldbid));
    const needle = filter.trim().toLowerCase();
    return (Array.isArray(databaseClients) ? databaseClients : [])
      .map((client: any) => ({ cldbid: Number(client.cldbid), name: client.client_nickname || `DBID ${client.cldbid}` }))
      .filter((client) => !memberIds.has(client.cldbid) && (!needle || client.name.toLowerCase().includes(needle) || String(client.cldbid).includes(needle)));
  }, [databaseClients, filter, members]);

  if (!selectedConfigId || !selectedSid) return <EmptyState icon={Shield} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  const openNameDialog = (type: 'create' | 'rename' | 'copy') => {
    setName(type === 'create' ? '' : type === 'copy' ? `${current?.name || ''} Copy` : current?.name || '');
    setDialog(type);
  };
  const submitNameDialog = () => {
    if (!name.trim()) return;
    const done = (message: string) => { toast.success(message); setDialog(null); setName(''); };
    const fail = (error: any) => toast.error(error?.response?.data?.error || 'Group operation failed');
    if (dialog === 'create') createGroup.mutate(name.trim(), { onSuccess: () => done('Server group created'), onError: fail });
    if (dialog === 'rename' && current) renameGroup.mutate({ sgid: current.sgid, name: name.trim() }, { onSuccess: () => done('Server group renamed'), onError: fail });
    if (dialog === 'copy' && current) copyGroup.mutate({ sgid: current.sgid, name: name.trim() }, { onSuccess: () => done('Server group copied'), onError: fail });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Server Groups</h1><p className="text-sm text-muted-foreground mt-0.5">Manage groups, members, icons and permissions</p></div>
        {isAdmin && <Button size="sm" onClick={() => openNameDialog('create')}><Plus className="h-4 w-4 mr-1" />Create Group</Button>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Groups ({groups.length})</CardTitle></CardHeader><CardContent className="p-0"><ScrollArea className="h-[560px]"><div className="p-2 space-y-0.5">{groups.map((group) => (
          <button key={group.sgid} onClick={() => setSelectedGroup(group.sgid)} className={cn('flex items-center justify-between w-full rounded-md px-3 py-2 text-sm text-left', selectedGroup === group.sgid ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50')}>
            <div className="flex items-center gap-2 min-w-0">{group.iconid ? <TeamSpeakIcon configId={selectedConfigId} sid={selectedSid} iconId={group.iconid} className="h-4 w-4" /> : <Shield className="h-3.5 w-3.5" />}<span className="truncate">{group.name}</span></div>
            <div className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px] font-mono-data">{group.sgid}</Badge><ChevronRight className="h-3 w-3" /></div>
          </button>
        ))}</div></ScrollArea></CardContent></Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{current ? current.name : 'Members'}{protectedGroup && <Badge variant="outline">Protected</Badge>}</CardTitle>
            {current && isAdmin && <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="sm" onClick={() => setDialog('member')}><UserPlus className="h-3.5 w-3.5 mr-1" />Add</Button>
              <Button variant="outline" size="sm" onClick={() => openNameDialog('rename')}><Pencil className="h-3.5 w-3.5 mr-1" />Rename</Button>
              <Button variant="outline" size="sm" onClick={() => openNameDialog('copy')}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('icon')}><Image className="h-3.5 w-3.5 mr-1" />Icon</Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/permissions?layer=server-group&id=${current.sgid}`)}><KeyRound className="h-3.5 w-3.5 mr-1" />Permissions</Button>
              <Button variant="outline" size="sm" className="text-destructive" disabled={protectedGroup} onClick={() => setDeleteTarget(current)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>}
          </div></CardHeader>
          <CardContent>{!current ? <p className="text-sm text-muted-foreground text-center py-16">Select a group to manage it</p> : <ScrollArea className="h-[485px]"><div className="space-y-1">{members.length ? members.map((member) => (
            <div key={member.cldbid} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/30">
              <div className="flex items-center gap-2"><div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary">{member.client_nickname?.[0]?.toUpperCase() || '?'}</div><span className="text-sm">{member.client_nickname || `DBID ${member.cldbid}`}</span></div>
              <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground font-mono-data">DBID {member.cldbid}</span>{isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setRemoveTarget(member)}><UserMinus className="h-3.5 w-3.5" /></Button>}</div>
            </div>
          )) : <p className="text-sm text-muted-foreground text-center py-12">No members in this group</p>}</div></ScrollArea>}</CardContent>
        </Card>
      </div>

      <Dialog open={dialog === 'create' || dialog === 'rename' || dialog === 'copy'} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog === 'create' ? 'Create' : dialog === 'rename' ? 'Rename' : 'Copy'} Server Group</DialogTitle></DialogHeader><div><Label className="text-xs">Group name</Label><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={submitNameDialog} disabled={!name.trim()}>Save</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={dialog === 'member'} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>Add member to {current?.name}</DialogTitle></DialogHeader><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search client database..." className="pl-8" /></div><ScrollArea className="h-80 rounded-md border"><div className="p-2 space-y-1">{availableClients.map((client) => <button key={client.cldbid} className="w-full flex justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50" onClick={() => current && addMember.mutate({ sgid: current.sgid, cldbid: client.cldbid }, { onSuccess: () => { toast.success('Member added'); setDialog(null); }, onError: (error: any) => toast.error(error?.response?.data?.error || 'Could not add member') })}><span>{client.name}</span><span className="font-mono-data text-muted-foreground">DBID {client.cldbid}</span></button>)}</div></ScrollArea><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
      {current && <GroupIconDialog open={dialog === 'icon'} onOpenChange={(open) => { if (!open) setDialog(null); }} targetType="serverGroup" targetId={current.sgid} groupName={current.name} currentIconId={current.iconid} />}
      <ConfirmDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="Delete server group?" description={`Delete "${deleteTarget?.name}"? Members will lose every permission granted by this group.`} confirmLabel="Delete group" destructive loading={deleteGroup.isPending} onConfirm={() => deleteTarget && deleteGroup.mutate(deleteTarget.sgid, { onSuccess: () => { toast.success('Server group deleted'); setDeleteTarget(null); setSelectedGroup(null); }, onError: (error: any) => toast.error(error?.response?.data?.error || 'Could not delete group') })} />
      <ConfirmDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)} title="Remove member?" description={`Remove "${removeTarget?.client_nickname || `DBID ${removeTarget?.cldbid}`}" from "${current?.name}"?`} confirmLabel="Remove member" destructive loading={removeMember.isPending} onConfirm={() => current && removeTarget && removeMember.mutate({ sgid: current.sgid, cldbid: removeTarget.cldbid }, { onSuccess: () => { toast.success('Member removed'); setRemoveTarget(null); }, onError: (error: any) => toast.error(error?.response?.data?.error || 'Could not remove member') })} />
    </div>
  );
}
