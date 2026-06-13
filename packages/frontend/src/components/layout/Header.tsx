import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ServerSelector } from './ServerSelector';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { useLogout } from '@/hooks/use-auth';
import { useTranslation } from 'react-i18next';

export function Header() {
  const { user } = useAuthStore();
  const { uiScale, setUiScale } = useUiStore();
  const logout = useLogout();
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between h-14 px-5 border-b border-border bg-card/50 backdrop-blur-sm">
      <ServerSelector />

      <div className="flex items-center gap-2">
        <Select value={String(uiScale)} onValueChange={(value) => setUiScale(Number(value))}>
          <SelectTrigger className="h-8 w-[82px] px-2 text-xs" aria-label="Interface scale" title="Interface scale">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="0.9">90%</SelectItem>
            <SelectItem value="1">100%</SelectItem>
            <SelectItem value="1.1">110%</SelectItem>
            <SelectItem value="1.25">125%</SelectItem>
            <SelectItem value="1.4">140%</SelectItem>
          </SelectContent>
        </Select>
        <LanguageSwitcher />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 h-8">
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-3 w-3 text-primary" />
              </div>
              <span className="text-xs">{user?.displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.displayName}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t('nav.logout')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
