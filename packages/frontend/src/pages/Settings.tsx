import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/bots.api';
import { authApi } from '@/api/auth.api';
import { serversApi } from '@/api/servers.api';
import { settingsApi } from '@/api/settings.api';
import { journalApi } from '@/api/journal.api';
import { discordApi, type DiscordSettings } from '@/api/discord.api';
import { spotifyApi } from '@/api/spotify.api';
import { musicBotsApi } from '@/api/music.api';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Settings as SettingsIcon, Users, Server, Plus, Trash2, Pencil, TestTube, Check, X, Lock, KeyRound, Youtube, Upload, FileText, Monitor, MessagesSquare, Music } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '@/i18n';

export default function Settings() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

      <Tabs defaultValue="account">
        <TabsList>
          {isAdmin && <TabsTrigger value="connections"><Server className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.connections')}</TabsTrigger>}
          <TabsTrigger value="account"><Lock className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.account')}</TabsTrigger>
          {isAdmin && <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.users')}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="youtube"><Youtube className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.youtube')}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="discord"><MessagesSquare className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.discord')}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="spotify"><Music className="h-3.5 w-3.5 mr-1" /> {t('settings.tabs.spotify')}</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="connections" className="mt-4">
            <ConnectionsTab />
          </TabsContent>
        )}

        <TabsContent value="account" className="mt-4">
          <AccountTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="youtube" className="mt-4">
            <YouTubeTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="discord" className="mt-4">
            <DiscordTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="spotify" className="mt-4">
            <SpotifyTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AccountTab() {
  const uiScale = useUiStore((s) => s.uiScale);
  const setUiScale = useUiStore((s) => s.setUiScale);
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
  });

  const handleSubmit = () => {
    if (newPassword.length < 6) {
      toast.error(t('settings.account.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.account.passwordsDoNotMatch'));
      return;
    }
    changePassword.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('settings.account.passwordChanged'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || 'Failed to change password';
        toast.error(msg);
      },
    });
  };

  return (
    <div className="max-w-md space-y-4">
      <LanguageCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('settings.account.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">{t('settings.account.currentPassword')}</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('settings.account.newPassword')}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('settings.account.confirmPassword')}</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!currentPassword || !newPassword || !confirmPassword || changePassword.isPending}
            className="w-full mt-1"
          >
            {changePassword.isPending ? t('settings.account.changing') : t('settings.account.changePassword')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            Interface scale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Resize text and controls while keeping the panel fitted to the browser window.
          </p>
          <div>
            <Label className="text-xs">Size</Label>
            <Select value={String(uiScale)} onValueChange={(value) => setUiScale(Number(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.9">90% - Compact</SelectItem>
                <SelectItem value="1">100% - Default</SelectItem>
                <SelectItem value="1.1">110% - Comfortable</SelectItem>
                <SelectItem value="1.25">125% - Large</SelectItem>
                <SelectItem value="1.4">140% - Extra large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <MfaCard />
    </div>
  );
}

function LanguageCard() {
  const { t, i18n } = useTranslation();
  const { user, setAuth, accessToken, refreshToken } = useAuthStore();
  const current = LANGUAGES.find((l) => i18n.resolvedLanguage === l.code)?.code ?? 'en';

  const choose = (code: string) => {
    setLanguage(code);
    if (accessToken) {
      authApi.setLanguage(code).then(() => {
        if (user) setAuth(accessToken, refreshToken!, { ...user, language: code });
        toast.success(t('common.save'));
      }).catch(() => { /* ignore */ });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('settings.account.language')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select value={current} onValueChange={choose}>
          <SelectTrigger className="h-8 text-xs w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}><span className="mr-2">{l.flag}</span>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">{t('settings.account.languageHint')}</p>
      </CardContent>
    </Card>
  );
}

function MfaCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const enabled = !!me?.user?.mfaEnabled;
  const required = !!me?.user?.mfaRequired;

  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState('');

  const setup = useMutation({
    mutationFn: () => authApi.mfaSetup(),
    onSuccess: (d) => setQr(d.qrDataUrl),
    onError: () => toast.error(t('settings.account.mfa.setupFailed')),
  });
  const enable = useMutation({
    mutationFn: () => authApi.mfaEnable(code),
    onSuccess: (d) => { setRecoveryCodes(d.recoveryCodes); setQr(null); setCode(''); qc.invalidateQueries({ queryKey: ['me'] }); toast.success(t('settings.account.mfa.enabledToast')); },
    onError: () => toast.error(t('settings.account.mfa.invalidCode')),
  });
  const disable = useMutation({
    mutationFn: () => authApi.mfaDisable(disablePw),
    onSuccess: () => { setDisablePw(''); setRecoveryCodes(null); qc.invalidateQueries({ queryKey: ['me'] }); toast.success(t('settings.account.mfa.disabledToast')); },
    onError: (err: any) => toast.error(err.response?.data?.error || t('settings.account.mfa.disableFailed')),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">{t('settings.account.mfa.title')}</CardTitle>
        <Badge variant={enabled ? 'default' : 'outline'} className={enabled ? 'bg-emerald-600' : ''}>{enabled ? t('settings.account.mfa.on') : t('settings.account.mfa.off')}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {recoveryCodes && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-500 text-xs font-medium"><KeyRound className="h-3.5 w-3.5" /> {t('settings.account.mfa.recoveryTitle')}</div>
            <p className="text-[10px] text-muted-foreground">{t('settings.account.mfa.recoveryHint')}</p>
            <div className="grid grid-cols-2 gap-1 font-mono-data text-[11px]">{recoveryCodes.map((c) => <span key={c}>{c}</span>)}</div>
          </div>
        )}

        {!enabled && !qr && (
          <>
            <p className="text-xs text-muted-foreground">{t('settings.account.mfa.intro')}</p>
            <Button size="sm" onClick={() => setup.mutate()} disabled={setup.isPending}>{setup.isPending ? t('settings.account.mfa.starting') : t('settings.account.mfa.enable')}</Button>
          </>
        )}

        {!enabled && qr && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('settings.account.mfa.scanPrompt')}</p>
            <img src={qr} alt="TOTP QR code" className="h-44 w-44 rounded bg-white p-2" />
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" className="h-8 text-xs w-40 text-center tracking-widest" />
            <Button size="sm" onClick={() => enable.mutate()} disabled={enable.isPending || code.length < 6}>{enable.isPending ? t('settings.account.mfa.verifying') : t('settings.account.mfa.verifyEnable')}</Button>
          </div>
        )}

        {enabled && (
          <div className="space-y-2">
            {required
              ? <p className="text-xs text-muted-foreground">{t('settings.account.mfa.requiredNote')}</p>
              : <>
                  <p className="text-xs text-muted-foreground">{t('settings.account.mfa.disablePrompt')}</p>
                  <div className="flex items-center gap-2">
                    <Input type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} placeholder={t('settings.account.mfa.passwordPlaceholder')} className="h-8 text-xs w-48" />
                    <Button size="sm" variant="destructive" onClick={() => disable.mutate()} disabled={disable.isPending || !disablePw}>{t('settings.account.mfa.disable')}</Button>
                  </div>
                </>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionsTab() {
  const qc = useQueryClient();
  const { data: servers, isLoading } = useQuery({ queryKey: ['servers'], queryFn: serversApi.list });
  const createServer = useMutation({ mutationFn: (data: any) => serversApi.create(data), onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }) });
  const updateServer = useMutation({ mutationFn: ({ id, data }: any) => serversApi.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }) });
  const deleteServer = useMutation({ mutationFn: (id: number) => serversApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }) });
  const testServer = useMutation({ mutationFn: (id: number) => serversApi.test(id) });

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', host: '', webqueryPort: '10080', apiKey: '', useHttps: false, sshPort: '10022', sshUsername: '', sshPassword: '' });

  const serverList = useMemo(() => (Array.isArray(servers) ? servers : []), [servers]);

  if (isLoading) return <PageLoader />;

  const resetForm = () => setForm({ name: '', host: '', webqueryPort: '10080', apiKey: '', useHttps: false, sshPort: '10022', sshUsername: '', sshPassword: '' });

  const handleSave = () => {
    const payload = { ...form, webqueryPort: parseInt(form.webqueryPort), sshPort: parseInt(form.sshPort) };
    if (editId) {
      updateServer.mutate({ id: editId, data: payload }, {
        onSuccess: () => { toast.success('Connection updated'); setEditId(null); setShowAdd(false); resetForm(); },
        onError: () => toast.error('Failed to update'),
      });
    } else {
      createServer.mutate(payload, {
        onSuccess: () => { toast.success('Connection added'); setShowAdd(false); resetForm(); },
        onError: () => toast.error('Failed to create'),
      });
    }
  };

  const openEdit = (server: any) => {
    setForm({
      name: server.name || '',
      host: server.host || '',
      webqueryPort: String(server.webqueryPort || 10080),
      apiKey: server.apiKey || '',
      useHttps: server.useHttps || false,
      sshPort: String(server.sshPort || 10022),
      sshUsername: server.sshUsername || '',
      sshPassword: server.sshPassword || '',
    });
    setEditId(server.id);
    setShowAdd(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage TeamSpeak server connections</p>
        <Button size="sm" onClick={() => { resetForm(); setEditId(null); setShowAdd(true); }}><Plus className="h-4 w-4 mr-1" /> Add Connection</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {serverList.map((server: any) => (
          <Card key={server.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{server.name}</CardTitle>
                <Badge variant={server.enabled ? 'default' : 'secondary'} className="text-[10px]">
                  {server.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-muted-foreground">Host</span>
                <span className="font-mono-data">{server.host}:{server.webqueryPort}</span>
                <span className="text-muted-foreground">Protocol</span>
                <span>{server.useHttps ? 'HTTPS' : 'HTTP'}</span>
                <span className="text-muted-foreground">SSH</span>
                <span className="font-mono-data">{server.sshPort || '-'}</span>
              </div>
              <div className="flex items-center gap-1 pt-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => testServer.mutate(server.id, {
                  onSuccess: () => toast.success('Connection successful'),
                  onError: () => toast.error('Connection failed'),
                })}>
                  <TestTube className="h-3 w-3 mr-1" /> Test
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(server)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(server.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditId(null); resetForm(); } else setShowAdd(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Edit Connection' : 'Add Connection'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My TS Server" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Host</Label><Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="127.0.0.1" /></div>
              <div><Label className="text-xs">WebQuery Port</Label><Input type="number" value={form.webqueryPort} onChange={(e) => setForm({ ...form, webqueryPort: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs">API Key</Label>
              <Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editId ? '(unchanged — enter new key to update)' : 'WebQuery API Key'} type="password" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.useHttps} onCheckedChange={(v) => setForm({ ...form, useHttps: v })} />
              <Label className="text-xs">Use HTTPS</Label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">SSH Port</Label><Input type="number" value={form.sshPort} onChange={(e) => setForm({ ...form, sshPort: e.target.value })} /></div>
              <div><Label className="text-xs">SSH User</Label><Input value={form.sshUsername} onChange={(e) => setForm({ ...form, sshUsername: e.target.value })} placeholder="serveradmin" /></div>
              <div><Label className="text-xs">SSH Password</Label><Input type="password" value={form.sshPassword} onChange={(e) => setForm({ ...form, sshPassword: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.host || !form.apiKey}>{editId ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Connection?"
        description="This will remove the server connection. Bots linked to this server will stop working."
        onConfirm={() => { if (deleteId) deleteServer.mutate(deleteId, { onSuccess: () => { toast.success('Connection deleted'); setDeleteId(null); } }); }}
        destructive
      />
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: servers, isLoading: serversLoading } = useQuery({ queryKey: ['servers'], queryFn: serversApi.list });
  const createUser = useMutation({ mutationFn: (data: any) => usersApi.create(data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  const updateUser = useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => usersApi.update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  const deleteUser = useMutation({ mutationFn: (id: number) => usersApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });

  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [accessUserId, setAccessUserId] = useState<number | null>(null);
  const [accessIds, setAccessIds] = useState<number[]>([]);
  const [resetPwUserId, setResetPwUserId] = useState<number | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [form, setForm] = useState<{
    username: string; password: string; displayName: string; role: string; serverConfigIds: number[];
  }>({ username: '', password: '', displayName: '', role: 'viewer', serverConfigIds: [] });

  const userList = useMemo(() => (Array.isArray(users) ? users : []), [users]);
  const serverList = useMemo(() => (Array.isArray(servers) ? servers : []), [servers]);

  if (isLoading || serversLoading) return <PageLoader />;

  const handleCreate = () => {
    createUser.mutate(form, {
      onSuccess: () => {
        toast.success('User created');
        setShowAdd(false);
        setForm({ username: '', password: '', displayName: '', role: 'viewer', serverConfigIds: [] });
      },
      onError: () => toast.error('Failed to create user'),
    });
  };

  const handleRoleChange = (userId: number, role: string) => {
    updateUser.mutate({ id: userId, data: { role } }, {
      onSuccess: () => toast.success('Role updated'),
      onError: () => toast.error('Failed to update role'),
    });
  };

  const handleToggleEnabled = (userId: number, enabled: boolean) => {
    updateUser.mutate({ id: userId, data: { enabled } }, {
      onSuccess: () => toast.success(enabled ? 'User enabled' : 'User disabled'),
      onError: () => toast.error('Failed to update status'),
    });
  };

  const toggleServerId = (ids: number[], serverId: number) =>
    ids.includes(serverId) ? ids.filter((id) => id !== serverId) : [...ids, serverId];

  const openServerAccess = (user: any) => {
    setAccessUserId(user.id);
    setAccessIds(Array.isArray(user.serverConfigIds) ? user.serverConfigIds : []);
  };

  const saveServerAccess = () => {
    if (!accessUserId) return;
    updateUser.mutate({ id: accessUserId, data: { serverConfigIds: accessIds } }, {
      onSuccess: () => {
        toast.success('Server access updated');
        setAccessUserId(null);
        setAccessIds([]);
      },
      onError: () => toast.error('Failed to update server access'),
    });
  };

  const handleRequireMfa = (userId: number, mfaRequired: boolean) => {
    updateUser.mutate({ id: userId, data: { mfaRequired } }, {
      onSuccess: () => toast.success(mfaRequired ? '2FA required for user' : '2FA no longer required'),
      onError: () => toast.error('Failed to update 2FA requirement'),
    });
  };

  const handleResetMfa = (userId: number) => {
    updateUser.mutate({ id: userId, data: { resetMfa: true } }, {
      onSuccess: () => toast.success('2FA reset — the user must re-enroll'),
      onError: () => toast.error('Failed to reset 2FA'),
    });
  };

  const handleResetPassword = () => {
    if (!resetPwUserId || resetPwValue.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    updateUser.mutate({ id: resetPwUserId, data: { password: resetPwValue } }, {
      onSuccess: () => { toast.success('Password reset successfully'); setResetPwUserId(null); setResetPwValue(''); },
      onError: () => toast.error('Failed to reset password'),
    });
  };

  return (
    <div className="space-y-4">
      <PasswordPolicyCard />
      <JournalRetentionCard />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage webapp users and roles</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add User</Button>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">Username</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">Display Name</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">Server Access</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">2FA</th>
              <th className="h-10 px-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {userList.map((u: any) => {
              const isProtected = u.username === 'admin';
              return (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono-data text-xs">{u.username}</td>
                  <td className="px-3 py-2.5">{u.displayName}</td>
                  <td className="px-3 py-2.5">
                    {isProtected ? (
                      <Badge variant="default" className="text-[10px] capitalize">{u.role}</Badge>
                    ) : (
                      <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}>
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.role === 'admin' ? (
                      <Badge variant="secondary" className="text-[10px]">All servers</Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {(u.serverConfigIds || []).length
                            ? serverList
                                .filter((server: any) => u.serverConfigIds.includes(server.id))
                                .map((server: any) => server.name)
                                .join(', ')
                            : 'No access'}
                        </span>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openServerAccess(u)}>
                          Edit
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {isProtected ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <Switch
                        checked={u.enabled}
                        onCheckedChange={(v) => handleToggleEnabled(u.id, v)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span title="Require 2FA for this user" className="inline-flex items-center gap-1">
                        <Switch checked={!!u.mfaRequired} onCheckedChange={(v) => handleRequireMfa(u.id, v)} />
                        <span className="text-[10px] text-muted-foreground">{u.mfaEnabled ? 'on' : (u.mfaRequired ? 'pending' : 'off')}</span>
                      </span>
                      {u.mfaEnabled && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" title="Reset (lost device)" onClick={() => handleResetMfa(u.id)}>
                          Reset
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Reset Password" onClick={() => { setResetPwUserId(u.id); setResetPwValue(''); }}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)} disabled={isProtected}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="johndoe" /></div>
            <div><Label className="text-xs">Display Name</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="John Doe" /></div>
            <div><Label className="text-xs">Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="********" /></div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === 'viewer' && (
              <div className="space-y-2">
                <Label className="text-xs">Server access</Label>
                <div className="rounded-md border border-border p-3 space-y-2">
                  {serverList.map((server: any) => (
                    <label key={server.id} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                      <span>{server.name}</span>
                      <Switch
                        checked={form.serverConfigIds.includes(server.id)}
                        onCheckedChange={() => setForm({
                          ...form,
                          serverConfigIds: toggleServerId(form.serverConfigIds, server.id),
                        })}
                      />
                    </label>
                  ))}
                  {serverList.length === 0 && <p className="text-xs text-muted-foreground">No servers configured.</p>}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.username || !form.password}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Viewer server access dialog */}
      <Dialog
        open={accessUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAccessUserId(null);
            setAccessIds([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Server Access</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select which TeamSpeak connections this viewer may see and query.
          </p>
          <div className="rounded-md border border-border p-3 space-y-2">
            {serverList.map((server: any) => (
              <label key={server.id} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                <span>{server.name}</span>
                <Switch
                  checked={accessIds.includes(server.id)}
                  onCheckedChange={() => setAccessIds(toggleServerId(accessIds, server.id))}
                />
              </label>
            ))}
            {serverList.length === 0 && <p className="text-xs text-muted-foreground">No servers configured.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAccessUserId(null); setAccessIds([]); }}>Cancel</Button>
            <Button onClick={saveServerAccess} disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPwUserId !== null} onOpenChange={(v) => { if (!v) { setResetPwUserId(null); setResetPwValue(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set a new password for <span className="font-medium text-foreground">{userList.find((u: any) => u.id === resetPwUserId)?.username}</span>
            </p>
            <div>
              <Label className="text-xs">New Password</Label>
              <Input type="password" value={resetPwValue} onChange={(e) => setResetPwValue(e.target.value)} placeholder="Min. 6 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPwUserId(null); setResetPwValue(''); }}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPwValue.length < 6 || updateUser.isPending}>
              {updateUser.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Delete User?"
        description="This user will be permanently deleted."
        onConfirm={() => { if (deleteId) deleteUser.mutate(deleteId, { onSuccess: () => { toast.success('User deleted'); setDeleteId(null); } }); }}
        destructive
      />
    </div>
  );
}

function YouTubeTab() {
  const qc = useQueryClient();
  const [pasteMode, setPasteMode] = useState(false);
  const [cookieText, setCookieText] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['yt-cookie-status'],
    queryFn: settingsApi.getYtCookieStatus,
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) => settingsApi.uploadYtCookieFile(file),
    onSuccess: () => {
      toast.success('Cookie file uploaded');
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
    },
    onError: () => toast.error('Failed to upload cookie file'),
  });

  const uploadText = useMutation({
    mutationFn: (text: string) => settingsApi.uploadYtCookieText(text),
    onSuccess: () => {
      toast.success('Cookies saved');
      setCookieText('');
      setPasteMode(false);
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
    },
    onError: () => toast.error('Failed to save cookies'),
  });

  const deleteCookies = useMutation({
    mutationFn: () => settingsApi.deleteYtCookies(),
    onSuccess: () => {
      toast.success('Cookie file removed');
      qc.invalidateQueries({ queryKey: ['yt-cookie-status'] });
    },
    onError: () => toast.error('Failed to remove cookies'),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile.mutate(file);
    e.target.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">YouTube Cookies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a cookies.txt file to access age-restricted or member-only YouTube content.
            You can export cookies from your browser using extensions like
            {' '}<span className="font-medium">Get cookies.txt LOCALLY</span> (Chrome/Firefox).
          </p>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.active ? 'bg-green-500' : 'bg-zinc-500'}`} />
            <span className="text-sm">
              {isLoading ? 'Loading...' : status?.active
                ? `Cookies active (${formatSize(status.size)})`
                : 'No cookies configured'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              accept=".txt,.cookies"
              className="hidden"
              id="cookie-file-input"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('cookie-file-input')?.click()}
              disabled={uploadFile.isPending}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              {uploadFile.isPending ? 'Uploading...' : 'Upload cookies.txt'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPasteMode(!pasteMode)}
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Paste cookies
            </Button>
            {status?.active && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteCookies.mutate()}
                disabled={deleteCookies.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            )}
          </div>

          {/* Paste mode */}
          {pasteMode && (
            <div className="space-y-2">
              <textarea
                className="w-full h-32 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="# Netscape HTTP Cookie File&#10;.youtube.com&#9;TRUE&#9;/&#9;TRUE&#9;0&#9;COOKIE_NAME&#9;COOKIE_VALUE"
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => uploadText.mutate(cookieText)}
                  disabled={!cookieText.trim() || uploadText.isPending}
                >
                  {uploadText.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setPasteMode(false); setCookieText(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordPolicyCard() {
  const qc = useQueryClient();
  const { data: policy } = useQuery({ queryKey: ['password-policy'], queryFn: usersApi.passwordPolicy });
  const [minLength, setMinLength] = useState(12);
  const [requireComplexity, setRequireComplexity] = useState(true);

  useEffect(() => {
    if (policy) {
      setMinLength(policy.minLength);
      setRequireComplexity(policy.requireComplexity);
    }
  }, [policy]);

  const save = useMutation({
    mutationFn: () => usersApi.updatePasswordPolicy({ minLength, requireComplexity }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['password-policy'] });
      toast.success('Password policy saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Password policy</CardTitle></CardHeader>
      <CardContent className="max-w-xl space-y-3">
        <div className="flex items-center gap-3">
          <Label className="w-40 text-xs">Minimum length</Label>
          <Input className="h-8 w-24 text-xs" type="number" min={1} max={128} value={minLength}
            onChange={(e) => setMinLength(parseInt(e.target.value) || 1)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={requireComplexity} onCheckedChange={setRequireComplexity} />
          <Label className="text-xs font-normal">
            Require a strong password
            <span className="text-muted-foreground"> (uppercase, lowercase, number and special character)</span>
          </Label>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Applied when creating users, changing a password and resetting one as administrator.
        </p>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save policy'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Journal Retention Card ──────────────────────────────────

function JournalRetentionCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['journal-retention'], queryFn: journalApi.retention });
  const [days, setDays] = useState(90);

  useEffect(() => { if (data) setDays(data.retentionDays); }, [data]);

  const save = useMutation({
    mutationFn: () => journalApi.updateRetention(days),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-retention'] }); toast.success('Retention saved'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Connection journal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <div className="flex items-center gap-3">
          <Label className="text-xs w-40">Retention (days)</Label>
          <Input className="h-8 text-xs w-24" type="number" min={0} max={3650} value={days}
            onChange={(e) => setDays(parseInt(e.target.value) || 0)} />
        </div>
        <p className="text-[10px] text-muted-foreground">Entries older than this are purged daily. Set to 0 to keep everything.</p>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}

function DiscordTab() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['discord-settings'], queryFn: discordApi.settings });
  const { data: status } = useQuery({
    queryKey: ['discord-status'],
    queryFn: discordApi.status,
    refetchInterval: 10_000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ['discord-channels'],
    queryFn: discordApi.channels,
    enabled: !!status?.running,
  });
  const { data: bots } = useQuery({ queryKey: ['music-bots'], queryFn: musicBotsApi.list });
  const { data: servers } = useQuery({ queryKey: ['servers'], queryFn: serversApi.list });
  const [form, setForm] = useState<Partial<DiscordSettings> & { botToken?: string }>({});

  useEffect(() => {
    if (settings) setForm({ ...settings, botToken: '' });
  }, [settings]);

  const save = useMutation({
    mutationFn: () => discordApi.updateSettings({ ...form, botToken: form.botToken || undefined }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['discord-settings'] });
      qc.invalidateQueries({ queryKey: ['discord-status'] });
      qc.invalidateQueries({ queryKey: ['discord-channels'] });
      if (result?.status?.error) toast.error(`Saved, but: ${result.status.error}`);
      else toast.success('Discord settings saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save Discord settings'),
  });

  if (isLoading || !settings) return <PageLoader />;

  const botList = Array.isArray(bots) ? bots : [];
  const serverList = Array.isArray(servers) ? servers : [];
  const channelOptions = Array.isArray(channels) ? channels : [];

  const channelField = (label: string, key: 'notificationsChannelId' | 'statsChannelId') => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {channelOptions.length ? (
        <Select value={form[key] || 'none'} onValueChange={(value) => setForm((current) => ({ ...current, [key]: value === 'none' ? null : value }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Disabled</SelectItem>
            {channelOptions.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input className="h-8 text-xs" placeholder="Discord channel ID"
          value={form[key] || ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value || null }))} />
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Discord integration</CardTitle>
        {status?.running
          ? <Badge className="bg-emerald-600">Connected{status.guildName ? ` · ${status.guildName}` : ''}</Badge>
          : status?.enabled
            ? <Badge variant="destructive">{status.error ? 'Error' : 'Connecting'}</Badge>
            : <Badge variant="outline">Disabled</Badge>}
      </CardHeader>
      <CardContent className="max-w-xl space-y-4">
        {status?.error && <p className="text-xs text-destructive">{status.error}</p>}
        {(status?.warnings || []).map((warning) => <p key={warning} className="text-xs text-amber-500">{warning}</p>)}

        <div className="flex items-center gap-2">
          <Switch checked={!!form.enabled} onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))} />
          <Label className="text-xs">Enable Discord bot</Label>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bot token</Label>
          <Input className="h-8 text-xs" type="password"
            placeholder={settings.hasToken ? 'Unchanged — enter a new token to replace it' : 'Discord bot token'}
            value={form.botToken || ''} onChange={(event) => setForm((current) => ({ ...current, botToken: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Discord server ID</Label>
          <Input className="h-8 text-xs" value={form.guildId || ''}
            onChange={(event) => setForm((current) => ({ ...current, guildId: event.target.value || null }))} />
        </div>
        {channelField('Notifications channel', 'notificationsChannelId')}
        {channelField('Live statistics channel', 'statsChannelId')}
        <div className="flex items-center gap-2">
          <Switch checked={!!form.statsLiveEnabled} onCheckedChange={(statsLiveEnabled) => setForm((current) => ({ ...current, statsLiveEnabled }))} />
          <Label className="text-xs">Update the statistics message every minute</Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">TeamSpeak connection</Label>
            <Select value={form.serverConfigId ? String(form.serverConfigId) : 'none'}
              onValueChange={(value) => setForm((current) => ({ ...current, serverConfigId: value === 'none' ? null : Number(value) }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{serverList.map((server: any) => <SelectItem key={server.id} value={String(server.id)}>{server.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Default music bot</Label>
            <Select value={form.defaultMusicBotId ? String(form.defaultMusicBotId) : 'none'}
              onValueChange={(value) => setForm((current) => ({ ...current, defaultMusicBotId: value === 'none' ? null : Number(value) }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{botList.map((bot: any) => <SelectItem key={bot.id} value={String(bot.id)}>{bot.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving and reconnecting...' : 'Save Discord settings'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Spotify Tab ─────────────────────────────────────────────

function SpotifyTab() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['spotify-settings'], queryFn: spotifyApi.settings });
  const [form, setForm] = useState<{ enabled: boolean; clientId: string; clientSecret: string; maxAlbumTracks: number }>({
    enabled: false, clientId: '', clientSecret: '', maxAlbumTracks: 50,
  });

  useEffect(() => {
    if (settings) setForm({
      enabled: settings.enabled,
      clientId: settings.clientId || '',
      clientSecret: '',
      maxAlbumTracks: settings.maxAlbumTracks,
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: () => spotifyApi.updateSettings({
      enabled: form.enabled,
      clientId: form.clientId,
      clientSecret: form.clientSecret || undefined,
      maxAlbumTracks: form.maxAlbumTracks,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spotify-settings'] });
      toast.success('Spotify settings saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  if (isLoading || !settings) return <PageLoader />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Spotify</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <p className="text-[11px] text-muted-foreground">
          Spotify doesn't allow audio downloads — these credentials are used only to read track/album
          metadata from a Spotify link. Playback then finds the matching track on YouTube. Paste a
          Spotify track or album link into <span className="font-mono">!play</span> /{' '}
          <span className="font-mono">/play</span> (or <span className="font-mono">!spotify</span>).
          Create an app on the{' '}
          <a className="underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            Spotify Developer Dashboard
          </a>{' '}
          to get a Client ID and Secret.
        </p>

        <div className="flex items-center gap-2">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
          <Label className="text-xs">Enable Spotify link support</Label>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Client ID</Label>
          <Input className="h-8 text-xs" value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Client Secret</Label>
          <Input className="h-8 text-xs" type="password"
            placeholder={settings.hasClientSecret ? '(unchanged — enter new secret to update)' : 'Spotify client secret'}
            value={form.clientSecret} onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Max tracks per album</Label>
          <Input className="h-8 text-xs w-32" type="number" min={1} value={form.maxAlbumTracks}
            onChange={(e) => setForm((f) => ({ ...f, maxAlbumTracks: parseInt(e.target.value) || 50 }))} />
        </div>

        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
