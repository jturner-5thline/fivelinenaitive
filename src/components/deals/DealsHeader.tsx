import { useState } from 'react';
import { Plus, Settings, User, SlidersHorizontal, LogOut, FlaskConical, HelpCircle } from 'lucide-react';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useCompany } from '@/hooks/useCompany';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';

export function DealsHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { createDeal } = useDealsContext();
  const { company } = useCompany();
  const { isHintVisible, dismissHint, dismissAllHints, isFirstTimeUser } = useFirstTimeHints();
  const [open, setOpen] = useState(false);
  const [dealName, setDealName] = useState('');
  const [dealAmount, setDealAmount] = useState('');
  const [dealManager, setDealManager] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const isDemoUser = user?.email === 'demo@example.com';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dealName.trim() || !dealAmount.trim() || !dealManager.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    try {
      const newDeal = await createDeal({
        company: dealName,
        value: parseFloat(dealAmount),
        manager: dealManager,
        status: 'on-track',
        stage: 'prospecting',
        engagementType: 'guided',
      });

      if (newDeal) {
        toast.success(`Deal "${dealName}" created successfully!`);
        setOpen(false);
        setDealName('');
        setDealAmount('');
        setDealManager('');
        navigate(`/deal/${newDeal.id}`);
      }
    } catch (error) {
      toast.error('Failed to create deal');
    } finally {
      setIsCreating(false);
    }
  };

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
          {isDemoUser && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 cursor-help">
                    <FlaskConical className="h-3 w-3" />
                    Demo Mode
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-sm">You're exploring with sample data. Feel free to experiment—changes won't affect real accounts.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="gradient" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Deal
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Deal</DialogTitle>
                <DialogDescription>
                  Enter the details for the new deal.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dealName">Deal Name</Label>
                    <Input
                      id="dealName"
                      value={dealName}
                      onChange={(e) => setDealName(e.target.value)}
                      placeholder="Enter deal name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dealAmount">Deal Amount</Label>
                    <Input
                      id="dealAmount"
                      type="number"
                      value={dealAmount}
                      onChange={(e) => setDealAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dealManager">Deal Manager</Label>
                    <Input
                      id="dealManager"
                      value={dealManager}
                      onChange={(e) => setDealManager(e.target.value)}
                      placeholder="Enter manager name"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" variant="gradient" disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create Deal'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </HintTooltip>
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
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{user?.email || 'Settings'}</DropdownMenuLabel>
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
                {isFirstTimeUser && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={dismissAllHints}
                      className="flex items-center gap-2 cursor-pointer text-muted-foreground"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Dismiss all hints
                    </DropdownMenuItem>
                  </>
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
