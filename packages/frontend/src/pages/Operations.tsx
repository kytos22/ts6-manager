import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { operationsApi } from '@/api/operations.api';
import { useServerStore } from '@/stores/server.store';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { Activity, AlertTriangle, Archive, Copy, KeyRound, Plus, Radio, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const rows = (value: any): any[] => Array.isArray(value) ? value : value ? [value] : [];
const errorText = (error: any, fallback: string) => error?.response?.data?.error || fallback;
const dateTime = (value: any) => new Date(value).toLocaleString('es-ES');
const copy = async (value: string) => { await navigator.clipboard.writeText(value); toast.success('Copied to clipboard'); };

export default function Operations() {
  const { selectedConfigId, selectedSid } = useServerStore();
  const accessToken = useAuthStore((state) => state.accessToken);
  const qc = useQueryClient();
  const enabled = !!selectedConfigId && !!selectedSid;
  const health = useQuery({ queryKey: ['operations-health', selectedConfigId, selectedSid], queryFn: () => operationsApi.health(selectedConfigId!, selectedSid!), enabled, refetchInterval: 15_000 });
  const audit = useQuery({ queryKey: ['operations-audit', selectedConfigId], queryFn: () => operationsApi.audit(selectedConfigId!, 150), enabled: !!selectedConfigId, refetchInterval: 30_000 });
  const tempPasswords = useQuery({ queryKey: ['temporary-passwords', selectedConfigId, selectedSid], queryFn: () => operationsApi.tempPasswords(selectedConfigId!, selectedSid!), enabled });
  const snapshots = useQuery({ queryKey: ['snapshots', selectedConfigId, selectedSid], queryFn: () => operationsApi.snapshots(selectedConfigId!, selectedSid!), enabled });
  const apiKeys = useQuery({ queryKey: ['api-keys', selectedConfigId, selectedSid], queryFn: () => operationsApi.apiKeys(selectedConfigId!, selectedSid!), enabled });
  const queryLogins = useQuery({ queryKey: ['query-logins', selectedConfigId, selectedSid], queryFn: () => operationsApi.queryLogins(selectedConfigId!, selectedSid!), enabled });

  const [events, setEvents] = useState<any[]>([]);
  const [eventStatus, setEventStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [tempDialog, setTempDialog] = useState(false);
  const [tempForm, setTempForm] = useState({ pw: '', desc: '', duration: '3600', tcid: '0', tcpw: '' });
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [snapshotForm, setSnapshotForm] = useState({ name: '', password: '' });
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [keepFiles, setKeepFiles] = useState(true);
  const [apiDialog, setApiDialog] = useState(false);
  const [apiForm, setApiForm] = useState({ scope: 'read', lifetime: '14', cldbid: '' });
  const [queryDialog, setQueryDialog] = useState(false);
  const [queryForm, setQueryForm] = useState({ client_login_name: '', cldbid: '' });
  const [revealedSecret, setRevealedSecret] = useState<{ title: string; value: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEvents([]);
    if (!enabled || !accessToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(accessToken)}`);
    setEventStatus('connecting');
    socket.onopen = () => setEventStatus('connected');
    socket.onclose = () => setEventStatus('disconnected');
    socket.onerror = () => setEventStatus('disconnected');
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (!['ts:event', 'ts:ssh-status', 'ts:ssh-error'].includes(event.type)) return;
        if (Number(event.configId) !== selectedConfigId || Number(event.sid) !== selectedSid) return;
        setEvents((current) => [event, ...current].slice(0, 200));
      } catch { /* Ignore malformed frames. */ }
    };
    return () => socket.close();
  }, [accessToken, enabled, selectedConfigId, selectedSid]);

  const healthChecks = rows(health.data?.checks);
  const alerts = rows(health.data?.alerts);
  const tempRows = rows(tempPasswords.data);
  const snapshotRows = rows(snapshots.data);
  const keyRows = rows(apiKeys.data);
  const loginRows = rows(queryLogins.data).filter((row) => row.client_login_name);
  const auditRows = rows(audit.data);
  const eventCount = useMemo(() => events.length, [events]);

  if (!enabled) return <EmptyState icon={Activity} title="No virtual server selected" description="Select a server and virtual server to open operations." />;

  const createTemp = async () => {
    setPending(true);
    try {
      await operationsApi.addTempPassword(selectedConfigId!, selectedSid!, { ...tempForm, duration: Number(tempForm.duration), tcid: Number(tempForm.tcid) });
      toast.success('Temporary password created'); setTempDialog(false); setTempForm({ pw: '', desc: '', duration: '3600', tcid: '0', tcpw: '' });
      qc.invalidateQueries({ queryKey: ['temporary-passwords'] });
    } catch (error) { toast.error(errorText(error, 'Failed to create temporary password')); } finally { setPending(false); }
  };
  const deleteTemp = async (pw: string) => {
    if (!window.confirm('Delete this temporary password?')) return;
    try { await operationsApi.deleteTempPassword(selectedConfigId!, selectedSid!, pw); toast.success('Temporary password deleted'); qc.invalidateQueries({ queryKey: ['temporary-passwords'] }); }
    catch (error) { toast.error(errorText(error, 'Failed to delete temporary password')); }
  };
  const createSnapshot = async () => {
    setPending(true);
    try { await operationsApi.createSnapshot(selectedConfigId!, selectedSid!, snapshotForm); toast.success('Encrypted snapshot saved'); setSnapshotDialog(false); setSnapshotForm({ name: '', password: '' }); qc.invalidateQueries({ queryKey: ['snapshots'] }); }
    catch (error) { toast.error(errorText(error, 'Failed to create snapshot')); } finally { setPending(false); }
  };
  const restoreSnapshot = async () => {
    if (!restoreTarget) return; setPending(true);
    try { await operationsApi.restoreSnapshot(selectedConfigId!, selectedSid!, restoreTarget.id, { confirmation: restoreConfirmation, password: restorePassword, keepFiles }); toast.success('Snapshot restored'); setRestoreTarget(null); }
    catch (error) { toast.error(errorText(error, 'Failed to restore snapshot')); } finally { setPending(false); }
  };
  const deleteSnapshot = async (row: any) => {
    if (!window.confirm(`Delete stored snapshot "${row.name}"? This does not change TeamSpeak.`)) return;
    try { await operationsApi.deleteSnapshot(selectedConfigId!, selectedSid!, row.id); toast.success('Stored snapshot deleted'); qc.invalidateQueries({ queryKey: ['snapshots'] }); }
    catch (error) { toast.error(errorText(error, 'Failed to delete snapshot')); }
  };
  const createApiKey = async () => {
    setPending(true);
    try { const result = rows(await operationsApi.addApiKey(selectedConfigId!, selectedSid!, { ...apiForm, lifetime: Number(apiForm.lifetime) }))[0] || {}; setApiDialog(false); setApiForm({ scope: 'read', lifetime: '14', cldbid: '' }); if (result.apikey) setRevealedSecret({ title: 'New API key', value: result.apikey }); toast.success('API key created'); qc.invalidateQueries({ queryKey: ['api-keys'] }); }
    catch (error) { toast.error(errorText(error, 'Failed to create API key')); } finally { setPending(false); }
  };
  const createQueryLogin = async () => {
    setPending(true);
    try { const result = rows(await operationsApi.addQueryLogin(selectedConfigId!, selectedSid!, queryForm))[0] || {}; setQueryDialog(false); setQueryForm({ client_login_name: '', cldbid: '' }); if (result.client_login_password) setRevealedSecret({ title: `Password for ${result.client_login_name || 'Query login'}`, value: result.client_login_password }); toast.success('Query login created'); qc.invalidateQueries({ queryKey: ['query-logins'] }); }
    catch (error) { toast.error(errorText(error, 'Failed to create Query login')); } finally { setPending(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Operations</h1><p className="text-sm text-muted-foreground">Health, credentials, backups, live events and administrative audit.</p></div><Button variant="outline" size="sm" onClick={() => { health.refetch(); audit.refetch(); }}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div>
    {alerts.length > 0 && <Card className="border-amber-500/40"><CardContent className="p-4 space-y-2">{alerts.map((alert, index) => <div key={index} className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-amber-400" /><span>{alert.message}</span></div>)}</CardContent></Card>}
    <Tabs defaultValue="health" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="health">Health</TabsTrigger><TabsTrigger value="events">Live events</TabsTrigger><TabsTrigger value="passwords">Temporary passwords</TabsTrigger><TabsTrigger value="snapshots">Snapshots</TabsTrigger><TabsTrigger value="credentials">Credentials</TabsTrigger><TabsTrigger value="audit">Audit</TabsTrigger></TabsList>
      <TabsContent value="health"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{healthChecks.map((check) => <Card key={check.id}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">{check.label}</span><Badge variant={check.status === 'ok' ? 'success' : check.status === 'warning' ? 'warning' : 'destructive'}>{String(check.status).toUpperCase()}</Badge></div><p className="mt-2 text-xs text-muted-foreground break-words">{check.detail}</p></CardContent></Card>)}</div><p className="mt-3 text-xs text-muted-foreground">Last check: {health.data?.checkedAt ? dateTime(health.data.checkedAt) : 'waiting…'} · automatic every 15 seconds</p></TabsContent>
      <TabsContent value="events"><Card><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Radio className="h-4 w-4" />Live TeamSpeak events</span><Badge variant={eventStatus === 'connected' ? 'success' : 'secondary'}>{eventStatus.toUpperCase()} · {eventCount}</Badge></CardTitle></CardHeader><CardContent><div className="max-h-[560px] overflow-auto rounded-md border">{events.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Waiting for events…</p> : events.map((event, index) => <div key={`${event.timestamp}-${index}`} className="border-b p-3 last:border-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono-data text-xs text-primary">{event.eventName || event.type}</span><span className="text-[10px] text-muted-foreground">{dateTime(event.timestamp)}</span></div>{event.data && <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{JSON.stringify(event.data, null, 2)}</pre>}{event.message && <p className="mt-1 text-xs text-destructive">{event.message}</p>}</div>)}</div></CardContent></Card></TabsContent>
      <TabsContent value="passwords"><Card><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span>Active temporary passwords</span><Button size="sm" onClick={() => setTempDialog(true)}><Plus className="mr-1 h-3.5 w-3.5" />Create</Button></CardTitle></CardHeader><CardContent><div className="space-y-2">{tempRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No active temporary passwords.</p> : tempRows.map((row, index) => <div key={`${row.pw_clear}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><div className="flex items-center gap-2"><code className="text-xs">{row.pw_clear}</code><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(row.pw_clear)}><Copy className="h-3 w-3" /></Button></div><p className="text-xs text-muted-foreground">{row.desc || 'No description'} · channel {row.tcid || 0} · expires {row.end ? dateTime(Number(row.end) * 1000) : 'unknown'}</p></div><Button variant="ghost" size="icon" onClick={() => deleteTemp(row.pw_clear)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div></CardContent></Card></TabsContent>
      <TabsContent value="snapshots"><Card><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span>Encrypted snapshot library</span><Button size="sm" onClick={() => setSnapshotDialog(true)}><Archive className="mr-1 h-3.5 w-3.5" />Create snapshot</Button></CardTitle></CardHeader><CardContent><div className="space-y-2">{snapshotRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No stored snapshots.</p> : snapshotRows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{dateTime(row.createdAt)} · {(Number(row.sizeBytes) / 1024).toFixed(1)} KB{row.createdByName ? ` · ${row.createdByName}` : ''}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setRestoreTarget(row); setRestoreConfirmation(''); setRestorePassword(''); setKeepFiles(true); }}>Restore</Button><Button variant="ghost" size="icon" onClick={() => deleteSnapshot(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}</div></CardContent></Card></TabsContent>
      <TabsContent value="credentials"><div className="grid gap-4 xl:grid-cols-2"><CredentialCard title="WebQuery API keys" action={() => setApiDialog(true)}>{keyRows.map((row) => <CredentialRow key={row.id} title={`Key #${row.id}`} detail={`${row.scope} · owner DB ${row.cldbid} · ${Number(row.expires_at) ? `expires ${dateTime(Number(row.expires_at) * 1000)}` : 'no expiry'}`} onDelete={async () => { if (!window.confirm(`Delete API key #${row.id}?`)) return; try { await operationsApi.deleteApiKey(selectedConfigId!, selectedSid!, Number(row.id)); qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('API key deleted'); } catch (error) { toast.error(errorText(error, 'Failed to delete API key')); } }} />)}</CredentialCard><CredentialCard title="SSH Query logins" action={() => setQueryDialog(true)}>{loginRows.map((row) => <CredentialRow key={`${row.sid}-${row.cldbid}`} title={row.client_login_name} detail={`DB ${row.cldbid} · SID ${row.sid}`} onDelete={async () => { if (!window.confirm(`Delete Query login ${row.client_login_name}?`)) return; try { await operationsApi.deleteQueryLogin(selectedConfigId!, selectedSid!, Number(row.cldbid)); qc.invalidateQueries({ queryKey: ['query-logins'] }); toast.success('Query login deleted'); } catch (error) { toast.error(errorText(error, 'Failed to delete Query login')); } }} />)}</CredentialCard></div></TabsContent>
      <TabsContent value="audit"><Card><CardHeader><CardTitle className="text-sm">Administrator action trail</CardTitle></CardHeader><CardContent><div className="max-h-[600px] overflow-auto rounded-md border">{auditRows.map((row) => <div key={row.id} className="grid gap-1 border-b p-3 last:border-0 sm:grid-cols-[150px_70px_1fr_90px]"><span className="text-xs text-muted-foreground">{dateTime(row.createdAt)}</span><Badge variant={Number(row.statusCode) < 400 ? 'secondary' : 'destructive'} className="w-fit">{row.method} {row.statusCode}</Badge><code className="break-all text-xs">{row.path}</code><span className="text-xs text-muted-foreground">{row.username || `user #${row.userId || '?'}`}</span></div>)}</div></CardContent></Card></TabsContent>
    </Tabs>

    <Dialog open={tempDialog} onOpenChange={setTempDialog}><DialogContent><DialogHeader><DialogTitle>Create temporary password</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Password"><Input type="password" value={tempForm.pw} onChange={(e) => setTempForm({ ...tempForm, pw: e.target.value })} /></Field><Field label="Duration (seconds)"><Input type="number" min="60" value={tempForm.duration} onChange={(e) => setTempForm({ ...tempForm, duration: e.target.value })} /></Field><Field label="Description"><Input value={tempForm.desc} onChange={(e) => setTempForm({ ...tempForm, desc: e.target.value })} /></Field><Field label="Destination channel ID (0 = default)"><Input type="number" min="0" value={tempForm.tcid} onChange={(e) => setTempForm({ ...tempForm, tcid: e.target.value })} /></Field><Field label="Channel password (optional)"><Input type="password" value={tempForm.tcpw} onChange={(e) => setTempForm({ ...tempForm, tcpw: e.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setTempDialog(false)}>Cancel</Button><Button disabled={pending || !tempForm.pw} onClick={createTemp}>Create</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={snapshotDialog} onOpenChange={setSnapshotDialog}><DialogContent><DialogHeader><DialogTitle>Create encrypted snapshot</DialogTitle></DialogHeader><Field label="Name"><Input value={snapshotForm.name} onChange={(e) => setSnapshotForm({ ...snapshotForm, name: e.target.value })} placeholder="Before permissions update" /></Field><Field label="Optional TeamSpeak snapshot password"><Input type="password" value={snapshotForm.password} onChange={(e) => setSnapshotForm({ ...snapshotForm, password: e.target.value })} /></Field><p className="text-xs text-muted-foreground">The snapshot payload is additionally encrypted by the panel before it is stored.</p><DialogFooter><Button variant="outline" onClick={() => setSnapshotDialog(false)}>Cancel</Button><Button disabled={pending || !snapshotForm.name.trim()} onClick={createSnapshot}>Create snapshot</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open && !pending) setRestoreTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Restore snapshot · {restoreTarget?.name}</DialogTitle></DialogHeader><div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">Restoring replaces virtual-server configuration, channels, groups and permissions. Only the selected virtual server is targeted.</div><div className="flex items-center justify-between rounded-md border p-3"><div><Label>Keep channel files</Label><p className="text-xs text-muted-foreground">Enabled by default to preserve files for matching channels.</p></div><Switch checked={keepFiles} onCheckedChange={setKeepFiles} /></div><Field label="Snapshot password, if one was used"><Input type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} /></Field><Field label="Type RESTORE to confirm"><Input value={restoreConfirmation} onChange={(e) => setRestoreConfirmation(e.target.value)} /></Field><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setRestoreTarget(null)}>Cancel</Button><Button variant="destructive" disabled={pending || restoreConfirmation !== 'RESTORE'} onClick={restoreSnapshot}>Restore snapshot</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={apiDialog} onOpenChange={setApiDialog}><DialogContent><DialogHeader><DialogTitle>Create WebQuery API key</DialogTitle></DialogHeader><Field label="Scope"><Select value={apiForm.scope} onValueChange={(scope) => setApiForm({ ...apiForm, scope })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="read">Read</SelectItem><SelectItem value="write">Write</SelectItem><SelectItem value="manage">Manage</SelectItem></SelectContent></Select></Field><Field label="Lifetime in days (0 = unlimited)"><Input type="number" min="0" value={apiForm.lifetime} onChange={(e) => setApiForm({ ...apiForm, lifetime: e.target.value })} /></Field><Field label="Owner client DB ID (optional)"><Input type="number" min="1" value={apiForm.cldbid} onChange={(e) => setApiForm({ ...apiForm, cldbid: e.target.value })} /></Field><DialogFooter><Button variant="outline" onClick={() => setApiDialog(false)}>Cancel</Button><Button disabled={pending} onClick={createApiKey}>Create key</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={queryDialog} onOpenChange={setQueryDialog}><DialogContent><DialogHeader><DialogTitle>Create SSH Query login</DialogTitle></DialogHeader><Field label="Login name"><Input value={queryForm.client_login_name} onChange={(e) => setQueryForm({ ...queryForm, client_login_name: e.target.value })} /></Field><Field label="Client database ID"><Input type="number" min="1" value={queryForm.cldbid} onChange={(e) => setQueryForm({ ...queryForm, cldbid: e.target.value })} /></Field><p className="text-xs text-muted-foreground">For a virtual-server login, TeamSpeak requires an existing client database ID.</p><DialogFooter><Button variant="outline" onClick={() => setQueryDialog(false)}>Cancel</Button><Button disabled={pending || !queryForm.client_login_name || !queryForm.cldbid} onClick={createQueryLogin}>Create login</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!revealedSecret} onOpenChange={(open) => { if (!open) setRevealedSecret(null); }}><DialogContent><DialogHeader><DialogTitle>{revealedSecret?.title}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Copy this value now. TeamSpeak will not show it again.</p><div className="flex gap-2"><Input readOnly value={revealedSecret?.value || ''} className="font-mono-data" /><Button variant="outline" onClick={() => copy(revealedSecret?.value || '')}><Copy className="h-4 w-4" /></Button></div><DialogFooter><Button onClick={() => setRevealedSecret(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
function CredentialCard({ title, action, children }: { title: string; action: () => void; children: React.ReactNode }) { return <Card><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />{title}</span><Button size="sm" onClick={action}><Plus className="mr-1 h-3.5 w-3.5" />Create</Button></CardTitle></CardHeader><CardContent className="space-y-2">{children || <p className="py-6 text-center text-sm text-muted-foreground">No credentials.</p>}</CardContent></Card>; }
function CredentialRow({ title, detail, onDelete }: { title: string; detail: string; onDelete: () => void }) { return <div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{detail}</p></div><Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>; }
