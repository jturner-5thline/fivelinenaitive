import { useState } from 'react';
import { Plus, Settings, User, SlidersHorizontal, LogOut, HelpCircle, Flag, Calendar, RotateCcw, BookOpen, Shield } from 'lucide-react';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { DemoModeBadge } from '@/components/DemoModeBadge';
import { Button } from '@/components/ui/button';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDefaultMilestones } from '@/contexts/DefaultMilestonesContext';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { useAdminRole } from '@/hooks/useAdminRole';
import { formatAmountWithCommas, parseAmountToNumber } from '@/utils/currencyFormat';
import { addDays, format } from 'date-fns';

export function DealsHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { createDeal } = useDealsContext();
  const { company, members } = useCompany();
  const { profile } = useProfile();
  const { stages: dealStages, defaultStageId } = useDealStages();
  const { defaultMilestones } = useDefaultMilestones();
  const { isHintVisible, dismissHint, dismissAllHints, isFirstTimeUser } = useFirstTimeHints();
  const { isAdmin } = useAdminRole();
  const [open, setOpen] = useState(false);
  const [confirmBlankOpen, setConfirmBlankOpen] = useState(false);
  const [blankFields, setBlankFields] = useState<string[]>([]);
  const [dealName, setDealName] = useState('');
  const [dealAmount, setDealAmount] = useState('');
  const [dealStage, setDealStage] = useState(defaultStageId || '');
  const [dealManager, setDealManager] = useState('');
  const [dealOwner, setDealOwner] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [dealStatusNote, setDealStatusNote] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralEmail, setReferralEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showMilestonesPreview, setShowMilestonesPreview] = useState(false);

  const sortedMilestones = [...defaultMilestones].sort((a, b) => a.position - b.position);

  // Get member options for dropdowns - always include current user
  const memberOptions = (() => {
    const options = members.map(member => ({
      value: member.user_id,
      label: member.display_name || member.email || member.user_id.slice(0, 8),
    }));
    
    // If current user is not in the list, add them
    if (user && !options.some(opt => opt.value === user.id)) {
      const currentUserLabel = profile?.display_name || user.email || 'Me';
      options.unshift({
        value: user.id,
        label: currentUserLabel,
      });
    }
    
    return options;
  })();

  

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAmountWithCommas(e.target.value);
    setDealAmount(formatted);
  };

  const getBlankOptionalFields = () => {
    const blank: string[] = [];
    if (!dealManager) blank.push('Deal Manager');
    if (!dealOwner) blank.push('Deal Owner');
    if (!referralName.trim()) blank.push('Referral Source Name');
    if (!referralEmail.trim()) blank.push('Referral Source Email');
    return blank;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const parsedAmount = parseAmountToNumber(dealAmount);
    if (!dealName.trim() || !parsedAmount) {
      toast.error('Please fill in deal name and amount');
      return;
    }

    if (!dealStage) {
      toast.error('Please select a deal stage');
      return;
    }
    
    if (!contactName.trim() || !contactInfo.trim()) {
      toast.error('Please fill in contact name and contact info');
      return;
    }

    if (!dealStatusNote.trim()) {
      toast.error('Please fill in the deal status');
      return;
    }

    // Check for blank optional fields
    const blank = getBlankOptionalFields();
    if (blank.length > 0) {
      setBlankFields(blank);
      setConfirmBlankOpen(true);
      return;
    }

    await createDealFinal();
  };

  const createDealFinal = async () => {
    const parsedAmount = parseAmountToNumber(dealAmount);
    
    // Get display names for the selected users
    const managerName = memberOptions.find(m => m.value === dealManager)?.label || dealManager;
    const ownerName = memberOptions.find(m => m.value === dealOwner)?.label || dealOwner;

    setIsCreating(true);
    try {
      const newDeal = await createDeal({
        company: dealName,
        value: parsedAmount,
        manager: managerName,
        dealOwner: ownerName || undefined,
        contact: contactName.trim(),
        contactInfo: contactInfo.trim(),
        notes: dealStatusNote.trim(),
        status: 'on-track',
        stage: dealStage,
        engagementType: 'guided',
        referredBy: referralName.trim() ? {
          id: '',
          name: referralName.trim(),
          email: referralEmail.trim() || undefined,
        } : undefined,
      });

      if (newDeal) {
        toast.success(`Deal "${dealName}" created successfully!`);
        setOpen(false);
        setConfirmBlankOpen(false);
        resetForm();
        navigate(`/deal/${newDeal.id}`);
      }
    } catch (error) {
      toast.error('Failed to create deal');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setDealName('');
    setDealAmount('');
    setDealStage(defaultStageId || '');
    setDealManager('');
    setDealOwner('');
    setContactName('');
    setContactInfo('');
    setDealStatusNote('');
    setReferralName('');
    setReferralEmail('');
    setBlankFields([]);
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
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="dealAmount"
                        type="text"
                        inputMode="numeric"
                        value={dealAmount}
                        onChange={handleAmountChange}
                        placeholder="0"
                        className="pl-7"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dealStage">Deal Stage <span className="text-destructive">*</span></Label>
                    <Select value={dealStage} onValueChange={setDealStage} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {dealStages.map(stage => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dealManager">Deal Manager</Label>
                      <Select value={dealManager} onValueChange={setDealManager}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          {memberOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dealOwner">Deal Owner</Label>
                      <Select value={dealOwner} onValueChange={setDealOwner}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                        <SelectContent>
                          {memberOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contactName">Contact Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="contactName"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Enter contact name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contactInfo">Contact Info <span className="text-destructive">*</span></Label>
                    <Input
                      id="contactInfo"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="Email or phone number"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dealStatusNote">Deal Status <span className="text-destructive">*</span></Label>
                    <Input
                      id="dealStatusNote"
                      value={dealStatusNote}
                      onChange={(e) => setDealStatusNote(e.target.value)}
                      placeholder="e.g., Client kickoff call to intro lenders"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="referralName">Referral Source Name</Label>
                      <Input
                        id="referralName"
                        value={referralName}
                        onChange={(e) => setReferralName(e.target.value)}
                        placeholder="e.g., John Smith"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="referralEmail">Referral Source Email</Label>
                      <Input
                        id="referralEmail"
                        type="email"
                        value={referralEmail}
                        onChange={(e) => setReferralEmail(e.target.value)}
                        placeholder="e.g., john@example.com"
                      />
                    </div>
                  </div>
                  {sortedMilestones.length > 0 && (
                    <Collapsible open={showMilestonesPreview} onOpenChange={setShowMilestonesPreview}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                          <span className="flex items-center gap-2">
                            <Flag className="h-4 w-4" />
                            {sortedMilestones.length} default milestone{sortedMilestones.length !== 1 ? 's' : ''} will be added
                          </span>
                          <span className="text-xs">{showMilestonesPreview ? 'Hide' : 'Show'}</span>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          {sortedMilestones.map((milestone) => (
                            <div key={milestone.id} className="flex items-center justify-between text-sm">
                              <span className="font-medium">{milestone.title}</span>
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(addDays(new Date(), milestone.daysFromCreation), 'MMM d, yyyy')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit" variant="gradient" disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create Deal'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          
          <AlertDialog open={confirmBlankOpen} onOpenChange={setConfirmBlankOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm blank fields</AlertDialogTitle>
                <AlertDialogDescription>
                  The following optional fields are blank:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {blankFields.map(field => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                  <p className="mt-3">Are you sure you want to create this deal without filling in these fields?</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Go Back</AlertDialogCancel>
                <AlertDialogAction onClick={createDealFinal} disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Yes, Create Deal'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
