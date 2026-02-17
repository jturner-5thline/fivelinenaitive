import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Mail,
  Inbox,
  Send,
  FileEdit,
  Link2,
  Search,
  RefreshCw,
  PenSquare,
  Star,
  Trash2,
  Archive,
  Settings2,
  Clock,
  AlertTriangle,
  Target,
  Landmark,
  Newspaper,
  Calendar,
  Handshake,
  CheckCircle2,
  XCircle,
  Package,
  BarChart3,
  Users,
  Briefcase,
  Paperclip,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MockEmail,
  EmailThread,
  EmailCategory,
  mockEmails as initialMockEmails,
  groupEmailsByThread,
} from './email/mockEmailData';
import { EmailList, EmailDetail } from './email/EmailListAndDetail';
import { cn } from '@/lib/utils';
import { EmailIntelligenceDialog } from './email/EmailIntelligenceDialog';
import { ComposeEmailDialog } from './email/ComposeEmailDialog';

interface DealEmailsTabProps {
  dealId: string;
}

type ViewFilter = 'all' | 'unread' | 'needs_response';
type ChipFilter = 'recent' | 'important' | 'attachments' | null;

interface SidebarSection {
  title: string;
  items: SidebarItem[];
  defaultOpen?: boolean;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: any;
  emoji?: string;
  count?: number;
  indicatorColor?: string;
  filterFn: (e: MockEmail) => boolean;
}

export function DealEmailsTab({ dealId }: DealEmailsTabProps) {
  const [emails, setEmails] = useState<MockEmail[]>(initialMockEmails);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>('all_inbox');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [chipFilter, setChipFilter] = useState<ChipFilter>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Counts
  const needsResponseCount = emails.filter(e => e.needs_response && e.folder === 'inbox').length;
  const starredCount = emails.filter(e => e.is_starred).length;
  const followUpCount = emails.filter(e => e.is_follow_up && e.folder === 'inbox').length;
  const unreadCount = emails.filter(e => !e.is_read && e.folder === 'inbox').length;

  const countByCategory = (cat: EmailCategory) => emails.filter(e => e.category === cat).length;
  const countByDeal = (dealName: string) => emails.filter(e => e.deal_name === dealName).length;

  // Get unique deal names
  const activeDealNames = useMemo(() => {
    const names = new Set<string>();
    emails.forEach(e => {
      if (e.deal_name && e.category === 'deal') names.add(e.deal_name);
    });
    return Array.from(names);
  }, [emails]);

  const dealIndicatorColors: Record<string, string> = {
    'CloudSync Inc': 'bg-emerald-500',
    'TechFlow Solutions': 'bg-amber-500',
    'NextWave Wireless': 'bg-destructive',
    'DataCore Systems': 'bg-primary',
    'VelocityPay': 'bg-purple-500',
  };

  const sidebarSections: SidebarSection[] = [
    {
      title: 'Views',
      defaultOpen: true,
      items: [
        { id: 'all_inbox', label: 'All Inbox', icon: Inbox, count: emails.filter(e => e.folder === 'inbox').length, filterFn: e => e.folder === 'inbox' },
        { id: 'needs_response', label: 'Needs Response', icon: AlertTriangle, count: needsResponseCount || undefined, filterFn: e => e.needs_response && e.folder === 'inbox' },
        { id: 'starred', label: 'Starred', icon: Star, count: starredCount || undefined, filterFn: e => e.is_starred },
        { id: 'follow_up', label: 'Follow Up', icon: Clock, count: followUpCount || undefined, filterFn: e => e.is_follow_up && e.folder === 'inbox' },
        { id: 'drafts', label: 'Drafts', icon: FileEdit, count: emails.filter(e => e.folder === 'drafts').length || undefined, filterFn: e => e.folder === 'drafts' },
        { id: 'sent', label: 'Sent Items', icon: Send, count: emails.filter(e => e.folder === 'sent').length || undefined, filterFn: e => e.folder === 'sent' },
      ],
    },
    {
      title: 'Active Deals',
      defaultOpen: true,
      items: activeDealNames.map(name => ({
        id: `deal_${name}`,
        label: name,
        icon: Briefcase,
        count: countByDeal(name) || undefined,
        indicatorColor: dealIndicatorColors[name] || 'bg-primary',
        filterFn: (e: MockEmail) => e.deal_name === name,
      })),
    },
    {
      title: 'Other',
      defaultOpen: false,
      items: [
        { id: 'cat_prospect', label: 'Prospects', emoji: '🎯', icon: Target, count: countByCategory('prospect') || undefined, filterFn: e => e.category === 'prospect' },
        { id: 'cat_lender', label: 'Lenders', emoji: '🏦', icon: Landmark, count: countByCategory('lender') || undefined, filterFn: e => e.category === 'lender' },
        { id: 'cat_newsletter', label: 'Newsletters', emoji: '📰', icon: Newspaper, count: countByCategory('newsletter') || undefined, filterFn: e => e.category === 'newsletter' },
        { id: 'cat_conference', label: 'Conferences/Events', emoji: '🎪', icon: Calendar, count: countByCategory('conference') || undefined, filterFn: e => e.category === 'conference' },
        { id: 'cat_partnership', label: 'Partnerships', emoji: '🤝', icon: Handshake, count: countByCategory('partnership') || undefined, filterFn: e => e.category === 'partnership' },
      ],
    },
    {
      title: 'Internal Process',
      defaultOpen: false,
      items: [
        { id: 'cat_internal_deal', label: 'Deal Management', emoji: '📋', icon: BarChart3, count: emails.filter(e => e.category === 'internal' && e.deal_name).length || undefined, filterFn: e => e.category === 'internal' && !!e.deal_name },
        { id: 'cat_internal_all', label: 'All Hands', emoji: '👥', icon: Users, count: emails.filter(e => e.category === 'internal' && !e.deal_name).length || undefined, filterFn: e => e.category === 'internal' && !e.deal_name },
      ],
    },
    {
      title: 'Closed Deals / Archived',
      defaultOpen: false,
      items: [
        { id: 'cat_closed_won', label: 'Successfully Closed', emoji: '✅', icon: CheckCircle2, count: countByCategory('closed_won') || undefined, filterFn: e => e.category === 'closed_won' },
        { id: 'cat_closed_lost', label: 'Closed Lost', emoji: '❌', icon: XCircle, count: countByCategory('closed_lost') || undefined, filterFn: e => e.category === 'closed_lost' },
        { id: 'cat_archive', label: 'Archive', emoji: '📦', icon: Package, count: countByCategory('archive') || undefined, filterFn: e => e.category === 'archive' },
      ],
    },
  ];

  // Find active sidebar item
  const activeItem = useMemo(() => {
    for (const section of sidebarSections) {
      const found = section.items.find(i => i.id === activeItemId);
      if (found) return found;
    }
    return sidebarSections[0].items[0];
  }, [activeItemId, sidebarSections]);

  // Filter emails
  const filteredEmails = useMemo(() => {
    let filtered = emails.filter(activeItem.filterFn);

    // View filter
    if (viewFilter === 'unread') filtered = filtered.filter(e => !e.is_read);
    if (viewFilter === 'needs_response') filtered = filtered.filter(e => e.needs_response);

    // Chip filter
    if (chipFilter === 'recent') filtered = filtered.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    if (chipFilter === 'important') filtered = filtered.filter(e => e.is_starred || e.labels.includes('Important'));
    if (chipFilter === 'attachments') filtered = filtered.filter(e => e.has_attachments);

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.subject.toLowerCase().includes(q) ||
          e.from_name.toLowerCase().includes(q) ||
          e.from_email.toLowerCase().includes(q) ||
          e.snippet.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [emails, activeItem, viewFilter, chipFilter, searchQuery]);

  const currentThread = useMemo(() => {
    if (!selectedThread) return null;
    const threads = groupEmailsByThread(emails);
    return threads.find(t => t.threadId === selectedThread.threadId) || null;
  }, [emails, selectedThread]);

  const handleToggleLink = (email: MockEmail) => {
    setEmails(prev =>
      prev.map(e =>
        e.id === email.id ? { ...e, is_linked_to_deal: !e.is_linked_to_deal } : e
      )
    );
    toast.success(email.is_linked_to_deal ? 'Email unlinked from deal' : 'Email linked to deal');
  };

  const handleToggleStar = (email: MockEmail) => {
    setEmails(prev =>
      prev.map(e =>
        e.id === email.id ? { ...e, is_starred: !e.is_starred } : e
      )
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsRefreshing(false);
    toast.success('Inbox refreshed');
  };

  const toggleSection = (title: string) => {
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const isSectionOpen = (section: SidebarSection) => {
    if (collapsedSections[section.title] !== undefined) return !collapsedSections[section.title];
    return section.defaultOpen ?? false;
  };

  // Active label
  const activeLabel = activeItem?.label || 'Inbox';

  return (
    <Card className="overflow-hidden w-full max-w-full">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/20">
        <Button variant="gradient" size="sm" className="gap-1.5 text-xs h-8 px-3" onClick={() => setComposeOpen(true)}>
          <PenSquare className="h-3.5 w-3.5" />
          New mail
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => toast.info('Reply coming soon')}>
              Reply
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Reply (R)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => toast.info('Delete coming soon')}>
              Delete
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Delete</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => toast.info('Archive coming soon')}>
              Archive
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Archive</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIntelligenceOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Email Intelligence Settings</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </Button>
        <Badge variant="secondary" className="text-[10px] h-5">Mock</Badge>
      </div>

      <EmailIntelligenceDialog open={intelligenceOpen} onOpenChange={setIntelligenceOpen} />
      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={(v) => { setComposeOpen(v); if (!v) setComposeReplyTo(null); }}
        onSend={(emailData) => {
          const newEmail: MockEmail = {
            ...emailData,
            id: `mock-sent-${Date.now()}`,
            threadId: composeReplyTo?.threadId || `thread-sent-${Date.now()}`,
          };
          setEmails(prev => [newEmail, ...prev]);
        }}
        replyTo={composeReplyTo}
      />

      <CardContent className="p-0">
        <div className="flex min-h-[560px] overflow-hidden max-w-full">
          {/* ─── Left: Grouped sidebar ─── */}
          <div className="border-r flex-shrink-0 w-[220px] flex flex-col">
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-7 text-xs bg-muted/30 border-border/50"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-1 pb-2">
                {sidebarSections.map((section) => (
                  <div key={section.title} className="mb-1">
                    <button
                      onClick={() => toggleSection(section.title)}
                      className="w-full flex items-center gap-1 px-2 py-1.5 text-left"
                    >
                      {isSectionOpen(section) ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {section.title}
                      </span>
                    </button>
                    {isSectionOpen(section) && (
                      <div className="space-y-0.5 mt-0.5">
                        {section.items.map(item => {
                          const isActive = activeItemId === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setActiveItemId(item.id);
                                setSelectedThread(null);
                                setViewFilter('all');
                                setChipFilter(null);
                              }}
                              className={cn(
                                'w-full flex items-center gap-2 rounded-r-md text-left transition-all duration-120 px-2.5 py-1.5 relative border-l-[3px]',
                                isActive
                                  ? 'border-l-primary bg-primary/10 text-foreground shadow-[inset_0_0_12px_-4px_hsl(var(--primary)/0.3)]'
                                  : 'border-l-transparent text-muted-foreground hover:border-l-primary/50 hover:bg-primary/5 hover:text-foreground'
                              )}
                            >
                              {item.indicatorColor ? (
                                <span className={cn('w-2 h-2 rounded-full shrink-0', item.indicatorColor)} />
                              ) : item.emoji ? (
                                <span className="text-xs shrink-0">{item.emoji}</span>
                              ) : (
                                <item.icon className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span className="text-xs flex-1 truncate">{item.label}</span>
                              {item.count != null && item.count > 0 && (
                                <span className={cn(
                                  'text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
                                  item.id === 'needs_response' && item.count > 0
                                    ? 'bg-destructive text-destructive-foreground'
                                    : 'bg-muted text-muted-foreground'
                                )}>
                                  {item.count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* ─── Middle: Email list with view tabs ─── */}
          <div className={cn(
            'border-r flex-shrink-0 flex flex-col min-w-0',
            currentThread ? 'hidden md:flex md:w-[380px]' : 'flex-1 md:w-[380px]'
          )}>
            {/* View controls */}
            <div className="border-b">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold truncate">{activeLabel}</span>
                <div className="flex gap-1">
                  {(['all', 'unread', 'needs_response'] as ViewFilter[]).map(vf => (
                    <button
                      key={vf}
                      onClick={() => setViewFilter(vf)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                        viewFilter === vf
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      {vf === 'all' ? 'All' : vf === 'unread' ? 'Unread' : 'Needs Response'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Filter chips */}
              <div className="flex gap-1.5 px-3 pb-2">
                {([
                  { id: 'recent' as ChipFilter, label: '🕐 Recent' },
                  { id: 'important' as ChipFilter, label: '⭐ Important' },
                  { id: 'attachments' as ChipFilter, label: '📎 Attachments' },
                ]).map(chip => (
                  <button
                    key={chip.id}
                    onClick={() => setChipFilter(chipFilter === chip.id ? null : chip.id)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors',
                      chipFilter === chip.id
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-transparent border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Email list */}
            <div className="flex-1 h-[440px] overflow-hidden">
              <EmailList
                emails={filteredEmails}
                selectedThread={currentThread}
                onSelectThread={setSelectedThread}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
              />
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-4 px-3 py-2 border-t bg-muted/10 text-[11px]">
              <span className="text-muted-foreground">
                📧 Total: <span className="font-semibold text-foreground tabular-nums">{filteredEmails.length}</span>
              </span>
              <span className="text-muted-foreground">
                ⚠️ Response: <span className="font-semibold text-foreground tabular-nums">{filteredEmails.filter(e => e.needs_response).length}</span>
              </span>
              <span className="text-muted-foreground">
                📬 Unread: <span className="font-semibold text-foreground tabular-nums">{filteredEmails.filter(e => !e.is_read).length}</span>
              </span>
            </div>
          </div>

          {/* ─── Right: Reading pane ─── */}
          <div className={cn(
            'flex-1 flex flex-col min-w-0 overflow-hidden w-0',
            !currentThread ? 'hidden md:flex' : 'flex'
          )}>
            {currentThread ? (
              <EmailDetail
                thread={currentThread}
                dealId={dealId}
                onBack={() => setSelectedThread(null)}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
                onCompose={(replyTo) => {
                  setComposeReplyTo(replyTo);
                  setComposeOpen(true);
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/15 mb-3" />
                <p className="text-sm text-muted-foreground">Select a conversation to read</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Keyboard shortcuts: R (reply) · F (forward) · L (link to deal)
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
