import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Mail,
  MailOpen,
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
  CircleHelp,
  ArrowLeft,
  ArrowRight,
  Filter,
  X,
  Rss,
  Keyboard,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
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
import { InlineComposePanel } from './email/InlineComposePanel';

interface DealEmailsTabProps {
  dealId: string;
  externalEmails?: MockEmail[];
  onRefresh?: () => void;
  isRefreshingExternal?: boolean;
  onGmailSend?: (options: {
    to: string[];
    subject: string;
    body?: string;
    bodyHtml?: string;
    cc?: string[];
    bcc?: string[];
  }) => Promise<any>;
}

type ViewFilter = 'all' | 'unread' | 'needs_response';
type ChipFilter = 'recent' | 'important' | 'attachments' | null;

// Search filter state
interface SearchFilters {
  sender: string;
  dateRange: 'all' | 'today' | 'this_week' | 'this_month';
  hasAttachments: boolean;
  responseStatus: 'all' | 'needs_response' | 'responded';
  dealAssociation: string; // deal name or 'all'
}

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

// Fix #13: check if email is auto-reply or newsletter
function isAutoReplyOrNewsletter(email: MockEmail): boolean {
  const subjectLower = email.subject.toLowerCase();
  const fromLower = email.from_email.toLowerCase();

  // Subject patterns
  const autoSubjectPatterns = [
    'out of office', 'auto-reply', 'automatic reply',
  ];
  if (autoSubjectPatterns.some(p => subjectLower.includes(p))) return true;

  // Re: + calendar keywords
  if (subjectLower.startsWith('re:')) {
    const calendarKeywords = ['invitation', '1:1', 'meeting', 'calendar'];
    if (calendarKeywords.some(k => subjectLower.includes(k))) return true;
  }

  // Sender patterns
  const senderPatterns = ['noreply', 'no-reply', 'newsletter', 'mailer', 'notifications'];
  if (senderPatterns.some(p => fromLower.includes(p))) return true;

  // List-Unsubscribe check (if present in labels)
  if (email.labels.some(l => l.toLowerCase() === 'list-unsubscribe' || l.toLowerCase() === 'newsletter')) return true;

  return false;
}

export function DealEmailsTab({ dealId, externalEmails, onRefresh, isRefreshingExternal, onGmailSend }: DealEmailsTabProps) {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<MockEmail[]>(() => {
    const source = externalEmails || initialMockEmails;
    // Fix #13: suppress needs_response on auto-replies/newsletters
    return source.map(e => isAutoReplyOrNewsletter(e) ? { ...e, needs_response: false } : e);
  });

  // Sync external emails when they change
  useEffect(() => {
    if (externalEmails) {
      setEmails(externalEmails.map(e => isAutoReplyOrNewsletter(e) ? { ...e, needs_response: false } : e));
    }
  }, [externalEmails]);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>('all_inbox');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [chipFilter, setChipFilter] = useState<ChipFilter>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  // Fix #10: compose inline instead of dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // Fix #17: keyboard shortcuts popover
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Search filters
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    sender: '',
    dateRange: 'all',
    hasAttachments: false,
    responseStatus: 'all',
    dealAssociation: 'all',
  });

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

  // Fix #6: compute section email counts for collapsed groups
  const sectionEmailCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const computeForItems = (items: SidebarItem[]) =>
      items.reduce((acc, item) => acc + emails.filter(item.filterFn).length, 0);

    return {
      'Other': computeForItems([
        { id: '', label: '', icon: null, filterFn: e => e.category === 'prospect' },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'lender' },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'newsletter' },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'conference' },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'partnership' },
      ]),
      'Internal Process': computeForItems([
        { id: '', label: '', icon: null, filterFn: e => e.category === 'internal' && !!e.deal_name },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'internal' && !e.deal_name },
      ]),
      'Closed Deals / Archived': computeForItems([
        { id: '', label: '', icon: null, filterFn: e => e.category === 'closed_won' },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'closed_lost' },
        { id: '', label: '', icon: null, filterFn: e => e.category === 'archive' },
      ]),
    };
  }, [emails]);

  const sidebarSections: (SidebarSection & { isDealFilter?: boolean })[] = [
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
        { id: 'newsletters', label: 'Newsletters', icon: Rss, count: countByCategory('newsletter') || undefined, filterFn: e => e.category === 'newsletter' },
      ],
    },
    {
      title: 'Active Deals',
      defaultOpen: true,
      isDealFilter: true,
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
      isDealFilter: true,
      items: [
        { id: 'cat_prospect', label: 'Prospects', emoji: '🎯', icon: Target, count: countByCategory('prospect') || undefined, filterFn: e => e.category === 'prospect' },
        { id: 'cat_lender', label: 'Lenders', emoji: '🏦', icon: Landmark, count: countByCategory('lender') || undefined, filterFn: e => e.category === 'lender' },
        { id: 'cat_conference', label: 'Conferences/Events', emoji: '🎪', icon: Calendar, count: countByCategory('conference') || undefined, filterFn: e => e.category === 'conference' },
        { id: 'cat_partnership', label: 'Partnerships', emoji: '🤝', icon: Handshake, count: countByCategory('partnership') || undefined, filterFn: e => e.category === 'partnership' },
      ],
    },
    {
      title: 'Internal Process',
      defaultOpen: false,
      isDealFilter: true,
      items: [
        { id: 'cat_internal_deal', label: 'Deal Management', emoji: '📋', icon: BarChart3, count: emails.filter(e => e.category === 'internal' && e.deal_name).length || undefined, filterFn: e => e.category === 'internal' && !!e.deal_name },
        { id: 'cat_internal_all', label: 'All Hands', emoji: '👥', icon: Users, count: emails.filter(e => e.category === 'internal' && !e.deal_name).length || undefined, filterFn: e => e.category === 'internal' && !e.deal_name },
      ],
    },
    {
      title: 'Closed Deals / Archived',
      defaultOpen: false,
      isDealFilter: true,
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

  // Active search filter chips for display
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (searchFilters.sender) chips.push({ key: 'sender', label: `From: ${searchFilters.sender}` });
    if (searchFilters.dateRange !== 'all') chips.push({ key: 'dateRange', label: `Date: ${searchFilters.dateRange.replace('_', ' ')}` });
    if (searchFilters.hasAttachments) chips.push({ key: 'hasAttachments', label: 'Has: Attachment' });
    if (searchFilters.responseStatus !== 'all') chips.push({ key: 'responseStatus', label: `Status: ${searchFilters.responseStatus === 'needs_response' ? 'Needs Response' : 'Responded'}` });
    if (searchFilters.dealAssociation !== 'all') chips.push({ key: 'dealAssociation', label: `Deal: ${searchFilters.dealAssociation}` });
    return chips;
  }, [searchFilters]);

  const removeFilter = (key: string) => {
    setSearchFilters(prev => ({
      ...prev,
      [key]: key === 'hasAttachments' ? false : key === 'sender' ? '' : 'all',
    }));
  };

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

    // Search filters
    if (searchFilters.sender) {
      const s = searchFilters.sender.toLowerCase();
      filtered = filtered.filter(e => e.from_name.toLowerCase().includes(s) || e.from_email.toLowerCase().includes(s));
    }
    if (searchFilters.dateRange !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoff = startOfDay;
      if (searchFilters.dateRange === 'this_week') cutoff = new Date(startOfDay.getTime() - 7 * 86400000);
      if (searchFilters.dateRange === 'this_month') cutoff = new Date(startOfDay.getTime() - 30 * 86400000);
      filtered = filtered.filter(e => new Date(e.received_at) >= cutoff);
    }
    if (searchFilters.hasAttachments) filtered = filtered.filter(e => e.has_attachments);
    if (searchFilters.responseStatus === 'needs_response') filtered = filtered.filter(e => e.needs_response);
    if (searchFilters.responseStatus === 'responded') filtered = filtered.filter(e => !e.needs_response);
    if (searchFilters.dealAssociation !== 'all') filtered = filtered.filter(e => e.deal_name === searchFilters.dealAssociation);

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
  }, [emails, activeItem, viewFilter, chipFilter, searchQuery, searchFilters]);

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
    if (onRefresh) {
      onRefresh();
    } else {
      setIsRefreshing(true);
      await new Promise(r => setTimeout(r, 1000));
      setIsRefreshing(false);
      toast.success('Inbox refreshed');
    }
  };

  const effectiveRefreshing = isRefreshingExternal ?? isRefreshing;

  const toggleSection = (title: string) => {
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const isSectionOpen = (section: SidebarSection) => {
    if (collapsedSections[section.title] !== undefined) return !collapsedSections[section.title];
    return section.defaultOpen ?? false;
  };

  // Active label
  const activeLabel = activeItem?.label || 'Inbox';

  const handleComposeSend = useCallback(async (emailData: Omit<MockEmail, 'id' | 'threadId'>) => {
    if (onGmailSend) {
      const result = await onGmailSend({
        to: [emailData.to_email],
        subject: emailData.subject,
        body: emailData.body_preview,
      });
      if (!result) {
        toast.error('Failed to send email');
        return;
      }
      toast.success('Email sent successfully', { description: `To: ${emailData.to_email}`, icon: '✉️' });
    }
    const newEmail: MockEmail = {
      ...emailData,
      id: `mock-sent-${Date.now()}`,
      threadId: composeReplyTo?.threadId || `thread-sent-${Date.now()}`,
    };
    setEmails(prev => [newEmail, ...prev]);
  }, [onGmailSend, composeReplyTo]);

  // Fix #16: Stats counts
  const responseCount = filteredEmails.filter(e => e.needs_response).length;
  const filteredUnread = filteredEmails.filter(e => !e.is_read).length;

  // Threads for keyboard navigation
  const allThreads = useMemo(() => groupEmailsByThread(filteredEmails), [filteredEmails]);

  // Response queue for command center
  const responseQueue = useMemo(() => {
    return emails
      .filter(e => e.needs_response && e.folder === 'inbox')
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  }, [emails]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case 'j': {
          e.preventDefault();
          if (allThreads.length === 0) return;
          const currentIdx = selectedThread ? allThreads.findIndex(t => t.threadId === selectedThread.threadId) : -1;
          const nextIdx = Math.min(currentIdx + 1, allThreads.length - 1);
          setSelectedThread(allThreads[nextIdx]);
          setComposeOpen(false);
          break;
        }
        case 'k': {
          e.preventDefault();
          if (allThreads.length === 0) return;
          const currentIdx = selectedThread ? allThreads.findIndex(t => t.threadId === selectedThread.threadId) : 0;
          const prevIdx = Math.max(currentIdx - 1, 0);
          setSelectedThread(allThreads[prevIdx]);
          setComposeOpen(false);
          break;
        }
        case 'o':
        case 'Enter': {
          if (!selectedThread && allThreads.length > 0) {
            e.preventDefault();
            setSelectedThread(allThreads[0]);
            setComposeOpen(false);
          }
          break;
        }
        case 'r': {
          if (selectedThread) {
            e.preventDefault();
            toast.info('Reply — use R inside the thread view');
          }
          break;
        }
        case 'e': {
          if (selectedThread) {
            e.preventDefault();
            toast.info('Archive coming soon');
          }
          break;
        }
        case 's': {
          if (selectedThread) {
            e.preventDefault();
            handleToggleStar(selectedThread.latestEmail);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setSelectedThread(null);
          setComposeOpen(false);
          break;
        }
        case 'c': {
          e.preventDefault();
          setComposeOpen(true);
          setComposeReplyTo(null);
          break;
        }
        case '?': {
          e.preventDefault();
          setShortcutsOpen(prev => !prev);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [allThreads, selectedThread, handleToggleStar]);

  return (
    <Card className="overflow-hidden w-full max-w-full h-full flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/20">
        <Button
          variant="gradient"
          size="sm"
          className="gap-1.5 text-xs h-9 px-5 shadow-[0_0_12px_hsl(var(--primary)/0.3)] hover:scale-[1.02] transition-transform duration-150"
          onClick={() => { setComposeOpen(true); setComposeReplyTo(null); }}
        >
          <PenSquare className="h-3.5 w-3.5" />
          New mail
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Fix #2: Only show Reply/Delete/Archive when a thread is selected */}
        {currentThread && (
          <>
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
          </>
        )}

        <div className="flex-1" />

        {/* Keyboard shortcuts help */}
        <Popover open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Keyboard className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-64 p-3">
            <p className="text-xs font-semibold mb-3">Keyboard Shortcuts</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                { key: 'J', desc: 'Next email' },
                { key: 'K', desc: 'Previous email' },
                { key: 'O', desc: 'Open email' },
                { key: 'R', desc: 'Reply' },
                { key: 'E', desc: 'Archive' },
                { key: 'S', desc: 'Toggle star' },
                { key: 'C', desc: 'Compose' },
                { key: 'Esc', desc: 'Back to inbox' },
                { key: '?', desc: 'This help' },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <kbd className="text-[10px] bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIntelligenceOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Email Intelligence Settings</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={effectiveRefreshing}>
          <RefreshCw className={cn('h-3.5 w-3.5', effectiveRefreshing && 'animate-spin')} />
        </Button>
        {!externalEmails && <Badge variant="secondary" className="text-[10px] h-5">Mock</Badge>}
      </div>

      <EmailIntelligenceDialog open={intelligenceOpen} onOpenChange={setIntelligenceOpen} />

      <CardContent className="p-0 flex-1 min-h-0">
        <div className="flex h-full overflow-hidden max-w-full">
          {/* ─── Left: Grouped sidebar ─── */}
          <div className="border-r flex-shrink-0 w-[220px] flex flex-col bg-background/80">
            <div className="p-2">
              <div className="relative flex gap-1">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-7 text-xs bg-muted/30 border-border/50"
                  />
                </div>
                <Popover open={searchFiltersOpen} onOpenChange={setSearchFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={activeFilterChips.length > 0 ? 'secondary' : 'ghost'}
                      size="icon"
                      className={cn('h-7 w-7 shrink-0', activeFilterChips.length > 0 && 'text-primary')}
                    >
                      <Filter className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-64 p-3 space-y-3">
                    <p className="text-xs font-semibold">Filters</p>
                    {/* Sender */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sender</label>
                      <Input
                        placeholder="Filter by sender..."
                        value={searchFilters.sender}
                        onChange={(e) => setSearchFilters(prev => ({ ...prev, sender: e.target.value }))}
                        className="h-7 text-xs mt-1"
                      />
                    </div>
                    {/* Date Range */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date Range</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(['all', 'today', 'this_week', 'this_month'] as const).map(dr => (
                          <button
                            key={dr}
                            onClick={() => setSearchFilters(prev => ({ ...prev, dateRange: dr }))}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                              searchFilters.dateRange === dr
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {dr === 'all' ? 'All' : dr === 'today' ? 'Today' : dr === 'this_week' ? 'This Week' : 'This Month'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Has Attachments */}
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Has Attachments</label>
                      <button
                        onClick={() => setSearchFilters(prev => ({ ...prev, hasAttachments: !prev.hasAttachments }))}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                          searchFilters.hasAttachments
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 border-border/50 text-muted-foreground'
                        )}
                      >
                        {searchFilters.hasAttachments ? 'Yes' : 'Any'}
                      </button>
                    </div>
                    {/* Response Status */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Response Status</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(['all', 'needs_response', 'responded'] as const).map(rs => (
                          <button
                            key={rs}
                            onClick={() => setSearchFilters(prev => ({ ...prev, responseStatus: rs }))}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                              searchFilters.responseStatus === rs
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {rs === 'all' ? 'All' : rs === 'needs_response' ? 'Needs Response' : 'Responded'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Deal Association */}
                    {activeDealNames.length > 0 && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Deal</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <button
                            onClick={() => setSearchFilters(prev => ({ ...prev, dealAssociation: 'all' }))}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                              searchFilters.dealAssociation === 'all'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            All
                          </button>
                          {activeDealNames.map(name => (
                            <button
                              key={name}
                              onClick={() => setSearchFilters(prev => ({ ...prev, dealAssociation: name }))}
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                                searchFilters.dealAssociation === name
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeFilterChips.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs text-muted-foreground"
                        onClick={() => setSearchFilters({ sender: '', dateRange: 'all', hasAttachments: false, responseStatus: 'all', dealAssociation: 'all' })}
                      >
                        Clear all filters
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-1 pb-2">
                {sidebarSections.map((section, sectionIdx) => {
                  const isOpen = isSectionOpen(section);
                  const sectionCount = (sectionEmailCounts as any)[section.title] as number | undefined;
                  const isDealFilter = (section as any).isDealFilter;
                  // Add divider before deal filter sections
                  const isFirstDealSection = isDealFilter && (sectionIdx === 0 || !(sidebarSections[sectionIdx - 1] as any).isDealFilter);
                  return (
                    <div key={section.title}>
                      {isFirstDealSection && (
                        <div className="mx-2 my-3">
                          <div className="border-t border-border/30" />
                          <span className="block text-[9px] uppercase tracking-[0.15em] font-bold text-muted-foreground/40 mt-2 px-1">Deal Filters</span>
                        </div>
                      )}
                      <div className="mb-1">
                        <button
                          onClick={() => toggleSection(section.title)}
                          className="w-full flex items-center gap-1 px-2 pt-3 pb-1 text-left"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span className={cn(
                            'uppercase tracking-widest font-semibold flex-1',
                            isDealFilter
                              ? 'text-[9px] text-muted-foreground/40'
                              : 'text-[10px] text-muted-foreground/60'
                          )}>
                            {section.title}
                          </span>
                          {!isOpen && sectionCount != null && sectionCount > 0 && (
                            <span className="text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-muted text-muted-foreground">
                              {sectionCount}
                            </span>
                          )}
                        </button>
                        {isOpen && (
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
                                    <item.icon className={cn('shrink-0', isDealFilter ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                                  )}
                                  <span className={cn('flex-1 truncate', isDealFilter ? 'text-[11px]' : 'text-xs')}>{item.label}</span>
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
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* ─── Middle: Email list with view tabs ─── */}
          <div className={cn(
            'border-r flex-shrink-0 flex flex-col min-w-0 overflow-hidden bg-background/60',
            (currentThread || composeOpen) ? 'hidden md:flex md:w-[380px]' : 'flex-1 md:w-[380px]'
          )}>
            {/* Header with title + stat pills */}
            <div className="border-b">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate">{activeLabel}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                      {filteredEmails.length} total
                    </span>
                    {filteredUnread > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                        {filteredUnread} unread
                      </span>
                    )}
                    {responseCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        {responseCount} need response
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* View filter toggles */}
              <div className="flex items-center gap-1 px-3 pb-2">
                <div className="flex gap-1 flex-1">
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
              {/* Filter chips - pill-shaped */}
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
                      'px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                      chipFilter === chip.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/20 border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {/* Active search filter chips */}
              {activeFilterChips.length > 0 && (
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  {activeFilterChips.map(chip => (
                    <span key={chip.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {chip.label}
                      <button onClick={() => removeFilter(chip.key)} className="hover:text-foreground">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Email list */}
            <div className="flex-1 min-h-0 overflow-auto">
              <EmailList
                emails={filteredEmails}
                selectedThread={currentThread}
                onSelectThread={(thread) => { setSelectedThread(thread); setComposeOpen(false); }}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
              />
            </div>
          </div>

          {/* ─── Right: Reading pane / Compose / Command Center ─── */}
          <div className={cn(
            'flex-1 flex flex-col min-w-0 overflow-hidden w-0 bg-background/40',
            !currentThread && !composeOpen ? 'hidden md:flex' : 'flex'
          )}>
            {composeOpen ? (
              <InlineComposePanel
                onSend={handleComposeSend}
                onClose={() => { setComposeOpen(false); setComposeReplyTo(null); }}
                replyTo={composeReplyTo}
              />
            ) : currentThread ? (
              <EmailDetail
                thread={currentThread}
                dealId={dealId}
                onBack={() => setSelectedThread(null)}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
                onSendReply={async (emailData, threadId) => {
                  if (onGmailSend) {
                    const result = await onGmailSend({
                      to: [emailData.to_email],
                      subject: emailData.subject,
                      body: emailData.body_preview,
                    });
                    if (!result) {
                      toast.error('Failed to send email');
                      return;
                    }
                    toast.success('Email sent successfully', { description: `To: ${emailData.to_email}`, icon: '✉️' });
                  }
                  const newEmail: MockEmail = {
                    ...emailData,
                    id: `mock-sent-${Date.now()}`,
                    threadId,
                  };
                  setEmails(prev => [newEmail, ...prev]);
                }}
              />
            ) : (
              /* ─── Inbox Command Center ─── */
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-6 max-w-2xl mx-auto">
                  {/* Summary stat cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted/20 border border-border/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Total Emails</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{filteredEmails.length}</p>
                    </div>
                    <div className="rounded-lg bg-muted/20 border border-border/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MailOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Unread</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{filteredUnread}</p>
                    </div>
                    <div className="rounded-lg bg-amber-500/[0.08] border border-amber-500/20 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-xs text-amber-400/80">Needs Response</span>
                      </div>
                      <p className="text-2xl font-bold text-amber-400">{responseCount}</p>
                    </div>
                  </div>

                  {/* Priority Response Queue */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Priority Response Queue</h3>
                    {responseQueue.length === 0 ? (
                      <div className="rounded-lg bg-muted/10 border border-border/20 p-4 text-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1.5" />
                        <p className="text-xs text-muted-foreground">All caught up — no responses needed!</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {responseQueue.slice(0, 6).map(email => {
                          const thread = allThreads.find(t => t.emails.some(e => e.id === email.id));
                          return (
                            <button
                              key={email.id}
                              onClick={() => {
                                if (thread) {
                                  setSelectedThread(thread);
                                  setComposeOpen(false);
                                }
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/20 transition-colors text-left group"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-foreground truncate">{email.from_name}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">{email.subject}</p>
                              </div>
                              <ArrowRight className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                          );
                        })}
                        {responseQueue.length > 6 && (
                          <button
                            onClick={() => { setActiveItemId('needs_response'); setViewFilter('all'); }}
                            className="w-full text-center text-[11px] text-primary hover:text-primary/80 py-1.5 transition-colors"
                          >
                            View all {responseQueue.length} →
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Upcoming Tasks placeholder */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Upcoming Tasks & Milestones</h3>
                    <div className="rounded-lg bg-muted/10 border border-border/20 p-4 text-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1.5" />
                      <p className="text-xs text-muted-foreground">No tasks due today ✓</p>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => { setComposeOpen(true); setComposeReplyTo(null); }}
                      >
                        <PenSquare className="h-3 w-3" />
                        Compose Email
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => navigate('/deals')}
                      >
                        <Briefcase className="h-3 w-3" />
                        Go to Pipeline
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => navigate('/integrations')}
                      >
                        <Calendar className="h-3 w-3" />
                        View Calendar
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
