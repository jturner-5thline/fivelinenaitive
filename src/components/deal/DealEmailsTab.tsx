import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useUiPreference } from '@/hooks/useUiPreference';
import { filterEmailsByCategory, EMAIL_CATEGORY_TABS, type EmailCategoryTab } from '@/utils/emailClassifier';
import { useEmailClassifierData } from '@/hooks/useEmailClassifierData';
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
  FolderOpen,
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

interface SearchFilters {
  sender: string;
  dateRange: 'all' | 'today' | 'this_week' | 'this_month';
  hasAttachments: boolean;
  responseStatus: 'all' | 'needs_response' | 'responded';
  dealAssociation: string;
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

function isAutoReplyOrNewsletter(email: MockEmail): boolean {
  const subjectLower = email.subject.toLowerCase();
  const fromLower = email.from_email.toLowerCase();
  const autoSubjectPatterns = ['out of office', 'auto-reply', 'automatic reply'];
  if (autoSubjectPatterns.some(p => subjectLower.includes(p))) return true;
  if (subjectLower.startsWith('re:')) {
    const calendarKeywords = ['invitation', '1:1', 'meeting', 'calendar'];
    if (calendarKeywords.some(k => subjectLower.includes(k))) return true;
  }
  const senderPatterns = ['noreply', 'no-reply', 'newsletter', 'mailer', 'notifications'];
  if (senderPatterns.some(p => fromLower.includes(p))) return true;
  if (email.labels.some(l => l.toLowerCase() === 'list-unsubscribe' || l.toLowerCase() === 'newsletter')) return true;
  return false;
}

export function DealEmailsTab({ dealId, externalEmails, onRefresh, isRefreshingExternal, onGmailSend }: DealEmailsTabProps) {
  const navigate = useNavigate();
  const { entities: classifierEntities, orgCtx } = useEmailClassifierData();
  const [emails, setEmails] = useState<MockEmail[]>(() => {
    const source = externalEmails || initialMockEmails;
    return source.map(e => isAutoReplyOrNewsletter(e) ? { ...e, needs_response: false } : e);
  });

  useEffect(() => {
    if (externalEmails) {
      setEmails(externalEmails.map(e => isAutoReplyOrNewsletter(e) ? { ...e, needs_response: false } : e));
    }
  }, [externalEmails]);

  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [readingPaneExpanded, setReadingPaneExpanded] = useState(false);

  // ─── Resizable middle column ───────────────────────────────
  const DEFAULT_INBOX_WIDTH = 260;
  const MIN_INBOX_WIDTH = 180;
  const MAX_INBOX_WIDTH = 450;
  const [savedInboxWidth, persistInboxWidth] = useUiPreference<number>('email_inbox_column_width', DEFAULT_INBOX_WIDTH);
  const [liveInboxWidth, setLiveInboxWidth] = useState<number | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const inboxWidth = liveInboxWidth ?? savedInboxWidth;

  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = inboxWidth;
    setIsResizing(true);

    // Disable text selection globally during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      ev.preventDefault();
      const delta = ev.clientX - dragStartX.current;
      const newW = Math.max(MIN_INBOX_WIDTH, Math.min(MAX_INBOX_WIDTH, dragStartWidth.current + delta));
      setLiveInboxWidth(newW);
    };

    const onUp = () => {
      isDragging.current = false;
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setLiveInboxWidth(prev => {
        if (prev != null) persistInboxWidth(prev);
        return prev;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [inboxWidth, persistInboxWidth]);
  const [activeItemId, setActiveItemId] = useState<string>('all_inbox');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [chipFilter, setChipFilter] = useState<ChipFilter>(null);
  const [categoryTab, setCategoryTab] = useState<EmailCategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    'DataCore Systems': 'bg-[hsl(var(--outlook-blue))]',
    'VelocityPay': 'bg-purple-500',
  };

  // Favorites = pinned items at top
  const favoritesSection: SidebarSection = {
    title: 'Favorites',
    defaultOpen: true,
    items: [
      { id: 'all_inbox', label: 'Inbox', icon: Inbox, count: unreadCount || undefined, filterFn: e => e.folder === 'inbox' },
      { id: 'sent', label: 'Sent Items', icon: Send, filterFn: e => e.folder === 'sent' },
      { id: 'drafts', label: 'Drafts', icon: FileEdit, count: emails.filter(e => e.folder === 'drafts').length || undefined, filterFn: e => e.folder === 'drafts' },
    ],
  };

  const foldersSections: (SidebarSection & { isDealFilter?: boolean })[] = [
    {
      title: 'Folders',
      defaultOpen: true,
      items: [
        { id: 'needs_response', label: 'Needs Response', icon: AlertTriangle, count: needsResponseCount || undefined, filterFn: e => e.needs_response && e.folder === 'inbox' },
        { id: 'starred', label: 'Flagged', icon: Star, count: starredCount || undefined, filterFn: e => e.is_starred },
        { id: 'follow_up', label: 'Follow Up', icon: Clock, count: followUpCount || undefined, filterFn: e => e.is_follow_up && e.folder === 'inbox' },
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
        indicatorColor: dealIndicatorColors[name] || 'bg-[hsl(var(--outlook-blue))]',
        filterFn: (e: MockEmail) => e.deal_name === name,
      })),
    },
    {
      title: 'Categories',
      defaultOpen: false,
      isDealFilter: true,
      items: [
        { id: 'cat_prospect', label: 'Prospects', icon: Target, count: countByCategory('prospect') || undefined, filterFn: e => e.category === 'prospect' },
        { id: 'cat_lender', label: 'Lenders', icon: Landmark, count: countByCategory('lender') || undefined, filterFn: e => e.category === 'lender' },
        { id: 'cat_conference', label: 'Conferences', icon: Calendar, count: countByCategory('conference') || undefined, filterFn: e => e.category === 'conference' },
        { id: 'cat_partnership', label: 'Partnerships', icon: Handshake, count: countByCategory('partnership') || undefined, filterFn: e => e.category === 'partnership' },
      ],
    },
    {
      title: 'Archive',
      defaultOpen: false,
      isDealFilter: true,
      items: [
        { id: 'cat_closed_won', label: 'Closed Won', icon: CheckCircle2, count: countByCategory('closed_won') || undefined, filterFn: e => e.category === 'closed_won' },
        { id: 'cat_closed_lost', label: 'Closed Lost', icon: XCircle, count: countByCategory('closed_lost') || undefined, filterFn: e => e.category === 'closed_lost' },
        { id: 'cat_archive', label: 'Archive', icon: Package, count: countByCategory('archive') || undefined, filterFn: e => e.category === 'archive' },
      ],
    },
  ];

  const allSections = [favoritesSection, ...foldersSections];

  const activeItem = useMemo(() => {
    for (const section of allSections) {
      const found = section.items.find(i => i.id === activeItemId);
      if (found) return found;
    }
    return favoritesSection.items[0];
  }, [activeItemId, allSections]);

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

  const filteredEmails = useMemo(() => {
    let filtered = emails.filter(activeItem.filterFn);
    // Category tab filter (shared classifier)
    if (categoryTab !== 'all') {
      filtered = filterEmailsByCategory(filtered, categoryTab, classifierEntities, orgCtx);
    }
    if (viewFilter === 'unread') filtered = filtered.filter(e => !e.is_read);
    if (viewFilter === 'needs_response') filtered = filtered.filter(e => e.needs_response);
    if (chipFilter === 'recent') filtered = filtered.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    if (chipFilter === 'important') filtered = filtered.filter(e => e.is_starred || e.labels.includes('Important'));
    if (chipFilter === 'attachments') filtered = filtered.filter(e => e.has_attachments);
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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        e => e.subject.toLowerCase().includes(q) || e.from_name.toLowerCase().includes(q) || e.from_email.toLowerCase().includes(q) || e.snippet.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [emails, activeItem, viewFilter, chipFilter, categoryTab, searchQuery, searchFilters, classifierEntities]);

  const currentThread = useMemo(() => {
    if (!selectedThread) return null;
    const threads = groupEmailsByThread(emails);
    return threads.find(t => t.threadId === selectedThread.threadId) || null;
  }, [emails, selectedThread]);

  const handleToggleLink = (email: MockEmail) => {
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_linked_to_deal: !e.is_linked_to_deal } : e));
    toast.success(email.is_linked_to_deal ? 'Email unlinked from deal' : 'Email linked to deal');
  };

  const handleToggleStar = (email: MockEmail) => {
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_starred: !e.is_starred } : e));
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

  const handleBulkMarkRead = useCallback(() => {
    setEmails(prev => prev.map(e => {
      const threads = groupEmailsByThread([e]);
      if (threads.some(t => selectedIds.has(t.threadId))) return { ...e, is_read: true };
      return e;
    }));
    toast.success(`${selectedIds.size} marked as read`);
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkMarkUnread = useCallback(() => {
    setEmails(prev => prev.map(e => {
      const threads = groupEmailsByThread([e]);
      if (threads.some(t => selectedIds.has(t.threadId))) return { ...e, is_read: false };
      return e;
    }));
    toast.success(`${selectedIds.size} marked as unread`);
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkArchive = useCallback(() => {
    const idsToArchive = new Set<string>();
    const allThreadsLocal = groupEmailsByThread(emails);
    allThreadsLocal.forEach(t => {
      if (selectedIds.has(t.threadId)) t.emails.forEach(e => idsToArchive.add(e.id));
    });
    setEmails(prev => prev.filter(e => !idsToArchive.has(e.id)));
    toast.success(`${selectedIds.size} archived`);
    setSelectedIds(new Set());
  }, [selectedIds, emails]);

  const handleBulkDelete = useCallback(() => {
    const idsToDelete = new Set<string>();
    const allThreadsLocal = groupEmailsByThread(emails);
    allThreadsLocal.forEach(t => {
      if (selectedIds.has(t.threadId)) t.emails.forEach(e => idsToDelete.add(e.id));
    });
    setEmails(prev => prev.filter(e => !idsToDelete.has(e.id)));
    toast.success(`${selectedIds.size} deleted`);
    setSelectedIds(new Set());
  }, [selectedIds, emails]);

  const handleMarkRead = useCallback((email: MockEmail) => {
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e));
  }, []);

  const handleMarkUnread = useCallback((email: MockEmail) => {
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e));
  }, []);

  const handleArchiveEmail = useCallback((email: MockEmail) => {
    setEmails(prev => prev.filter(e => e.id !== email.id));
    toast.success('Archived');
  }, []);

  const handleDeleteEmail = useCallback((email: MockEmail) => {
    setEmails(prev => prev.filter(e => e.id !== email.id));
    toast.success('Deleted');
  }, []);

  const handleSelectThread = useCallback((thread: EmailThread) => {
    setSelectedThread(thread);
    setComposeOpen(false);
    if (thread.hasUnread) {
      const unreadIds = new Set(thread.emails.filter(e => !e.is_read).map(e => e.id));
      setEmails(prev => prev.map(e => unreadIds.has(e.id) ? { ...e, is_read: true } : e));
    }
  }, []);

  const isSectionOpen = (section: SidebarSection) => {
    if (collapsedSections[section.title] !== undefined) return !collapsedSections[section.title];
    return section.defaultOpen ?? false;
  };

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

  const responseCount = filteredEmails.filter(e => e.needs_response).length;
  const filteredUnread = filteredEmails.filter(e => !e.is_read).length;

  const allThreads = useMemo(() => groupEmailsByThread(filteredEmails), [filteredEmails]);

  const responseQueue = useMemo(() => {
    return emails
      .filter(e => e.needs_response && e.folder === 'inbox')
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  }, [emails]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  // Render sidebar item
  const renderSidebarItem = (item: SidebarItem, isDealSection?: boolean) => {
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
          'w-full flex items-center gap-2 text-left transition-all duration-100 px-3 py-1.5 border-l-2',
          isActive
            ? 'border-l-[hsl(var(--outlook-blue))] bg-[hsl(var(--outlook-blue)/0.1)] text-foreground font-medium'
            : 'border-l-transparent text-muted-foreground hover:bg-[hsl(var(--foreground)/0.04)] hover:text-foreground'
        )}
      >
        {item.indicatorColor ? (
          <span className={cn('w-2 h-2 rounded-full shrink-0', item.indicatorColor)} />
        ) : (
          <item.icon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate text-[12px]">{item.label}</span>
        {item.count != null && item.count > 0 && (
          <span className={cn(
            'text-[10px] font-semibold tabular-nums min-w-[18px] text-center',
            item.id === 'needs_response' || (item.id === 'all_inbox' && item.count > 0)
              ? 'text-[hsl(var(--outlook-blue))] font-bold'
              : 'text-muted-foreground'
          )}>
            {item.count}
          </span>
        )}
      </button>
    );
  };

  return (
    <Card className="overflow-hidden w-full max-w-full h-full flex flex-col border-0 rounded-none bg-transparent">
      {/* Outlook-style top toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.06] bg-card/60 backdrop-blur-sm">
        {/* New mail — outlined, Outlook style */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8 px-4 border-[hsl(var(--outlook-blue)/0.3)] text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue)/0.08)] bg-transparent"
          onClick={() => { setComposeOpen(true); setComposeReplyTo(null); }}
        >
          <PenSquare className="h-3.5 w-3.5" />
          New mail
        </Button>

        <div className="flex-1" />

        {/* Keyboard shortcuts help */}
        <Popover open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Keyboard className="h-3.5 w-3.5" />
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
                { key: 'S', desc: 'Toggle flag' },
                { key: 'C', desc: 'Compose' },
                { key: 'Esc', desc: 'Back to inbox' },
                { key: '?', desc: 'This help' },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <kbd className="text-[10px] bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-muted-foreground font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIntelligenceOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Email Intelligence Settings</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} disabled={effectiveRefreshing}>
          <RefreshCw className={cn('h-3.5 w-3.5', effectiveRefreshing && 'animate-spin')} />
        </Button>
        {!externalEmails && <Badge variant="secondary" className="text-[10px] h-5">Mock</Badge>}
      </div>

      <EmailIntelligenceDialog open={intelligenceOpen} onOpenChange={setIntelligenceOpen} />

      <CardContent className="p-0 flex-1 min-h-0">
        <div className="flex h-full overflow-hidden max-w-full min-w-0">
          {/* ─── Left: Outlook-style folder sidebar ─── */}
          <div className="border-r border-white/[0.06] flex-shrink-0 w-[200px] flex flex-col bg-card/40 backdrop-blur-sm">
            <ScrollArea className="flex-1">
              <div className="py-1">
                {/* Favorites */}
                <div className="mb-1">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Favorites
                  </div>
                  {favoritesSection.items.map(item => renderSidebarItem(item))}
                </div>

                <div className="mx-3 my-1 border-t border-white/[0.06]" />

                {/* Folder sections */}
                {foldersSections.map((section) => {
                  const isOpen = isSectionOpen(section);
                  return (
                    <div key={section.title} className="mb-0.5">
                      <button
                        onClick={() => toggleSection(section.title)}
                        className="w-full flex items-center gap-1 px-3 py-1.5 text-left hover:bg-[hsl(var(--foreground)/0.03)]"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 flex-1">
                          {section.title}
                        </span>
                      </button>
                      {isOpen && section.items.map(item => renderSidebarItem(item, section.isDealFilter))}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* ─── Middle: Email list ─── */}
          <div
            className={cn(
              'relative flex flex-col min-w-0 overflow-hidden bg-card/30 backdrop-blur-sm transition-[opacity] duration-200',
              readingPaneExpanded ? 'hidden' :
              (currentThread || composeOpen) ? 'hidden md:flex shrink-0' : 'flex-1'
            )}
            style={(currentThread || composeOpen) && !readingPaneExpanded ? { width: inboxWidth } : undefined}
          >
            {/* Resize handle on right edge — wide hit area, thin visible line */}
            {(currentThread || composeOpen) && !readingPaneExpanded && (
              <div
                onMouseDown={handleResizeStart}
                className={cn(
                  "absolute right-[-6px] top-0 bottom-0 w-[12px] z-30 cursor-col-resize group",
                  isResizing && "bg-primary/10"
                )}
              >
                {/* Visible divider line */}
                <div className={cn(
                  "absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] rounded-full transition-all duration-150",
                  isResizing
                    ? "bg-primary/60 shadow-[0_0_6px_hsl(var(--primary)/0.3)]"
                    : "bg-white/[0.06] group-hover:bg-primary/40"
                )} />
                {/* Grip dots – centered vertically */}
                <div className={cn(
                  "absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col gap-1 transition-opacity duration-150",
                  isResizing ? "opacity-80" : "opacity-0 group-hover:opacity-60"
                )}>
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1 h-1 rounded-full bg-primary/70" />
                  ))}
                </div>
              </div>
            )}
            {/* Search bar — full-width, flat, Outlook style */}
            <div className="px-2 py-1.5 border-b border-white/[0.06]">
              <div className="relative flex gap-1">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search mail"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white/[0.03] border-white/[0.08] rounded focus:border-white/[0.15]"
                  />
                </div>
                <Popover open={searchFiltersOpen} onOpenChange={setSearchFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={activeFilterChips.length > 0 ? 'secondary' : 'ghost'}
                      size="icon"
                      className={cn('h-8 w-8 shrink-0', activeFilterChips.length > 0 && 'text-[hsl(var(--outlook-blue))]')}
                    >
                      <Filter className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-64 p-3 space-y-3">
                    <p className="text-xs font-semibold">Filters</p>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sender</label>
                      <Input
                        placeholder="Filter by sender..."
                        value={searchFilters.sender}
                        onChange={(e) => setSearchFilters(prev => ({ ...prev, sender: e.target.value }))}
                        className="h-7 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date Range</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(['all', 'today', 'this_week', 'this_month'] as const).map(dr => (
                          <button
                            key={dr}
                            onClick={() => setSearchFilters(prev => ({ ...prev, dateRange: dr }))}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                              searchFilters.dateRange === dr
                                ? 'bg-[hsl(var(--outlook-blue))] text-white border-[hsl(var(--outlook-blue))]'
                                : 'bg-white/[0.03] border-white/[0.08] text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {dr === 'all' ? 'All' : dr === 'today' ? 'Today' : dr === 'this_week' ? 'This Week' : 'This Month'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Has Attachments</label>
                      <button
                        onClick={() => setSearchFilters(prev => ({ ...prev, hasAttachments: !prev.hasAttachments }))}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                          searchFilters.hasAttachments
                            ? 'bg-[hsl(var(--outlook-blue))] text-white border-[hsl(var(--outlook-blue))]'
                            : 'bg-white/[0.03] border-white/[0.08] text-muted-foreground'
                        )}
                      >
                        {searchFilters.hasAttachments ? 'Yes' : 'Any'}
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Response Status</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(['all', 'needs_response', 'responded'] as const).map(rs => (
                          <button
                            key={rs}
                            onClick={() => setSearchFilters(prev => ({ ...prev, responseStatus: rs }))}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                              searchFilters.responseStatus === rs
                                ? 'bg-[hsl(var(--outlook-blue))] text-white border-[hsl(var(--outlook-blue))]'
                                : 'bg-white/[0.03] border-white/[0.08] text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {rs === 'all' ? 'All' : rs === 'needs_response' ? 'Needs Response' : 'Responded'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {activeDealNames.length > 0 && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Deal</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <button
                            onClick={() => setSearchFilters(prev => ({ ...prev, dealAssociation: 'all' }))}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                              searchFilters.dealAssociation === 'all'
                                ? 'bg-[hsl(var(--outlook-blue))] text-white border-[hsl(var(--outlook-blue))]'
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
                                'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                                searchFilters.dealAssociation === name
                                  ? 'bg-[hsl(var(--outlook-blue))] text-white border-[hsl(var(--outlook-blue))]'
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

            {/* Header with label + bulk actions */}
            <div className="border-b border-border/30">
              {selectedIds.size > 0 ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[hsl(var(--outlook-blue)/0.05)]">
                  <Checkbox
                    checked={selectedIds.size === groupEmailsByThread(filteredEmails).length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const allIds = new Set(groupEmailsByThread(filteredEmails).map(t => t.threadId));
                        setSelectedIds(allIds);
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[11px] font-medium text-foreground">{selectedIds.size} selected</span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={handleBulkMarkRead}>
                    <MailOpen className="h-3 w-3" /> Read
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={handleBulkArchive}>
                    <Archive className="h-3 w-3" /> Archive
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={handleBulkDelete}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-semibold truncate">{activeLabel}</span>
                    {filteredUnread > 0 && (
                      <span className="text-[10px] text-[hsl(var(--outlook-blue))] font-semibold">{filteredUnread}</span>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    {(['all', 'unread', 'needs_response'] as ViewFilter[]).map(vf => (
                      <button
                        key={vf}
                        onClick={() => setViewFilter(vf)}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                          viewFilter === vf
                            ? 'bg-[hsl(var(--outlook-blue))] text-white'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        )}
                      >
                        {vf === 'all' ? 'All' : vf === 'unread' ? 'Unread' : 'Action'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Category tabs — matches Daily Briefing classification */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30">
              {EMAIL_CATEGORY_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setCategoryTab(t.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-150 border',
                    categoryTab === t.key
                      ? 'bg-primary/20 text-primary border-primary/30'
                      : 'text-muted-foreground border-transparent hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-border/30">
                {activeFilterChips.map(chip => (
                  <span key={chip.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[hsl(var(--outlook-blue)/0.1)] text-[hsl(var(--outlook-blue))] border border-[hsl(var(--outlook-blue)/0.2)]">
                    {chip.label}
                    <button onClick={() => removeFilter(chip.key)} className="hover:text-foreground">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Email list */}
            <div className="flex-1 min-h-0 overflow-auto">
              <EmailList
                emails={filteredEmails}
                selectedThread={currentThread}
                onSelectThread={handleSelectThread}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onMarkRead={handleMarkRead}
                onMarkUnread={handleMarkUnread}
                onArchive={handleArchiveEmail}
                onDelete={handleDeleteEmail}
              />
            </div>
          </div>

          {/* ─── Right: Reading pane / Compose ─── */}
          <div className={cn(
            'flex-1 flex flex-col min-w-0 overflow-hidden w-0 bg-[hsl(var(--email-reading-bg))]',
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
                onBack={() => { setSelectedThread(null); setReadingPaneExpanded(false); }}
                isExpanded={readingPaneExpanded}
                onToggleExpand={() => setReadingPaneExpanded(prev => !prev)}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
                onDelete={handleDeleteEmail}
                onArchive={handleArchiveEmail}
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
              /* Inbox Command Center */
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-6 max-w-2xl mx-auto">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded border border-border/30 p-4 bg-card/40">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Total</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{filteredEmails.length}</p>
                    </div>
                    <div className="rounded border border-border/30 p-4 bg-card/40">
                      <div className="flex items-center gap-2 mb-2">
                        <MailOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Unread</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{filteredUnread}</p>
                    </div>
                    <div className="rounded border border-amber-500/20 p-4 bg-amber-500/[0.04]">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-xs text-amber-400/80">Needs Response</span>
                      </div>
                      <p className="text-2xl font-bold text-amber-400">{responseCount}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Priority Response Queue</h3>
                    {responseQueue.length === 0 ? (
                      <div className="rounded border border-border/20 p-4 text-center bg-card/30">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1.5" />
                        <p className="text-xs text-muted-foreground">All caught up!</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
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
                              className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-muted/20 transition-colors text-left group"
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
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs border-[hsl(var(--outlook-blue)/0.3)] text-[hsl(var(--outlook-blue))]"
                        onClick={() => { setComposeOpen(true); setComposeReplyTo(null); }}
                      >
                        <PenSquare className="h-3 w-3" />
                        Compose
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => navigate('/deals')}
                      >
                        <Briefcase className="h-3 w-3" />
                        Pipeline
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => navigate('/integrations')}
                      >
                        <Calendar className="h-3 w-3" />
                        Calendar
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
