import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { iconsApi } from '@/api/icons.api';
import { useServerStore } from '@/stores/server.store';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

interface ManagedIcon {
  id: string;
  name: string;
  size: number;
}

interface GroupIconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: 'serverGroup' | 'channelGroup';
  targetId: number;
  groupName: string;
  currentIconId?: number | string;
}

export function GroupIconDialog({ open, onOpenChange, targetType, targetId, groupName, currentIconId }: GroupIconDialogProps) {
  const { selectedConfigId: c, selectedSid: s } = useServerStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(currentIconId && Number(currentIconId) !== 0 ? String(currentIconId) : '');

  useEffect(() => {
    if (open) {
      setSelected(currentIconId && Number(currentIconId) !== 0 ? String(currentIconId) : '');
      setFilter('');
    }
  }, [open, currentIconId, targetId]);

  const { data, isLoading } = useQuery({
    queryKey: ['teamspeak-icons', c, s],
    queryFn: () => iconsApi.list(c!, s!),
    enabled: open && !!c && !!s,
  });

  const icons = useMemo(() => {
    const all = (Array.isArray(data) ? data : []) as ManagedIcon[];
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((icon) => icon.id.includes(needle) || icon.name.toLowerCase().includes(needle)) : all;
  }, [data, filter]);

  const assign = useMutation({
    mutationFn: (iconId: string) => iconsApi.assign(c!, s!, { iconId, targetType, targetId }),
    onSuccess: (_, iconId) => {
      qc.invalidateQueries({ queryKey: [targetType === 'serverGroup' ? 'server-groups' : 'channel-groups'] });
      toast.success(iconId === '0' ? 'Group icon removed' : 'Group icon updated');
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'Could not update group icon'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Icon for {groupName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search icon..." className="pl-8" />
          </div>
          <ScrollArea className="h-80 rounded-md border">
            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2 p-3">
              {isLoading ? <p className="col-span-full text-sm text-muted-foreground text-center py-12">Loading icons...</p> : icons.map((icon) => (
                <button
                  key={icon.id}
                  onClick={() => setSelected(icon.id)}
                  className={cn('rounded-md border p-2 flex flex-col items-center gap-1 hover:bg-muted/40', selected === icon.id && 'border-primary bg-primary/10 ring-1 ring-primary/30')}
                  title={`${icon.name} - ${icon.id}`}
                >
                  <TeamSpeakIcon configId={c!} sid={s!} iconId={icon.id} className="h-7 w-7" />
                  <span className="text-[8px] font-mono-data truncate w-full">{icon.id}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => assign.mutate('0')} disabled={assign.isPending}>Remove icon</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => selected && assign.mutate(selected)} disabled={!selected || assign.isPending}>Assign icon</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
