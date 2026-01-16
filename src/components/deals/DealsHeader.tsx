import { Settings, User, SlidersHorizontal, LogOut, HelpCircle, RotateCcw, BookOpen, Shield, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { DemoModeBadge } from '@/components/DemoModeBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { useAdminRole } from '@/hooks/useAdminRole';
import { CreateDealDialog } from './CreateDealDialog';

export function DealsHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { company } = useCompany();
  const { profile } = useProfile();
  const { isHintVisible, dismissHint, dismissAllHints, isFirstTimeUser } = useFirstTimeHints();
  const { isAdmin } = useAdminRole();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            {company?.logo_url && (
              <Avatar className="h-9 w-9">
                <AvatarImage src={company.logo_url} alt={company.name} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {company.name?.charAt(0) || 'C'}
                </AvatarFallback>
              </Avatar>
            )}
            <Logo className="text-2xl" />
          </Link>
          <DemoModeBadge />
          <nav className="hidden items-center gap-1 md:flex">
            <Button 
              variant="ghost" 
              size="sm" 
              className={location.pathname === '/deals' 
                ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
                : "text-muted-foreground"
              } 
              asChild
            >
              <Link to="/deals">Deals</Link>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className={location.pathname === '/lenders' 
                ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
                : "text-muted-foreground"
              } 
              asChild
            >
              <Link to="/lenders">Lenders</Link>
            </Button>
            <HintTooltip
              hint="View charts, metrics, and performance insights for your deals."
              visible={isHintVisible('analytics-nav')}
              onDismiss={() => dismissHint('analytics-nav')}
              side="bottom"
              align="center"
              showDelay={1500}
            >
              <Button 
                variant="ghost" 
                size="sm" 
                className={location.pathname === '/analytics' 
                  ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
                  : "text-muted-foreground"
                } 
                asChild
              >
                <Link to="/analytics">Analytics</Link>
              </Button>
            </HintTooltip>
            <Button 
              variant="ghost" 
              size="sm" 
              className={location.pathname === '/reports' 
                ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
                : "text-muted-foreground"
              } 
              asChild
            >
              <Link to="/reports">Reports</Link>
            </Button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsDropdown />
          <HintTooltip
            hint="Start here! Click to create your first deal and begin tracking your pipeline."
            visible={isHintVisible('new-deal-button')}
            onDismiss={() => dismissHint('new-deal-button')}
            side="bottom"
            align="end"
          >
            <CreateDealDialog />
          </HintTooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="relative"
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle theme</p>
            </TooltipContent>
          </Tooltip>
          <HintTooltip
            hint="Access settings to customize stages, deal types, and your preferences."
            visible={isHintVisible('settings-menu')}
            onDismiss={() => dismissHint('settings-menu')}
            side="bottom"
            align="end"
            showDelay={2000}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  {profile?.avatar_url ? (
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile.avatar_url} alt={profile.display_name || 'User'} />
                        <AvatarFallback className="text-xs">
                          {profile?.display_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted border border-border shadow-sm">
                        <Settings className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                    </div>
                  ) : (
                    <Settings className="h-5 w-5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'User'} />
                    <AvatarFallback className="text-xs">
                      {profile?.first_name?.charAt(0) || profile?.display_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {profile?.first_name && profile?.last_name 
                        ? `${profile.first_name} ${profile.last_name}`
                        : profile?.display_name || 'User'}
                    </span>
                    <span className="text-xs text-muted-foreground font-normal truncate max-w-[140px]">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/preferences?section=profile" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" />
                    Edit Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/preferences" className="flex items-center gap-2 cursor-pointer">
                    <SlidersHorizontal className="h-4 w-4" />
                    Preferences
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" />
                    Account
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                      <Shield className="h-4 w-4" />
                      Admin Dashboard
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/help" className="flex items-center gap-2 cursor-pointer">
                    <BookOpen className="h-4 w-4" />
                    Help & Tips
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    localStorage.removeItem('tour-completed');
                    localStorage.removeItem('dismissed-hints');
                    localStorage.removeItem('hints-fully-dismissed');
                    sessionStorage.removeItem('demo-tour-shown-this-session');
                    window.location.href = '/deals';
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restart Tour
                </DropdownMenuItem>
                {isFirstTimeUser && (
                  <DropdownMenuItem 
                    onClick={dismissAllHints}
                    className="flex items-center gap-2 cursor-pointer text-muted-foreground"
                  >
                    <HelpCircle className="h-4 w-4" />
                    Dismiss all hints
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleSignOut}
                  className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </HintTooltip>
        </div>
      </div>
    </header>
  );
}
