import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useChannels, useCreateChannel, useDeleteChannel, useEditChannel, useMoveChannel } from '@/hooks/use-channels';
import { useBanClient, useClients, useKickClient, useMessageClient, useMoveClient, usePokeClient } from '@/hooks/use-clients';
import { useServerStore } from '@/stores/server.store';
import { useAuthStore } from '@/stores/auth.store';
import { channelsApi } from '@/api/channels.api';
import { clientsApi } from '@/api/clients.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { TeamSpeakIcon } from '@/components/shared/TeamSpeakIcon';
import { ClientAvatar } from '@/components/shared/ClientAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Hash, Plus, Trash2, Pencil, ChevronRight, ChevronDown, Users, Lock, Unlock, Volume2, VolumeX, MicOff, Clock3, RefreshCw, MoreHorizontal, Move, MessageSquare, Zap, LogOut, Ban, KeyRound, UserRoundCog, PanelLeft, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChannelNode {
  cid: number;
  pid: number;
  channel_name: string;
  channel_topic: string;
  total_clients: number;
  channel_flag_permanent: number;
  channel_flag_password: number;
  channel_codec_quality: number;
  channel_icon_id: number;
  channel_banner_gfx_url: string;
  channel_banner_mode: number;
  children: ChannelNode[];
}

interface ClientInfo {
  clid: number;
  cid: number;
  client_nickname: string;
  client_type: string;
  client_away: number;
  client_away_message: string;
  client_flag_talking: number;
  client_input_muted: number;
  client_output_muted: number;
  client_input_hardware: number;
  client_output_hardware: number;
}

type SpacerInfo = {
  mode: 'blank' | 'repeat' | 'center' | 'left' | 'right';
  content: string;
};

type ClientAction = 'manage' | 'move' | 'message' | 'poke' | 'kick' | 'ban';

type ChannelEditForm = {
  channel_name: string;
  channel_topic: string;
  channel_description: string;
  channel_password: string;
  channel_name_phonetic: string;
  channel_codec: string;
  channel_codec_quality: string;
  audio_encrypted: boolean;
  permanence: 'permanent' | 'semi' | 'temporary';
  channel_flag_default: boolean;
  channel_flag_maxclients_unlimited: boolean;
  channel_maxclients: string;
  family_limit_mode: 'unlimited' | 'inherited' | 'limited';
  channel_maxfamilyclients: string;
  channel_needed_talk_power: string;
  channel_delete_delay: string;
  channel_banner_gfx_url: string;
  channel_banner_mode: string;
};

const emptyEditForm: ChannelEditForm = {
  channel_name: '', channel_topic: '', channel_description: '', channel_password: '', channel_name_phonetic: '',
  channel_codec: '4', channel_codec_quality: '6', audio_encrypted: true, permanence: 'permanent',
  channel_flag_default: false, channel_flag_maxclients_unlimited: true, channel_maxclients: '0',
  family_limit_mode: 'unlimited', channel_maxfamilyclients: '0', channel_needed_talk_power: '0',
  channel_delete_delay: '0', channel_banner_gfx_url: '', channel_banner_mode: '0',
};

const asBool = (value: unknown) => Number(value) === 1;
const asText = (value: unknown, fallback = '') => value === undefined || value === null ? fallback : String(value);

function parseSpacer(node: ChannelNode): SpacerInfo | null {
  // TeamSpeak clients only treat permanent, top-level channels as spacers.
  if (node.pid !== 0 || node.channel_flag_permanent !== 1) return null;
  const match = node.channel_name.match(/^\[(\*?)([clr]?spacer)[^\]]*\](.*)$/i);
  if (!match) return null;
  const repeated = match[1] === '*';
  const keyword = match[2].toLowerCase();
  const content = match[3].trim();
  if (repeated) return { mode: 'repeat', content };
  if (keyword === 'cspacer') return { mode: 'center', content };
  if (keyword === 'lspacer') return { mode: 'left', content };
  if (keyword === 'rspacer') return { mode: 'right', content };
  return { mode: 'blank', content };
}

function buildTree(channels: any[]): ChannelNode[] {
  const normalized = channels.map((ch) => ({
    ...ch,
    cid: Number(ch.cid),
    pid: Number(ch.pid),
    total_clients: Number(ch.total_clients) || 0,
    channel_flag_permanent: Number(ch.channel_flag_permanent) || 0,
    channel_flag_password: Number(ch.channel_flag_password) || 0,
    channel_codec_quality: Number(ch.channel_codec_quality) || 0,
    channel_icon_id: Number(ch.channel_icon_id) || 0,
    channel_banner_gfx_url: ch.channel_banner_gfx_url || '',
    channel_banner_mode: Number(ch.channel_banner_mode) || 0,
    channel_topic: ch.channel_topic || '',
  }));
  const map = new Map<number, ChannelNode>();
  const roots: ChannelNode[] = [];
  normalized.forEach((ch) => map.set(ch.cid, { ...ch, children: [] }));
  normalized.forEach((ch) => {
    const node = map.get(ch.cid)!;
    if (ch.pid === 0) roots.push(node);
    else map.get(ch.pid)?.children.push(node);
  });
  return roots;
}

function ChannelBannerBackground({ node, subtle = false }: { node: ChannelNode; subtle?: boolean }) {
  const configuredUrl = node.channel_banner_gfx_url?.trim() || '';
  const [source, setSource] = useState(configuredUrl);
  const [failed, setFailed] = useState(false);
  if (failed || !source || !/^https?:\/\//i.test(source)) return null;
  const objectFit = node.channel_banner_mode === 1 ? 'fill' : node.channel_banner_mode === 2 ? 'cover' : 'none';
  return <>
    <img
      src={source}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-left"
      style={{ objectFit, objectPosition: 'left center' }}
      onError={() => {
        if (source.startsWith('https://') && window.location.protocol === 'http:') {
          setSource(`http://${source.slice('https://'.length)}`);
        } else {
          setFailed(true);
        }
      }}
    />
    <div className={cn('pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-black/10 via-black/30 to-black/75', subtle && 'from-black/5 via-black/20 to-black/60')} />
  </>;
}

function ClientEntry({
  client,
  depth,
  isAdmin,
  onAction,
}: {
  client: ClientInfo;
  depth: number;
  isAdmin: boolean;
  onAction: (action: ClientAction, client: ClientInfo) => void;
}) {
  const handleDragStart = (event: React.DragEvent) => {
    event.stopPropagation();
    event.dataTransfer.setData('application/x-ts6-client', String(client.clid));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={cn(
        'relative flex min-h-8 items-stretch overflow-hidden rounded-md border border-transparent p-0 text-xs text-muted-foreground transition-colors group/client hover:border-border/50 hover:bg-muted/30 hover:text-foreground',
        isAdmin && 'cursor-grab active:cursor-grabbing',
      )}
      draggable={isAdmin}
      onDragStart={isAdmin ? handleDragStart : undefined}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden py-1 pr-2"
        style={{ paddingLeft: `${depth * 16 + 28}px` }}
      >
      <div className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-[9px] font-semibold text-primary ring-1 ring-primary/20">
        <ClientAvatar
          configId={Number(useServerStore.getState().selectedConfigId)}
          sid={Number(useServerStore.getState().selectedSid)}
          clid={client.clid}
          nickname={client.client_nickname}
        />
      </div>
      <span className="flex min-w-4 shrink-0 items-center justify-center gap-0.5" aria-label="Client voice status">
        {client.client_away === 1 && <Clock3 className="h-3.5 w-3.5 text-amber-400" aria-label={client.client_away_message || 'Away'} />}
        {(client.client_output_muted === 1 || client.client_output_hardware === 0) && <VolumeX className="h-3.5 w-3.5 text-rose-400" aria-label="Output muted" />}
        {(client.client_input_muted === 1 || client.client_input_hardware === 0) && <MicOff className="h-3.5 w-3.5 text-rose-400" aria-label="Microphone muted" />}
        {client.client_away !== 1
          && client.client_output_muted !== 1
          && client.client_output_hardware !== 0
          && client.client_input_muted !== 1
          && client.client_input_hardware !== 0
          && <span className={cn('h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-sky-400/15', client.client_flag_talking === 1 && 'bg-emerald-400 ring-emerald-400/20')} title={client.client_flag_talking === 1 ? 'Talking' : 'Available'} />}
      </span>
      <span className="truncate flex-1">{client.client_nickname}</span>
      </div>
      {isAdmin && (
        <>
        <div aria-hidden="true" className="relative z-20 w-[7.25rem] shrink-0 border-l border-border/40 bg-background/55" />
        <div className="relative z-20 flex w-8 shrink-0 self-stretch items-center justify-center border-l border-border/60 bg-background/95" title="Client actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 group-hover/client:opacity-100 data-[state=open]:opacity-100"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Actions for ${client.client_nickname}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => onAction('manage', client)}><UserRoundCog className="h-3.5 w-3.5 mr-2" />Manage client</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onAction('move', client)}><Move className="h-3.5 w-3.5 mr-2" />Move to channel</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('message', client)}><MessageSquare className="h-3.5 w-3.5 mr-2" />Private message</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('poke', client)}><Zap className="h-3.5 w-3.5 mr-2" />Poke</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onAction('kick', client)}><LogOut className="h-3.5 w-3.5 mr-2" />Kick from server</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onAction('ban', client)}><Ban className="h-3.5 w-3.5 mr-2" />Ban for 1 hour</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </>
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: ChannelNode;
  depth?: number;
  isAdmin: boolean;
  clientsByChannel: Map<number, ClientInfo[]>;
  onDelete: (cid: number, name: string) => void;
  onEdit: (node: ChannelNode) => void;
  onDropChannel: (draggedCid: number, targetCid: number) => void;
  onDropClient: (clid: number, targetCid: number) => void;
  onClientAction: (action: ClientAction, client: ClientInfo) => void;
  onBulkMove: (node: ChannelNode) => void;
  onMessage: (node: ChannelNode) => void;
  onPermissions: (cid: number) => void;
  draggedCid: number | null;
  setDraggedCid: (cid: number | null) => void;
}

function ChannelTreeNode({ node, depth = 0, isAdmin, clientsByChannel, onDelete, onEdit, onDropChannel, onDropClient, onClientAction, onBulkMove, onMessage, onPermissions, draggedCid, setDraggedCid }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [dropOver, setDropOver] = useState(false);
  const hasChildren = node.children.length > 0;
  const clients = clientsByChannel.get(node.cid) || [];
  const hasContent = hasChildren || clients.length > 0;
  const spacer = parseSpacer(node);

  if (spacer) {
    const lineContent = spacer.content || '─';
    const markdownRule = /^([-_*=_─━—·•])\1{2,}$/.test(lineContent);
    return (
      <div className="group/spacer relative isolate flex min-h-7 items-stretch overflow-hidden rounded-md p-0" title={isAdmin ? node.channel_name : undefined}>
        <div className="relative isolate flex min-w-0 flex-1 items-center overflow-hidden py-1 pr-3" style={{ paddingLeft: `${depth * 16 + 12}px` }}>
        <ChannelBannerBackground key={node.channel_banner_gfx_url} node={node} subtle />
        <div className="relative z-10 min-w-0 flex-1">
        {spacer.mode === 'blank' && !spacer.content && <div className="h-2 w-full" />}
        {spacer.mode === 'blank' && spacer.content && (markdownRule
          ? <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
          : <span className="w-full truncate text-xs text-muted-foreground/60">{spacer.content}</span>)}
        {spacer.mode === 'repeat' && <div className="w-full overflow-hidden whitespace-nowrap text-center font-mono-data text-[10px] leading-none tracking-wider text-border" aria-label={spacer.content || 'separator'}>{lineContent.repeat(160)}</div>}
        {spacer.mode === 'center' && <div className="w-full px-10 text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary/90">{spacer.content}</div>}
        {spacer.mode === 'left' && <div className="w-full pr-10 text-left text-xs font-semibold tracking-wide text-foreground/80">{spacer.content}</div>}
        {spacer.mode === 'right' && <div className="w-full pl-10 pr-8 text-right text-xs font-semibold tracking-wide text-foreground/80">{spacer.content}</div>}
        </div>
        </div>
        {isAdmin && <><div aria-hidden="true" className="relative z-20 w-[7.25rem] shrink-0 border-l border-border/40 bg-background/55" /><div className="relative z-20 flex w-8 shrink-0 self-stretch items-center justify-center border-l border-border/60 bg-background/95" title="Spacer actions"><DropdownMenu><DropdownMenuTrigger asChild><button className="rounded-md p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 group-hover/spacer:opacity-100 data-[state=open]:opacity-100" aria-label={`Actions for spacer ${node.cid}`}><MoreHorizontal className="h-3.5 w-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onSelect={() => onEdit(node)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit spacer</DropdownMenuItem><DropdownMenuItem onSelect={() => onPermissions(node.cid)}><KeyRound className="mr-2 h-3.5 w-3.5" />Permissions</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(node.cid, node.channel_name)}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete spacer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></>}
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(node.cid));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedCid(node.cid);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const isClient = Array.from(e.dataTransfer.types).includes('application/x-ts6-client');
    if (isClient || (draggedCid && draggedCid !== node.cid)) {
      setDropOver(true);
    }
  };

  const handleDragLeave = () => setDropOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOver(false);
    const clid = Number(e.dataTransfer.getData('application/x-ts6-client'));
    if (clid) {
      onDropClient(clid, node.cid);
      return;
    }
    const cidStr = e.dataTransfer.getData('text/plain');
    const cid = Number(cidStr);
    if (cid && cid !== node.cid) {
      onDropChannel(cid, node.cid);
    }
  };

  const handleDragEnd = () => setDraggedCid(null);

  return (
    <div>
      <div
        className={cn(
          'relative isolate flex min-h-9 items-stretch overflow-hidden rounded-md border border-transparent p-0 text-sm transition-all group hover:border-border/60 hover:bg-muted/35',
          isAdmin && 'cursor-grab active:cursor-grabbing',
          dropOver && 'bg-primary/10 ring-1 ring-primary/40',
          draggedCid === node.cid && 'opacity-40',
        )}
        draggable={isAdmin}
        onDragStart={isAdmin ? handleDragStart : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      >
        <div
          className="relative isolate flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden py-1 pr-2"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
        <ChannelBannerBackground key={node.channel_banner_gfx_url} node={node} />
        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {hasContent ? (
          <button onClick={() => setExpanded(!expanded)} className="rounded p-0.5 hover:bg-muted">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}

        {node.channel_icon_id !== 0 ? (
          <TeamSpeakIcon
            configId={Number(useServerStore.getState().selectedConfigId)}
            sid={Number(useServerStore.getState().selectedSid)}
            iconId={node.channel_icon_id}
            className="h-[18px] w-[18px]"
          />
        ) : (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-primary/10"><Hash className="h-3 w-3 text-primary/80" /></span>
        )}

        <div className="min-w-0 flex-1"><div className="truncate font-medium text-foreground/90">{node.channel_name}</div>{node.channel_topic && <div className="truncate text-[10px] leading-3 text-muted-foreground">{node.channel_topic}</div>}</div>

        </div>
        </div>
        <div
          className="relative z-20 flex w-12 shrink-0 items-center justify-center border-l border-border/60 bg-background/90 px-1 backdrop-blur-[1px]"
          title={`Channel ID ${node.cid}`}
        >
          <span className="max-w-full truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono-data text-[9px] text-muted-foreground/80">#{node.cid}</span>
        </div>
        <div
          className="relative z-20 flex w-7 shrink-0 items-center justify-center border-l border-border/60 bg-background/90 backdrop-blur-[1px]"
          title={node.channel_flag_password === 1 ? 'Password protected' : 'No password'}
        >
          {node.channel_flag_password === 1
            ? <Lock className="h-3 w-3 text-amber-400/80" />
            : <Unlock className="h-3 w-3 text-emerald-400/55" />}
        </div>
        <div
          className="relative z-20 flex w-10 shrink-0 items-center justify-center border-l border-border/60 bg-background/90 backdrop-blur-[1px]"
          title={`${clients.length || node.total_clients || 0} connected clients`}
        >
          <span className="flex items-center gap-0.5 font-mono-data text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" />
            {clients.length || node.total_clients || 0}
          </span>
        </div>
        {isAdmin && (
          <div className="relative z-20 flex w-8 shrink-0 self-stretch items-center justify-center border-l border-border/60 bg-background/95 backdrop-blur-[1px]" title="Channel actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Actions for ${node.channel_name}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => onEdit(node)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit channel</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onMessage(node)}><MessageSquare className="h-3.5 w-3.5 mr-2" />Send channel message</DropdownMenuItem>
                {clients.length > 0 && <DropdownMenuItem onSelect={() => onBulkMove(node)}><UserRoundCog className="h-3.5 w-3.5 mr-2" />Move all clients</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => onPermissions(node.cid)}><KeyRound className="h-3.5 w-3.5 mr-2" />Permissions</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(node.cid, node.channel_name)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete channel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {expanded && (
        <>
          {clients.map((client) => (
            <ClientEntry key={client.clid} client={client} depth={depth + 1} isAdmin={isAdmin} onAction={onClientAction} />
          ))}
          {node.children.map((child) => (
            <ChannelTreeNode
              key={child.cid}
              node={child}
              depth={depth + 1}
              isAdmin={isAdmin}
              clientsByChannel={clientsByChannel}
              onDelete={onDelete}
              onEdit={onEdit}
              onDropChannel={onDropChannel}
              onDropClient={onDropClient}
              onClientAction={onClientAction}
              onBulkMove={onBulkMove}
              onMessage={onMessage}
              onPermissions={onPermissions}
              draggedCid={draggedCid}
              setDraggedCid={setDraggedCid}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default function Channels() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedConfigId, selectedSid } = useServerStore();
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const { data: channelData, isLoading: channelsLoading, isFetching: channelsFetching, dataUpdatedAt: channelsUpdatedAt } = useChannels();
  const { data: clientData, isFetching: clientsFetching, dataUpdatedAt: clientsUpdatedAt } = useClients();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const editChannel = useEditChannel();
  const moveChannel = useMoveChannel();
  const moveClient = useMoveClient();
  const messageClient = useMessageClient();
  const pokeClient = usePokeClient();
  const kickClient = useKickClient();
  const banClient = useBanClient();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ cid: number; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<ChannelNode | null>(null);
  const [editForm, setEditForm] = useState<ChannelEditForm>(emptyEditForm);
  const [originalEditForm, setOriginalEditForm] = useState<ChannelEditForm>(emptyEditForm);
  const [loadingChannelDetails, setLoadingChannelDetails] = useState(false);
  const [newName, setNewName] = useState('');
  const [draggedCid, setDraggedCid] = useState<number | null>(null);
  const [clientAction, setClientAction] = useState<{ action: ClientAction; client: ClientInfo } | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [moveTargetCid, setMoveTargetCid] = useState('');
  const [bulkMoveTarget, setBulkMoveTarget] = useState<ChannelNode | null>(null);
  const [bulkMoveDestination, setBulkMoveDestination] = useState('');
  const [movingBulk, setMovingBulk] = useState(false);
  const [channelMessageTarget, setChannelMessageTarget] = useState<ChannelNode | null>(null);
  const [channelMessage, setChannelMessage] = useState('');
  const [sendingChannelMessage, setSendingChannelMessage] = useState(false);
  const [narrowView, setNarrowView] = useState(() => localStorage.getItem('ts6-channels-narrow-view') === '1');
  const [refreshClock, setRefreshClock] = useState(() => Date.now());

  useEffect(() => {
    setRefreshClock(Date.now());
    const timer = window.setInterval(() => setRefreshClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [selectedConfigId, selectedSid]);

  const tree = useMemo(() => {
    if (!channelData || !Array.isArray(channelData)) return [];
    return buildTree(channelData);
  }, [channelData]);

  const clientsByChannel = useMemo(() => {
    const map = new Map<number, ClientInfo[]>();
    if (!clientData || !Array.isArray(clientData)) return map;
    for (const c of clientData) {
      if (String(c.client_type) !== '0') continue;
      const cid = Number(c.cid);
      const entry: ClientInfo = {
        clid: Number(c.clid),
        cid,
        client_nickname: c.client_nickname || '?',
        client_type: String(c.client_type),
        client_away: Number(c.client_away) || 0,
        client_away_message: String(c.client_away_message || ''),
        client_flag_talking: Number(c.client_flag_talking) || 0,
        client_input_muted: Number(c.client_input_muted) || 0,
        client_output_muted: Number(c.client_output_muted) || 0,
        client_input_hardware: Number(c.client_input_hardware) === 0 ? 0 : 1,
        client_output_hardware: Number(c.client_output_hardware) === 0 ? 0 : 1,
      };
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(entry);
    }
    return map;
  }, [clientData]);

  const channelOptions = useMemo(() => {
    if (!Array.isArray(channelData)) return [];
    return channelData
      .filter((channel: any) => !String(channel.channel_name || '').includes('spacer'))
      .map((channel: any) => ({ cid: Number(channel.cid), name: String(channel.channel_name || `Channel #${channel.cid}`) }));
  }, [channelData]);

  if (!selectedConfigId || !selectedSid) return <EmptyState icon={Hash} title="No server selected" />;
  if (channelsLoading) return <PageLoader />;

  const handleCreate = () => {
    if (!newName.trim()) return;
    createChannel.mutate({ channel_name: newName, channel_flag_permanent: 1 }, {
      onSuccess: () => { toast.success('Channel created'); setShowCreate(false); setNewName(''); },
      onError: () => toast.error('Failed to create channel'),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteChannel.mutate(deleteTarget.cid, {
      onSuccess: () => { toast.success('Channel deleted'); setDeleteTarget(null); },
      onError: () => toast.error('Failed to delete channel'),
    });
  };

  const handleEditOpen = async (node: ChannelNode) => {
    setEditTarget(node);
    setLoadingChannelDetails(true);
    try {
      const response = await channelsApi.get(selectedConfigId!, selectedSid!, node.cid);
      const details = Array.isArray(response) ? response[0] : response;
      const channel = details || node;
      const loadedForm: ChannelEditForm = {
        channel_name: asText(channel.channel_name, node.channel_name),
        channel_topic: asText(channel.channel_topic, node.channel_topic || ''),
        channel_description: asText(channel.channel_description),
        channel_password: '',
        channel_name_phonetic: asText(channel.channel_name_phonetic),
        channel_codec: asText(channel.channel_codec, '4'),
        channel_codec_quality: asText(channel.channel_codec_quality, '6'),
        audio_encrypted: !asBool(channel.channel_codec_is_unencrypted),
        permanence: asBool(channel.channel_flag_permanent) ? 'permanent' : asBool(channel.channel_flag_semi_permanent) ? 'semi' : 'temporary',
        channel_flag_default: asBool(channel.channel_flag_default),
        channel_flag_maxclients_unlimited: channel.channel_flag_maxclients_unlimited === undefined ? true : asBool(channel.channel_flag_maxclients_unlimited),
        channel_maxclients: asText(channel.channel_maxclients, '0'),
        family_limit_mode: asBool(channel.channel_flag_maxfamilyclients_inherited) ? 'inherited' : asBool(channel.channel_flag_maxfamilyclients_unlimited) ? 'unlimited' : 'limited',
        channel_maxfamilyclients: asText(channel.channel_maxfamilyclients, '0'),
        channel_needed_talk_power: asText(channel.channel_needed_talk_power, '0'),
        channel_delete_delay: asText(channel.channel_delete_delay, '0'),
        channel_banner_gfx_url: asText(channel.channel_banner_gfx_url),
        channel_banner_mode: asText(channel.channel_banner_mode, '0'),
      };
      setEditForm(loadedForm);
      setOriginalEditForm(loadedForm);
    } catch (error: any) {
      const fallbackForm = { ...emptyEditForm, channel_name: node.channel_name, channel_topic: node.channel_topic || '', channel_codec_quality: String(node.channel_codec_quality || 6) };
      setEditForm(fallbackForm);
      setOriginalEditForm(fallbackForm);
      toast.error(error?.response?.data?.error || 'Could not load every channel setting');
    } finally {
      setLoadingChannelDetails(false);
    }
  };

  const handleEditSave = () => {
    if (!editTarget || !editForm.channel_name.trim()) return;
    const data: Record<string, string | number> = {};
    const changedText = (key: keyof ChannelEditForm, apiKey = key) => {
      if (editForm[key] !== originalEditForm[key]) data[String(apiKey)] = String(editForm[key]);
    };
    const changedNumber = (key: keyof ChannelEditForm, apiKey = key) => {
      if (Number(editForm[key]) !== Number(originalEditForm[key])) data[String(apiKey)] = Number(editForm[key]) || 0;
    };

    if (editForm.channel_name.trim() !== originalEditForm.channel_name) data.channel_name = editForm.channel_name.trim();
    changedText('channel_topic');
    changedText('channel_description');
    changedText('channel_name_phonetic');
    changedNumber('channel_codec');
    changedNumber('channel_codec_quality');
    if (editForm.audio_encrypted !== originalEditForm.audio_encrypted) data.channel_codec_is_unencrypted = editForm.audio_encrypted ? 0 : 1;
    if (editForm.permanence !== originalEditForm.permanence) {
      data.channel_flag_permanent = editForm.permanence === 'permanent' ? 1 : 0;
      data.channel_flag_semi_permanent = editForm.permanence === 'semi' ? 1 : 0;
    }
    if (editForm.channel_flag_default !== originalEditForm.channel_flag_default) data.channel_flag_default = editForm.channel_flag_default ? 1 : 0;
    if (editForm.channel_flag_maxclients_unlimited !== originalEditForm.channel_flag_maxclients_unlimited) data.channel_flag_maxclients_unlimited = editForm.channel_flag_maxclients_unlimited ? 1 : 0;
    if (!editForm.channel_flag_maxclients_unlimited) changedNumber('channel_maxclients');
    if (editForm.family_limit_mode !== originalEditForm.family_limit_mode) {
      data.channel_flag_maxfamilyclients_unlimited = editForm.family_limit_mode === 'unlimited' ? 1 : 0;
      data.channel_flag_maxfamilyclients_inherited = editForm.family_limit_mode === 'inherited' ? 1 : 0;
    }
    if (editForm.family_limit_mode === 'limited') changedNumber('channel_maxfamilyclients');
    changedNumber('channel_needed_talk_power');
    changedNumber('channel_delete_delay');
    changedText('channel_banner_gfx_url');
    changedNumber('channel_banner_mode');
    if (editForm.channel_password) data.channel_password = editForm.channel_password;
    if (Object.keys(data).length === 0) {
      toast.info('No channel settings changed');
      setEditTarget(null);
      return;
    }
    editChannel.mutate({ cid: editTarget.cid, data }, {
      onSuccess: () => { toast.success('Channel updated'); setEditTarget(null); },
      onError: (error: any) => toast.error(error?.response?.data?.error || 'Failed to update channel'),
    });
  };

  const handleBulkMove = async () => {
    if (!bulkMoveTarget || !bulkMoveDestination) return;
    const sourceClients = clientsByChannel.get(bulkMoveTarget.cid) || [];
    if (sourceClients.length === 0) {
      toast.info('There are no clients to move');
      setBulkMoveTarget(null);
      return;
    }
    setMovingBulk(true);
    const results = await Promise.allSettled(
      sourceClients.map((client) => clientsApi.move(selectedConfigId!, selectedSid!, client.clid, Number(bulkMoveDestination))),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    const moved = results.length - failed;
    await queryClient.invalidateQueries({ queryKey: ['clients'] });
    if (failed === 0) toast.success(`${moved} client${moved === 1 ? '' : 's'} moved`);
    else if (moved > 0) toast.warning(`${moved} moved, ${failed} failed`);
    else toast.error('No clients could be moved');
    setMovingBulk(false);
    setBulkMoveTarget(null);
    setBulkMoveDestination('');
  };

  const sendChannelMessage = async () => {
    if (!channelMessageTarget || !channelMessage.trim() || !selectedConfigId || !selectedSid) return;
    setSendingChannelMessage(true);
    try {
      await channelsApi.message(selectedConfigId, selectedSid, channelMessageTarget.cid, channelMessage.trim());
      toast.success(`Message sent to ${channelMessageTarget.channel_name}`);
      setChannelMessageTarget(null);
      setChannelMessage('');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to send channel message');
    } finally { setSendingChannelMessage(false); }
  };

  const handleDrop = (draggedCid: number, targetCid: number) => {
    moveChannel.mutate({ cid: draggedCid, data: { cpid: targetCid } }, {
      onSuccess: () => toast.success('Channel moved'),
      onError: () => toast.error('Failed to move channel'),
    });
  };

  const handleMoveClient = (clid: number, targetCid: number, closeDialog = false) => {
    moveClient.mutate({ clid, cid: targetCid }, {
      onSuccess: () => {
        toast.success('Client moved');
        if (closeDialog) setClientAction(null);
      },
      onError: (error: any) => toast.error(error?.response?.data?.error || 'Failed to move client'),
    });
  };

  const openClientAction = (action: ClientAction, client: ClientInfo) => {
    if (action === 'manage') {
      navigate(`/clients?clid=${client.clid}`);
      return;
    }
    setActionMessage('');
    setMoveTargetCid('');
    setClientAction({ action, client });
  };

  const submitClientAction = () => {
    if (!clientAction) return;
    const { action, client } = clientAction;
    const close = () => { setClientAction(null); setActionMessage(''); setMoveTargetCid(''); };
    const fail = (error: any) => toast.error(error?.response?.data?.error || `Failed to ${action} client`);

    if (action === 'move' && moveTargetCid) {
      handleMoveClient(client.clid, Number(moveTargetCid), true);
    } else if (action === 'message' && actionMessage.trim()) {
      messageClient.mutate({ clid: client.clid, msg: actionMessage.trim() }, { onSuccess: () => { toast.success('Private message sent'); close(); }, onError: fail });
    } else if (action === 'poke' && actionMessage.trim()) {
      pokeClient.mutate({ clid: client.clid, msg: actionMessage.trim() }, { onSuccess: () => { toast.success('Poke sent'); close(); }, onError: fail });
    } else if (action === 'kick') {
      kickClient.mutate({ clid: client.clid, reasonid: 5, reasonmsg: 'Kicked by administrator' }, { onSuccess: () => { toast.success('Client kicked'); close(); }, onError: fail });
    } else if (action === 'ban') {
      banClient.mutate({ clid: client.clid, time: 3600, banreason: 'Banned by administrator' }, { onSuccess: () => { toast.success('Client banned for 1 hour'); close(); }, onError: fail });
    }
  };

  const totalClients = clientsByChannel.size > 0
    ? Array.from(clientsByChannel.values()).reduce((sum, arr) => sum + arr.length, 0)
    : 0;
  const spacerCount = tree.filter((node) => parseSpacer(node) !== null).length;
  const channelCount = Math.max(0, (Array.isArray(channelData) ? channelData.length : 0) - spacerCount);
  const occupiedChannels = Array.from(clientsByChannel.values()).filter((clients) => clients.length > 0).length;
  const lastRefreshAt = Math.max(channelsUpdatedAt || 0, clientsUpdatedAt || 0);
  const refreshSeconds = lastRefreshAt > 0
    ? Math.max(0, Math.ceil((lastRefreshAt + 10_000 - refreshClock) / 1000))
    : 0;
  const refreshing = channelsFetching || clientsFetching;
  const changeViewMode = (narrow: boolean) => {
    setNarrowView(narrow);
    localStorage.setItem('ts6-channels-narrow-view', narrow ? '1' : '0');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Channels</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Live TeamSpeak hierarchy and channel management.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-lg border bg-card/60 px-3 py-1.5 text-xs"><Hash className="h-3.5 w-3.5 text-primary" /><span className="font-semibold">{channelCount}</span><span className="text-muted-foreground">channels</span></div><div className="flex items-center gap-2 rounded-lg border bg-card/60 px-3 py-1.5 text-xs"><Users className="h-3.5 w-3.5 text-emerald-400" /><span className="font-semibold">{totalClients}</span><span className="text-muted-foreground">online</span></div><div className="hidden items-center gap-2 rounded-lg border bg-card/60 px-3 py-1.5 text-xs sm:flex"><Volume2 className="h-3.5 w-3.5 text-violet-400" /><span className="font-semibold">{occupiedChannels}</span><span className="text-muted-foreground">active</span></div><div className="flex items-center rounded-lg border bg-card/60 p-0.5"><Button type="button" size="sm" variant={narrowView ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => changeViewMode(true)} title="Use a TeamSpeak-like narrow server tree"><PanelLeft className="mr-1 h-3.5 w-3.5" />TS6 narrow</Button><Button type="button" size="sm" variant={!narrowView ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => changeViewMode(false)} title="Use all available width"><Maximize2 className="mr-1 h-3.5 w-3.5" />Full</Button></div>{isAdmin && <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-4 w-4" />Create Channel</Button>}</div>
      </div>

      <Card className={cn('w-full overflow-hidden border-border/70 shadow-sm transition-[max-width] duration-200', narrowView && 'mx-auto max-w-[40rem]')}>
        <CardHeader className="border-b bg-gradient-to-r from-primary/[0.06] via-card to-card px-4 py-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">
            <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10"><Volume2 className="h-4 w-4 text-primary" /></span><span>TeamSpeak channel tree</span></span>
            <span className="flex items-center gap-3 text-[10px] font-normal text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Connected client</span><span className="flex min-w-[5.75rem] items-center justify-end gap-1.5" title="Live channel and client data refresh every 10 seconds"><RefreshCw className={cn('h-3 w-3 text-sky-400', refreshing && 'animate-spin')} />{refreshing ? 'Refreshing…' : `Refresh in ${refreshSeconds}s`}</span></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[calc(100vh-15rem)] min-h-[560px] max-h-[780px]">
            <div className="space-y-0.5 pr-3">
              {tree.map((node) => (
                <ChannelTreeNode
                  key={node.cid}
                  node={node}
                  isAdmin={isAdmin}
                  clientsByChannel={clientsByChannel}
                  onDelete={(cid, name) => setDeleteTarget({ cid, name })}
                  onEdit={handleEditOpen}
                  onDropChannel={handleDrop}
                  onDropClient={(clid, cid) => handleMoveClient(clid, cid)}
                  onClientAction={openClientAction}
                  onBulkMove={(node) => { setBulkMoveDestination(''); setBulkMoveTarget(node); }}
                  onMessage={(node) => { setChannelMessage(''); setChannelMessageTarget(node); }}
                  onPermissions={(cid) => navigate(`/permissions?layer=channel&id=${cid}`)}
                  draggedCid={draggedCid}
                  setDraggedCid={setDraggedCid}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Channel Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New Channel" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createChannel.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Channel · {editTarget?.channel_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[68vh] pr-4">
            {loadingChannelDetails ? <div className="py-16 text-center text-sm text-muted-foreground">Loading channel settings…</div> : (
              <div className="space-y-5">
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label className="text-xs">Channel Name</Label><Input value={editForm.channel_name} onChange={(e) => setEditForm({ ...editForm, channel_name: e.target.value })} /></div>
                    <div><Label className="text-xs">Phonetic Name</Label><Input value={editForm.channel_name_phonetic} onChange={(e) => setEditForm({ ...editForm, channel_name_phonetic: e.target.value })} placeholder="Optional" /></div>
                  </div>
                  <div><Label className="text-xs">Topic</Label><Input value={editForm.channel_topic} onChange={(e) => setEditForm({ ...editForm, channel_topic: e.target.value })} placeholder="Optional" /></div>
                  <div><Label className="text-xs">Description</Label><Textarea className="min-h-24" value={editForm.channel_description} onChange={(e) => setEditForm({ ...editForm, channel_description: e.target.value })} placeholder="Optional" /></div>
                  <div><Label className="text-xs">Password</Label><Input type="password" value={editForm.channel_password} onChange={(e) => setEditForm({ ...editForm, channel_password: e.target.value })} placeholder="Leave empty to keep current" /></div>
                </section>

                <section className="space-y-3 border-t border-border/60 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audio</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label className="text-xs">Codec</Label><Select value={editForm.channel_codec} onValueChange={(value) => setEditForm({ ...editForm, channel_codec: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="4">Opus Voice</SelectItem><SelectItem value="5">Opus Music</SelectItem></SelectContent></Select></div>
                    <div><Label className="text-xs">Quality (0–10)</Label><Select value={editForm.channel_codec_quality} onValueChange={(value) => setEditForm({ ...editForm, channel_codec_quality: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 11 }, (_, quality) => <SelectItem key={quality} value={String(quality)}>{quality}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/60 p-3"><div><Label>Encrypted audio</Label><p className="text-xs text-muted-foreground">Keep voice traffic encrypted.</p></div><Switch checked={editForm.audio_encrypted} onCheckedChange={(checked) => setEditForm({ ...editForm, audio_encrypted: checked })} /></div>
                </section>

                <section className="space-y-3 border-t border-border/60 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capacity and access</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label className="text-xs">Client limit</Label><div className="mt-1 flex items-center gap-3"><Switch checked={editForm.channel_flag_maxclients_unlimited} onCheckedChange={(checked) => setEditForm({ ...editForm, channel_flag_maxclients_unlimited: checked })} /><span className="text-xs text-muted-foreground">Unlimited</span><Input className="ml-auto w-24" type="number" min="0" disabled={editForm.channel_flag_maxclients_unlimited} value={editForm.channel_maxclients} onChange={(e) => setEditForm({ ...editForm, channel_maxclients: e.target.value })} /></div></div>
                    <div><Label className="text-xs">Channel family limit</Label><Select value={editForm.family_limit_mode} onValueChange={(value: ChannelEditForm['family_limit_mode']) => setEditForm({ ...editForm, family_limit_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unlimited">Unlimited</SelectItem><SelectItem value="inherited">Inherited</SelectItem><SelectItem value="limited">Custom limit</SelectItem></SelectContent></Select></div>
                    {editForm.family_limit_mode === 'limited' && <div><Label className="text-xs">Family clients</Label><Input type="number" min="0" value={editForm.channel_maxfamilyclients} onChange={(e) => setEditForm({ ...editForm, channel_maxfamilyclients: e.target.value })} /></div>}
                    <div><Label className="text-xs">Needed talk power</Label><Input type="number" min="0" value={editForm.channel_needed_talk_power} onChange={(e) => setEditForm({ ...editForm, channel_needed_talk_power: e.target.value })} /></div>
                  </div>
                </section>

                <section className="space-y-3 border-t border-border/60 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lifecycle</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label className="text-xs">Channel type</Label><Select value={editForm.permanence} onValueChange={(value: ChannelEditForm['permanence']) => setEditForm({ ...editForm, permanence: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="permanent">Permanent</SelectItem><SelectItem value="semi">Semi-permanent</SelectItem><SelectItem value="temporary">Temporary</SelectItem></SelectContent></Select></div>
                    <div><Label className="text-xs">Delete delay (seconds)</Label><Input type="number" min="0" value={editForm.channel_delete_delay} onChange={(e) => setEditForm({ ...editForm, channel_delete_delay: e.target.value })} /></div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/60 p-3"><div><Label>Default channel</Label><p className="text-xs text-muted-foreground">New clients enter this channel.</p></div><Switch checked={editForm.channel_flag_default} onCheckedChange={(checked) => setEditForm({ ...editForm, channel_flag_default: checked })} /></div>
                </section>

                <section className="space-y-3 border-t border-border/60 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h3>
                  <div><Label className="text-xs">Banner URL</Label><Input value={editForm.channel_banner_gfx_url} onChange={(e) => setEditForm({ ...editForm, channel_banner_gfx_url: e.target.value })} placeholder="https://…" /></div>
                  <div><Label className="text-xs">Banner mode</Label><Select value={editForm.channel_banner_mode} onValueChange={(value) => setEditForm({ ...editForm, channel_banner_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">No adjustment</SelectItem><SelectItem value="1">Stretch</SelectItem><SelectItem value="2">Keep aspect ratio</SelectItem></SelectContent></Select></div>
                  <p className="text-xs text-muted-foreground">Existing channel icons are displayed. Direct icon assignment is unavailable because the current TS6 Query rejects that operation.</p>
                </section>
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={loadingChannelDetails || !editForm.channel_name.trim() || editChannel.isPending}>
              {editChannel.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkMoveTarget} onOpenChange={(open) => { if (!open && !movingBulk) { setBulkMoveTarget(null); setBulkMoveDestination(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move all clients · {bulkMoveTarget?.channel_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Move all {bulkMoveTarget ? (clientsByChannel.get(bulkMoveTarget.cid) || []).length : 0} connected clients from this channel.</p>
            <div><Label className="text-xs">Destination channel</Label><Select value={bulkMoveDestination} onValueChange={setBulkMoveDestination}><SelectTrigger><SelectValue placeholder="Select a channel" /></SelectTrigger><SelectContent>{channelOptions.filter((channel) => channel.cid !== bulkMoveTarget?.cid).map((channel) => <SelectItem key={channel.cid} value={String(channel.cid)}>{channel.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" disabled={movingBulk} onClick={() => setBulkMoveTarget(null)}>Cancel</Button><Button disabled={!bulkMoveDestination || movingBulk} onClick={handleBulkMove}>{movingBulk ? 'Moving…' : 'Move all clients'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!channelMessageTarget} onOpenChange={(open) => { if (!open && !sendingChannelMessage) setChannelMessageTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send message · {channelMessageTarget?.channel_name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Channel message</Label>
            <Textarea value={channelMessage} onChange={(event) => setChannelMessage(event.target.value)} maxLength={1024} autoFocus />
            <p className="text-[10px] text-muted-foreground text-right">{channelMessage.length}/1024</p>
          </div>
          <DialogFooter><Button variant="outline" disabled={sendingChannelMessage} onClick={() => setChannelMessageTarget(null)}>Cancel</Button><Button disabled={!channelMessage.trim() || sendingChannelMessage} onClick={sendChannelMessage}>{sendingChannelMessage ? 'Sending…' : 'Send to channel'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Channel"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        loading={deleteChannel.isPending}
      />

      <Dialog
        open={clientAction?.action === 'move'}
        onOpenChange={(open) => { if (!open) setClientAction(null); }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Move {clientAction?.client.client_nickname}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Destination channel</Label>
            <Select value={moveTargetCid} onValueChange={setMoveTargetCid}>
              <SelectTrigger><SelectValue placeholder="Select a channel" /></SelectTrigger>
              <SelectContent>
                {channelOptions
                  .filter((channel) => channel.cid !== clientAction?.client.cid)
                  .map((channel) => <SelectItem key={channel.cid} value={String(channel.cid)}>{channel.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientAction(null)}>Cancel</Button>
            <Button onClick={submitClientAction} disabled={!moveTargetCid || moveClient.isPending}>Move client</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clientAction?.action === 'message' || clientAction?.action === 'poke'}
        onOpenChange={(open) => { if (!open) setClientAction(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{clientAction?.action === 'poke' ? 'Poke' : 'Private message'} · {clientAction?.client.client_nickname}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Message</Label>
            <Textarea value={actionMessage} onChange={(event) => setActionMessage(event.target.value)} maxLength={1024} autoFocus />
            <p className="text-[10px] text-muted-foreground text-right">{actionMessage.length}/1024</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientAction(null)}>Cancel</Button>
            <Button onClick={submitClientAction} disabled={!actionMessage.trim() || messageClient.isPending || pokeClient.isPending}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clientAction?.action === 'kick'}
        onOpenChange={(open) => { if (!open) setClientAction(null); }}
        title="Kick client from server?"
        description={`This will disconnect "${clientAction?.client.client_nickname || ''}" from the virtual server.`}
        confirmLabel="Kick client"
        destructive
        onConfirm={submitClientAction}
        loading={kickClient.isPending}
      />

      <ConfirmDialog
        open={clientAction?.action === 'ban'}
        onOpenChange={(open) => { if (!open) setClientAction(null); }}
        title="Ban client for 1 hour?"
        description={`This will disconnect "${clientAction?.client.client_nickname || ''}" and prevent reconnection for one hour.`}
        confirmLabel="Ban client"
        destructive
        onConfirm={submitClientAction}
        loading={banClient.isPending}
      />
    </div>
  );
}
