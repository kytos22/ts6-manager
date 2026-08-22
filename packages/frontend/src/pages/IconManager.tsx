import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { iconsApi } from '@/api/icons.api';
import { useServerStore } from '@/stores/server.store';
import { useServerGroups, useChannelGroups } from '@/hooks/use-groups';
import { useChannels } from '@/hooks/use-channels';
import { useClients } from '@/hooks/use-clients';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Upload, Trash2, Link2, Link2Off, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type TargetType = 'server' | 'channel' | 'serverGroup' | 'channelGroup' | 'client';

interface ManagedIcon {
  id: string;
  name: string;
  size: number;
  datetime: number;
}

export default function IconManager() {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<TargetType>('server');
  const [targetId, setTargetId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['teamspeak-icons', c, s],
    queryFn: () => iconsApi.list(c!, s!),
    enabled: !!c && !!s,
  });
  const { data: serverGroupData } = useServerGroups();
  const { data: channelGroupData } = useChannelGroups();
  const { data: channelData } = useChannels();
  const { data: clientData } = useClients();

  const refreshAssignments = () => {
    qc.invalidateQueries({ queryKey: ['server-groups'] });
    qc.invalidateQueries({ queryKey: ['channel-groups'] });
    qc.invalidateQueries({ queryKey: ['channels'] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['virtual-server-info'] });
  };

  const upload = useMutation({
    mutationFn: ({ data, name }: { data: string; name: string }) => iconsApi.upload(c!, s!, data, name),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['teamspeak-icons', c, s] });
      setSelectedIcon(String(result.id));
      toast.success('Icon uploaded');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Icon upload failed'),
  });
  const assign = useMutation({
    mutationFn: (iconId: string) => iconsApi.assign(c!, s!, {
      iconId,
      targetType,
      targetId: targetType === 'server' ? undefined : Number(targetId),
    }),
    onSuccess: (_, iconId) => {
      refreshAssignments();
      toast.success(iconId === '0' ? 'Icon assignment removed' : 'Icon assigned');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Icon assignment failed'),
  });
  const remove = useMutation({
    mutationFn: (iconId: string) => iconsApi.delete(c!, s!, iconId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamspeak-icons', c, s] });
      if (selectedIcon) qc.removeQueries({ queryKey: ['teamspeak-icon', c, s, selectedIcon] });
      setSelectedIcon(null);
      setDeleteOpen(false);
      toast.success('Icon file deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Icon deletion failed'),
  });

  const icons = useMemo(() => {
    const all = (Array.isArray(data) ? data : []) as ManagedIcon[];
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((icon) => icon.id.includes(needle) || icon.name.toLowerCase().includes(needle)) : all;
  }, [data, filter]);

  const targetOptions = useMemo(() => {
    if (targetType === 'channel') {
      return (Array.isArray(channelData) ? channelData : []).map((channel: any) => ({
        id: String(channel.cid),
        label: `#${channel.cid} · ${channel.channel_name}`,
      }));
    }
    if (targetType === 'serverGroup') {
      return (Array.isArray(serverGroupData) ? serverGroupData : []).map((group: any) => ({
        id: String(group.sgid),
        label: `${group.name} (SGID ${group.sgid})`,
      }));
    }
    if (targetType === 'channelGroup') {
      return (Array.isArray(channelGroupData) ? channelGroupData : []).map((group: any) => ({
        id: String(group.cgid),
        label: `${group.name} (CGID ${group.cgid})`,
      }));
    }
    if (targetType === 'client') {
      return (Array.isArray(clientData) ? clientData : [])
        .filter((client: any) => String(client.client_type) === '0')
        .map((client: any) => ({
          id: String(client.client_database_id),
          label: `${client.client_nickname} (DBID ${client.client_database_id})`,
        }));
    }
    return [];
  }, [targetType, channelData, serverGroupData, channelGroupData, clientData]);

  const targetReady = targetType === 'server' || !!targetId;

  const handleFile = (file?: File) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error('The icon must be 1 MB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => upload.mutate({ data: String(reader.result), name: file.name });
    reader.onerror = () => toast.error('Could not read the selected file');
    reader.readAsDataURL(file);
    if (fileInput.current) fileInput.current.value = '';
  };

  if (!c || !s) return <EmptyState icon={ImageIcon} title="No server selected" />;
  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Icon Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {Array.isArray(data) ? data.length : 0} custom TeamSpeak icons
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/gif,image/jpeg,image/webp,image/bmp"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <Button size="sm" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
            <Upload className="h-4 w-4 mr-1" />
            {upload.isPending ? 'Uploading...' : 'Upload Icon'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium">Server icon library</CardTitle>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Search icon ID..."
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {icons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No icons found.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2">
                {icons.map((icon) => (
                  <button
                    key={icon.id}
                    onClick={() => setSelectedIcon(icon.id)}
                    className={cn(
                      'rounded-md border p-2 flex flex-col items-center gap-1.5 hover:bg-muted/40 transition-colors',
                      selectedIcon === icon.id && 'border-primary bg-primary/10 ring-1 ring-primary/30',
                    )}
                    title={`ID ${icon.id} · ${icon.size} bytes`}
                  >
                    <TeamSpeakIcon configId={c} sid={s} iconId={icon.id} className="h-8 w-8" />
                    <span className="text-[9px] font-mono-data text-muted-foreground truncate w-full">
                      {icon.id}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-3 flex items-center gap-3">
              {selectedIcon ? (
                <>
                  <TeamSpeakIcon configId={c} sid={s} iconId={selectedIcon} className="h-10 w-10" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Selected icon</p>
                    <p className="text-sm font-mono-data truncate">{selectedIcon}</p>
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground">Select an icon from the library.</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Target type</Label>
              <Select value={targetType} onValueChange={(value) => { setTargetType(value as TargetType); setTargetId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="server">Virtual server</SelectItem>
                  <SelectItem value="channel" disabled>Channel (not supported by TS6 Query)</SelectItem>
                  <SelectItem value="serverGroup">Server group</SelectItem>
                  <SelectItem value="channelGroup">Channel group</SelectItem>
                  <SelectItem value="client">Connected client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType !== 'server' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Target</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger><SelectValue placeholder="Select target..." /></SelectTrigger>
                  <SelectContent>
                    {targetOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => selectedIcon && assign.mutate(selectedIcon)}
                disabled={!selectedIcon || !targetReady || assign.isPending}
              >
                <Link2 className="h-4 w-4 mr-1" /> Assign / Replace
              </Button>
              <Button
                variant="outline"
                onClick={() => assign.mutate('0')}
                disabled={!targetReady || assign.isPending}
              >
                <Link2Off className="h-4 w-4 mr-1" /> Unassign
              </Button>
            </div>

            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setDeleteOpen(true)}
              disabled={!selectedIcon || remove.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete icon file
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Assigning another icon replaces the current assignment. Unassign before deleting an icon that is in use.
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete TeamSpeak icon"
        description="This removes the icon file from the server. Any group, channel, client, or server still using it may show a missing icon."
        confirmLabel="Delete Icon"
        destructive
        loading={remove.isPending}
        onConfirm={() => selectedIcon && remove.mutate(selectedIcon)}
      />
    </div>
  );
}
