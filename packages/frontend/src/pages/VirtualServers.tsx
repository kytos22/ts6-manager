import { useState } from 'react';
import { useVirtualServers } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatUptime } from '@/lib/utils';
import { Server, Play, Square, Users, Clock, Settings2 } from 'lucide-react';
import { serversApi } from '@/api/servers.api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ServerForm = {
  virtualserver_name: string;
  virtualserver_welcomemessage: string;
  virtualserver_password: string;
  virtualserver_maxclients: string;
  virtualserver_hostmessage: string;
  virtualserver_hostmessage_mode: string;
  virtualserver_default_server_group: string;
  virtualserver_default_channel_group: string;
  virtualserver_default_channel_admin_group: string;
  virtualserver_codec_encryption_mode: string;
  virtualserver_needed_identity_security_level: string;
  virtualserver_min_client_version: string;
  virtualserver_hostbanner_url: string;
  virtualserver_hostbanner_gfx_url: string;
  virtualserver_hostbanner_gfx_interval: string;
  virtualserver_hostbanner_mode: string;
  virtualserver_hostbutton_tooltip: string;
  virtualserver_hostbutton_url: string;
  virtualserver_hostbutton_gfx_url: string;
  virtualserver_antiflood_points_tick_reduce: string;
  virtualserver_antiflood_points_needed_command_block: string;
  virtualserver_antiflood_points_needed_ip_block: string;
  virtualserver_max_download_total_bandwidth: string;
  virtualserver_max_upload_total_bandwidth: string;
  virtualserver_download_quota: string;
  virtualserver_upload_quota: string;
  virtualserver_log_client: boolean;
  virtualserver_log_query: boolean;
  virtualserver_log_channel: boolean;
  virtualserver_log_permissions: boolean;
  virtualserver_log_server: boolean;
  virtualserver_log_filetransfer: boolean;
};

const emptyForm: ServerForm = {
  virtualserver_name: '', virtualserver_welcomemessage: '', virtualserver_password: '', virtualserver_maxclients: '32',
  virtualserver_hostmessage: '', virtualserver_hostmessage_mode: '0', virtualserver_default_server_group: '0',
  virtualserver_default_channel_group: '0', virtualserver_default_channel_admin_group: '0', virtualserver_codec_encryption_mode: '0',
  virtualserver_needed_identity_security_level: '8', virtualserver_min_client_version: '0', virtualserver_hostbanner_url: '',
  virtualserver_hostbanner_gfx_url: '', virtualserver_hostbanner_gfx_interval: '0', virtualserver_hostbanner_mode: '0',
  virtualserver_hostbutton_tooltip: '', virtualserver_hostbutton_url: '', virtualserver_hostbutton_gfx_url: '',
  virtualserver_antiflood_points_tick_reduce: '5', virtualserver_antiflood_points_needed_command_block: '150',
  virtualserver_antiflood_points_needed_ip_block: '250', virtualserver_log_client: false, virtualserver_log_query: false,
  virtualserver_max_download_total_bandwidth: '0', virtualserver_max_upload_total_bandwidth: '0',
  virtualserver_download_quota: '0', virtualserver_upload_quota: '0',
  virtualserver_log_channel: false, virtualserver_log_permissions: false, virtualserver_log_server: false,
  virtualserver_log_filetransfer: false,
};

const text = (value: unknown, fallback = '') => value === undefined || value === null ? fallback : String(value);
const flag = (value: unknown) => Number(value) === 1;
const first = (value: any) => Array.isArray(value) ? value[0] : value;
const errorText = (error: any, fallback: string) => error?.response?.data?.error || fallback;

export default function VirtualServers() {
  const { selectedConfigId } = useServerStore();
  const isAdmin = useAuthStore((state) => state.isAdmin());
  const { data, isLoading } = useVirtualServers();
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [form, setForm] = useState<ServerForm>(emptyForm);
  const [original, setOriginal] = useState<ServerForm>(emptyForm);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [powerTarget, setPowerTarget] = useState<{ sid: number; name: string; action: 'start' | 'stop' } | null>(null);
  const [powerPending, setPowerPending] = useState(false);

  if (!selectedConfigId) return <EmptyState icon={Server} title="No server selected" />;
  if (isLoading) return <PageLoader />;
  const servers = Array.isArray(data) ? data : [];

  const openEditor = async (server: any) => {
    setEditTarget(server);
    setLoadingInfo(true);
    try {
      const info = first(await serversApi.getVirtualInfo(selectedConfigId, Number(server.virtualserver_id))) || server;
      const loaded: ServerForm = {
        virtualserver_name: text(info.virtualserver_name),
        virtualserver_welcomemessage: text(info.virtualserver_welcomemessage),
        virtualserver_password: '',
        virtualserver_maxclients: text(info.virtualserver_maxclients, '32'),
        virtualserver_hostmessage: text(info.virtualserver_hostmessage),
        virtualserver_hostmessage_mode: text(info.virtualserver_hostmessage_mode, '0'),
        virtualserver_default_server_group: text(info.virtualserver_default_server_group, '0'),
        virtualserver_default_channel_group: text(info.virtualserver_default_channel_group, '0'),
        virtualserver_default_channel_admin_group: text(info.virtualserver_default_channel_admin_group, '0'),
        virtualserver_codec_encryption_mode: text(info.virtualserver_codec_encryption_mode, '0'),
        virtualserver_needed_identity_security_level: text(info.virtualserver_needed_identity_security_level, '8'),
        virtualserver_min_client_version: text(info.virtualserver_min_client_version, '0'),
        virtualserver_hostbanner_url: text(info.virtualserver_hostbanner_url),
        virtualserver_hostbanner_gfx_url: text(info.virtualserver_hostbanner_gfx_url),
        virtualserver_hostbanner_gfx_interval: text(info.virtualserver_hostbanner_gfx_interval, '0'),
        virtualserver_hostbanner_mode: text(info.virtualserver_hostbanner_mode, '0'),
        virtualserver_hostbutton_tooltip: text(info.virtualserver_hostbutton_tooltip),
        virtualserver_hostbutton_url: text(info.virtualserver_hostbutton_url),
        virtualserver_hostbutton_gfx_url: text(info.virtualserver_hostbutton_gfx_url),
        virtualserver_antiflood_points_tick_reduce: text(info.virtualserver_antiflood_points_tick_reduce, '5'),
        virtualserver_antiflood_points_needed_command_block: text(info.virtualserver_antiflood_points_needed_command_block, '150'),
        virtualserver_antiflood_points_needed_ip_block: text(info.virtualserver_antiflood_points_needed_ip_block, '250'),
        virtualserver_max_download_total_bandwidth: text(info.virtualserver_max_download_total_bandwidth, '0'),
        virtualserver_max_upload_total_bandwidth: text(info.virtualserver_max_upload_total_bandwidth, '0'),
        virtualserver_download_quota: text(info.virtualserver_download_quota, '0'),
        virtualserver_upload_quota: text(info.virtualserver_upload_quota, '0'),
        virtualserver_log_client: flag(info.virtualserver_log_client), virtualserver_log_query: flag(info.virtualserver_log_query),
        virtualserver_log_channel: flag(info.virtualserver_log_channel), virtualserver_log_permissions: flag(info.virtualserver_log_permissions),
        virtualserver_log_server: flag(info.virtualserver_log_server), virtualserver_log_filetransfer: flag(info.virtualserver_log_filetransfer),
      };
      setForm(loaded); setOriginal(loaded);
    } catch (error: any) {
      setEditTarget(null);
      toast.error(errorText(error, 'Failed to load virtual server settings'));
    } finally { setLoadingInfo(false); }
  };

  const save = async () => {
    if (!editTarget || !form.virtualserver_name.trim()) return;
    const changes: Record<string, string | number> = {};
    const strings: (keyof ServerForm)[] = [
      'virtualserver_welcomemessage', 'virtualserver_hostmessage', 'virtualserver_hostbanner_url',
      'virtualserver_hostbanner_gfx_url', 'virtualserver_hostbutton_tooltip', 'virtualserver_hostbutton_url', 'virtualserver_hostbutton_gfx_url',
    ];
    const numbers: (keyof ServerForm)[] = [
      'virtualserver_maxclients', 'virtualserver_hostmessage_mode', 'virtualserver_default_server_group',
      'virtualserver_default_channel_group', 'virtualserver_default_channel_admin_group', 'virtualserver_codec_encryption_mode',
      'virtualserver_needed_identity_security_level', 'virtualserver_min_client_version', 'virtualserver_hostbanner_gfx_interval',
      'virtualserver_hostbanner_mode', 'virtualserver_antiflood_points_tick_reduce',
      'virtualserver_antiflood_points_needed_command_block', 'virtualserver_antiflood_points_needed_ip_block',
      'virtualserver_max_download_total_bandwidth', 'virtualserver_max_upload_total_bandwidth',
      'virtualserver_download_quota', 'virtualserver_upload_quota',
    ];
    const booleans: (keyof ServerForm)[] = ['virtualserver_log_client', 'virtualserver_log_query', 'virtualserver_log_channel', 'virtualserver_log_permissions', 'virtualserver_log_server', 'virtualserver_log_filetransfer'];
    if (form.virtualserver_name.trim() !== original.virtualserver_name) changes.virtualserver_name = form.virtualserver_name.trim();
    for (const key of strings) if (form[key] !== original[key]) changes[key] = String(form[key]);
    for (const key of numbers) if (Number(form[key]) !== Number(original[key])) changes[key] = Number(form[key]) || 0;
    for (const key of booleans) if (form[key] !== original[key]) changes[key] = form[key] ? 1 : 0;
    if (form.virtualserver_password) changes.virtualserver_password = form.virtualserver_password;
    if (Object.keys(changes).length === 0) { toast.info('No virtual server settings changed'); setEditTarget(null); return; }
    setSaving(true);
    try {
      await serversApi.editVirtual(selectedConfigId, Number(editTarget.virtualserver_id), changes);
      toast.success('Virtual server updated');
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ['virtual-servers'] });
      qc.invalidateQueries({ queryKey: ['virtual-server-info'] });
    } catch (error: any) { toast.error(errorText(error, 'Failed to update virtual server')); }
    finally { setSaving(false); }
  };

  const confirmPower = async () => {
    if (!powerTarget) return;
    setPowerPending(true);
    try {
      if (powerTarget.action === 'start') await serversApi.startVirtual(selectedConfigId, powerTarget.sid);
      else await serversApi.stopVirtual(selectedConfigId, powerTarget.sid);
      toast.success(powerTarget.action === 'start' ? 'Server started' : 'Server stopped');
      setPowerTarget(null);
      qc.invalidateQueries({ queryKey: ['virtual-servers'] });
    } catch (error: any) { toast.error(errorText(error, `Failed to ${powerTarget.action} server`)); }
    finally { setPowerPending(false); }
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Virtual Servers</h1><Badge variant="secondary" className="font-mono-data">{servers.length} server(s)</Badge></div>
    <div className="grid gap-3">{servers.map((vs: any) => <Card key={vs.virtualserver_id} className="hover:border-primary/30 transition-colors"><CardContent className="p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4 min-w-0"><div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Server className="h-5 w-5 text-muted-foreground" /></div><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-medium truncate">{vs.virtualserver_name}</span><Badge variant={vs.virtualserver_status === 'online' ? 'success' : 'secondary'} className="text-[10px]">{vs.virtualserver_status?.toUpperCase()}</Badge></div><div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-muted-foreground"><span className="font-mono-data">SID: {vs.virtualserver_id}</span><span className="font-mono-data">Port: {vs.virtualserver_port}</span>{vs.virtualserver_status === 'online' && <><span className="flex items-center gap-1"><Users className="h-3 w-3" /> {Number(vs.virtualserver_clientsonline || 0) - Number(vs.virtualserver_queryclientsonline || 0)}/{vs.virtualserver_maxclients}</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatUptime(vs.virtualserver_uptime || 0)}</span></>}</div></div></div>{isAdmin && <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={vs.virtualserver_status !== 'online'} onClick={() => openEditor(vs)}><Settings2 className="h-3.5 w-3.5 mr-1" />Settings</Button>{vs.virtualserver_status === 'online' ? <Button variant="outline" size="sm" onClick={() => setPowerTarget({ sid: Number(vs.virtualserver_id), name: vs.virtualserver_name, action: 'stop' })}><Square className="h-3 w-3 mr-1" />Stop</Button> : <Button size="sm" onClick={() => setPowerTarget({ sid: Number(vs.virtualserver_id), name: vs.virtualserver_name, action: 'start' })}><Play className="h-3 w-3 mr-1" />Start</Button>}</div>}</div></CardContent></Card>)}</div>

    {editTarget && <Dialog open onOpenChange={(open) => { if (!open && !saving) setEditTarget(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Virtual server settings · {editTarget.virtualserver_name}</DialogTitle></DialogHeader><ScrollArea className="max-h-[70vh] pr-4">{loadingInfo ? <div className="py-16 text-center text-sm text-muted-foreground">Loading server settings…</div> : <div className="space-y-5">
      <Section title="Identity"><div className="grid gap-3 sm:grid-cols-2"><Field label="Server name"><Input value={form.virtualserver_name} onChange={(event) => setForm({ ...form, virtualserver_name: event.target.value })} /></Field><Field label="Password"><Input type="password" value={form.virtualserver_password} onChange={(event) => setForm({ ...form, virtualserver_password: event.target.value })} placeholder="Leave empty to keep current" /></Field></div><Field label="Welcome message"><Textarea value={form.virtualserver_welcomemessage} onChange={(event) => setForm({ ...form, virtualserver_welcomemessage: event.target.value })} /></Field></Section>
      <Section title="Capacity and defaults"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Maximum clients" field="virtualserver_maxclients" form={form} setForm={setForm} min={1} /><NumberField label="Default server group" field="virtualserver_default_server_group" form={form} setForm={setForm} /><NumberField label="Default channel group" field="virtualserver_default_channel_group" form={form} setForm={setForm} /><NumberField label="Default channel admin" field="virtualserver_default_channel_admin_group" form={form} setForm={setForm} /></div></Section>
      <Section title="Host message"><Field label="Message"><Textarea value={form.virtualserver_hostmessage} onChange={(event) => setForm({ ...form, virtualserver_hostmessage: event.target.value })} /></Field><Field label="Display mode"><Select value={form.virtualserver_hostmessage_mode} onValueChange={(value) => setForm({ ...form, virtualserver_hostmessage_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem><SelectItem value="1">Log</SelectItem><SelectItem value="2">Modal</SelectItem><SelectItem value="3">Modal and disconnect</SelectItem></SelectContent></Select></Field></Section>
      <Section title="Security"><div className="grid gap-3 sm:grid-cols-3"><Field label="Codec encryption"><Select value={form.virtualserver_codec_encryption_mode} onValueChange={(value) => setForm({ ...form, virtualserver_codec_encryption_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Configured per channel</SelectItem><SelectItem value="1">Globally disabled</SelectItem><SelectItem value="2">Globally enabled</SelectItem></SelectContent></Select></Field><NumberField label="Identity security level" field="virtualserver_needed_identity_security_level" form={form} setForm={setForm} min={0} /><NumberField label="Minimum client version" field="virtualserver_min_client_version" form={form} setForm={setForm} min={0} /></div></Section>
      <Section title="Anti-flood"><div className="grid gap-3 sm:grid-cols-3"><NumberField label="Points reduced per tick" field="virtualserver_antiflood_points_tick_reduce" form={form} setForm={setForm} min={0} /><NumberField label="Command block threshold" field="virtualserver_antiflood_points_needed_command_block" form={form} setForm={setForm} min={0} /><NumberField label="IP block threshold" field="virtualserver_antiflood_points_needed_ip_block" form={form} setForm={setForm} min={0} /></div></Section>
      <Section title="File transfer limits"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Download bandwidth (bytes/s)" field="virtualserver_max_download_total_bandwidth" form={form} setForm={setForm} min={0} /><NumberField label="Upload bandwidth (bytes/s)" field="virtualserver_max_upload_total_bandwidth" form={form} setForm={setForm} min={0} /><NumberField label="Download quota (MB)" field="virtualserver_download_quota" form={form} setForm={setForm} min={0} /><NumberField label="Upload quota (MB)" field="virtualserver_upload_quota" form={form} setForm={setForm} min={0} /></div><p className="text-xs text-muted-foreground">Use 0 for unlimited. Download refers to data sent by the server; upload refers to data received by the server.</p></Section>
      <Section title="Banner and host button"><div className="grid gap-3 sm:grid-cols-2"><Field label="Banner link URL"><Input value={form.virtualserver_hostbanner_url} onChange={(event) => setForm({ ...form, virtualserver_hostbanner_url: event.target.value })} /></Field><Field label="Banner image URL"><Input value={form.virtualserver_hostbanner_gfx_url} onChange={(event) => setForm({ ...form, virtualserver_hostbanner_gfx_url: event.target.value })} /></Field><NumberField label="Banner reload interval" field="virtualserver_hostbanner_gfx_interval" form={form} setForm={setForm} min={0} /><Field label="Banner mode"><Select value={form.virtualserver_hostbanner_mode} onValueChange={(value) => setForm({ ...form, virtualserver_hostbanner_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">No adjustment</SelectItem><SelectItem value="1">Stretch</SelectItem><SelectItem value="2">Keep aspect ratio</SelectItem></SelectContent></Select></Field><Field label="Button tooltip"><Input value={form.virtualserver_hostbutton_tooltip} onChange={(event) => setForm({ ...form, virtualserver_hostbutton_tooltip: event.target.value })} /></Field><Field label="Button link URL"><Input value={form.virtualserver_hostbutton_url} onChange={(event) => setForm({ ...form, virtualserver_hostbutton_url: event.target.value })} /></Field><Field label="Button image URL"><Input value={form.virtualserver_hostbutton_gfx_url} onChange={(event) => setForm({ ...form, virtualserver_hostbutton_gfx_url: event.target.value })} /></Field></div></Section>
      <Section title="Logging"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{([['virtualserver_log_client','Client actions'],['virtualserver_log_query','Query actions'],['virtualserver_log_channel','Channel actions'],['virtualserver_log_permissions','Permission changes'],['virtualserver_log_server','Server changes'],['virtualserver_log_filetransfer','File transfers']] as [keyof ServerForm,string][]).map(([key,label]) => <div key={key} className="flex items-center justify-between rounded-md border p-3"><Label>{label}</Label><Switch checked={Boolean(form[key])} onCheckedChange={(checked) => setForm({ ...form, [key]: checked })} /></div>)}</div></Section>
    </div>}</ScrollArea><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEditTarget(null)}>Cancel</Button><Button disabled={loadingInfo || saving || !form.virtualserver_name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button></DialogFooter></DialogContent></Dialog>}

    <ConfirmDialog open={!!powerTarget} onOpenChange={(open) => { if (!open && !powerPending) setPowerTarget(null); }} title={`${powerTarget?.action === 'stop' ? 'Stop' : 'Start'} virtual server?`} description={powerTarget?.action === 'stop' ? `This disconnects all clients from "${powerTarget?.name || ''}". Other virtual servers are not affected.` : `Start "${powerTarget?.name || ''}"?`} confirmLabel={powerTarget?.action === 'stop' ? 'Stop server' : 'Start server'} destructive={powerTarget?.action === 'stop'} onConfirm={confirmPower} loading={powerPending} />
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="space-y-3 border-t first:border-0 pt-4 first:pt-0"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
function NumberField({ label, field, form, setForm, min }: { label: string; field: keyof ServerForm; form: ServerForm; setForm: (form: ServerForm) => void; min?: number }) { return <Field label={label}><Input type="number" min={min} value={String(form[field])} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></Field>; }
