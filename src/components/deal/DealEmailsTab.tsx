import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useUiPreference } from '@/hooks/useUiPreference';
import { useUndoSend } from '@/contexts/UndoSendContext';
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useAIEmailSearch } from '@/hooks/useAIEmailSearch';
import { useGmailAllMailSearch } from '@/hooks/useGmailAllMailSearch';
import { Sparkles, Loader2 } from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { logSentReplyToDeal } from '@/lib/logSentReplyToDeal';
import { createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import {
  useLabels,
  useAllLabelAssignments,
  threadIdsForLabel,
} from '@/hooks/useEmailLabels';
import { EmailLabelsManageDialog, labelSwatch } from './email/EmailLabelsManageDialog';
import { Tag, Plus as PlusIcon } from 'lucide-react';
import { DealFilterSummaryCard } from '@/components/dashboard/inbox/DealFilterSummaryCard';
import { SIDEBAR_DEAL_FILTER_EVENT } from '@/components/sidebar/DealsFlyoutMenu';
import { LabelFilterChipsRow } from '@/components/dashboard/inbox/LabelFilterChipsRow';
import {
  SYSTEM_LABELS,
  emailMatchesSystemLabel,
  isSystemLabelId,
} from './email/systemAutoLabels';
import { useDealsContext } from '@/contexts/DealsContext';
import { rankDealsForThread } from '@/lib/dealEvidenceMatcher';

/** Compute next business day in local TZ as 'YYYY-MM-DD'. Skips weekends. */
function nextBusinessDayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A message id is a real provider (Nylas/Gmail/Outlook) id only when the
// inbox is hydrated from `externalEmails`. Mock fixtures use the `mock-`
// prefix and must NEVER be sent to the provider sync endpoint.
const isProviderMessageId = (id: string) => !!id && !id.startsWith('mock-');

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
    /** Real File objects to attach (Gmail 25MB total cap, enforced server-side). */
    attachments?: File[];
    /** Provider message id to thread the outbound reply under (Nylas). */
    replyToMessageId?: string;
  }) => Promise<any>;
  /** Pagination — invoked when user clicks "Load more" or hits the auto-load sentinel */
  onLoadMore?: () => void | Promise<void>;
  /** True if there are more older messages available to load */
  hasMore?: boolean;
  /** True while a load-more request is in flight */
  isLoadingMore?: boolean;
  /** True while background auto-pagination is still draining the mailbox */
  isAutoPaginating?: boolean;
  /** Invoked after a successful provider-side trash so the parent can
   *  refetch the Trash folder and reflect the new state immediately. */
  onAfterTrash?: () => void;
}

type ViewFilter = 'all' | 'unread' | 'needs_response';
type ChipFilter = 'recent' | 'important' | 'attachments' | 'stale' | null;

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

// Footer rendered below the email list to surface pagination state.
// - Shows a subtle loading row when more pages are auto-loading or being fetched.
// - Shows a "Load more" button when there are more pages but no auto-load is happening.
// - Shows an end-of-inbox sentinel when fully loaded.
// - Includes an IntersectionObserver sentinel that auto-fires onLoadMore on scroll.
function PaginationFooter({
  onLoadMore,
  hasMore,
  isLoadingMore,
  isAutoPaginating,
  totalLoaded,
  scrollRoot,
}: {
  onLoadMore?: () => void | Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  isAutoPaginating: boolean;
  totalLoaded: number;
  scrollRoot?: Element | null;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Auto-trigger onLoadMore when the sentinel scrolls into view (infinite
  // scroll). The IO must observe the actual scroll container as `root` —
  // using `null` (viewport) caused the sentinel to be considered "visible"
  // whenever it sat within 200px of the *viewport*, which fired in a tight
  // loop after each page appended (see session replay: repeated Load more).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoadingMore || isAutoPaginating || !onLoadMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          onLoadMore();
        }
      },
      // Late-trigger: only fire onLoadMore when the sentinel is essentially
      // at the bottom of the scroll container, so "Loading older messages…"
      // appears only when the user is very close to the end of the list
      // rather than firing eagerly mid-scroll.
      { root: scrollRoot ?? null, rootMargin: '80px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isLoadingMore, isAutoPaginating, onLoadMore, scrollRoot]);

  if (isAutoPaginating || isLoadingMore) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground border-t border-border/30">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>Loading older messages…</span>
      </div>
    );
  }

  if (hasMore && onLoadMore) {
    return (
      <>
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
        <div className="flex items-center justify-center py-3 border-t border-border/30">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onLoadMore()}
          >
            Load more older messages
          </Button>
        </div>
      </>
    );
  }

  if (totalLoaded > 0) {
    return (
      <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground/60 border-t border-border/30">
        <span>End of inbox · {totalLoaded.toLocaleString()} messages loaded</span>
      </div>
    );
  }

  return null;
}

export function DealEmailsTab({ dealId, externalEmails, onRefresh, isRefreshingExternal, onGmailSend, onLoadMore, hasMore, isLoadingMore, isAutoPaginating, onAfterTrash }: DealEmailsTabProps) {
  const { user } = useAuth();
  const { company } = useCompany();
  // Saved signature from Settings → Email signature. Auto-injected into the
  // composer so manual New Mail / Reply drafts include it without the user
  // having to re-type or click "Insert signature".
  const composerSignature = useUserEmailSignature();
  // Routes read-state writes through Nylas → Gmail/Outlook so the change
  // is reflected in the user's actual mailbox. We only call this for
  // real (externally hydrated) emails — never mock fixtures.
  const {
    markRead: providerMarkRead,
    toggleStar: providerToggleStar,
    archiveMessage: providerArchiveMessage,
    trashMessage: providerTrashMessage,
    moveMessage: providerMoveMessage,
  } = useGmail();

  // Tracks locally-mutated fields (is_read / is_starred / is_linked_to_deal /
  // needs_response) that have not yet been confirmed by the upstream provider
  // hydration. Without this, every refresh of `externalEmails` would clobber
  // optimistic UI updates and visually flip read items back to unread until
  // the next provider round-trip lands.
  const localOverridesRef = useRef<Map<string, Partial<MockEmail>>>(new Map());

  const applyLocalOverride = useCallback(
    (id: string, patch: Partial<MockEmail>) => {
      const prev = localOverridesRef.current.get(id) || {};
      localOverridesRef.current.set(id, { ...prev, ...patch });
    },
    []
  );

  const clearLocalOverride = useCallback(
    (id: string, keys?: (keyof MockEmail)[]) => {
      const cur = localOverridesRef.current.get(id);
      if (!cur) return;
      if (!keys) {
        localOverridesRef.current.delete(id);
        return;
      }
      const next = { ...cur };
      keys.forEach((k) => delete (next as any)[k]);
      if (Object.keys(next).length === 0) {
        localOverridesRef.current.delete(id);
      } else {
        localOverridesRef.current.set(id, next);
      }
    },
    []
  );

  // Sync a batch of provider-backed messages to the real mailbox.
  // Optimistic UI is already applied by the caller; on failure we
  // revert via `onRevert` and surface a single toast.
  const syncReadStateToProvider = useCallback(
    async (messageIds: string[], read: boolean, onRevert: () => void) => {
      const providerIds = messageIds.filter(isProviderMessageId);
      if (!externalEmails || providerIds.length === 0) return;

      const results = await Promise.all(
        providerIds.map((id) => providerMarkRead(id, read).catch(() => false))
      );
      const anyFailed = results.some((ok) => !ok);
      if (anyFailed) {
        onRevert();
        // Roll back the override so a subsequent external refresh can take
        // hold again. Successful ids stay overridden until upstream catches up.
        messageIds.forEach((id) => clearLocalOverride(id, ['is_read']));
        toast.error(
          read
            ? "Couldn't sync read state to Gmail/Outlook"
            : "Couldn't sync unread state to Gmail/Outlook",
          { description: 'Reconnect your mailbox in Settings if this keeps happening.' }
        );
      }
    },
    [externalEmails, providerMarkRead, clearLocalOverride]
  );
  const navigate = useNavigate();
  const { queueSend } = useUndoSend();
  const { entities: classifierEntities, orgCtx } = useEmailClassifierData();
  const [emails, setEmails] = useState<MockEmail[]>(() => {
    const source = externalEmails || initialMockEmails;
    return source.map(e => isAutoReplyOrNewsletter(e) ? { ...e, needs_response: false } : e);
  });

  useEffect(() => {
    if (externalEmails) {
      // Reconcile: drop overrides whose upstream value already matches what
      // the user requested locally — that means the provider has caught up
      // and no replay is needed. Then apply remaining overrides on top so
      // optimistic UI changes survive an external refresh.
      const overrides = localOverridesRef.current;
      if (overrides.size) {
        for (const e of externalEmails) {
          const ov = overrides.get(e.id);
          if (!ov) continue;
          const stillDifferent = (Object.keys(ov) as (keyof MockEmail)[]).some(
            (k) => (e as any)[k] !== (ov as any)[k]
          );
          if (!stillDifferent) overrides.delete(e.id);
        }
      }
      setEmails(
        externalEmails.map((e) => {
          const base = isAutoReplyOrNewsletter(e) ? { ...e, needs_response: false } : e;
          const ov = overrides.get(e.id);
          return ov ? { ...base, ...ov } : base;
        })
      );
    }
  }, [externalEmails]);

  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [readingPaneExpanded, setReadingPaneExpanded] = useState(false);

  // ─── Deep-link support for priority signal notifications ──────────
  // Notifications dispatched by `useEmailPrioritySignals` link to:
  //   /deals/<id>?tab=communication&thread=<threadId>&message=<msgId>&signal=<type>
  // When those params land on this tab, auto-select the thread and pass
  // the message + signal into the reading pane via state so it can scroll
  // to the matched message and briefly highlight the detected signal.
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLinkTarget, setDeepLinkTarget] = useState<{
    threadId: string;
    messageId: string | null;
    signal: string | null;
  } | null>(null);
  // Re-run whenever query params or the loaded email set changes — the
  // thread may not exist on first mount if emails are still streaming in.
  const consumedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const threadId = searchParams.get('thread');
    if (!threadId) return;
    const messageId = searchParams.get('message');
    const signal = searchParams.get('signal');
    const sig = `${threadId}::${messageId || ''}::${signal || ''}`;
    if (consumedDeepLinkRef.current === sig) return;
    const threads = groupEmailsByThread(emails);
    const target = threads.find((t) => t.threadId === threadId);
    if (!target) return; // wait for emails to load
    setSelectedThread(target);
    setDeepLinkTarget({ threadId, messageId, signal });
    consumedDeepLinkRef.current = sig;
    // Clean the URL so a manual refresh doesn't keep re-opening the
    // thread; preserve the `tab` param so the user stays on this tab.
    const next = new URLSearchParams(searchParams);
    next.delete('thread');
    next.delete('message');
    next.delete('signal');
    setSearchParams(next, { replace: true });
    // Auto-clear the highlight after 6s so it doesn't linger.
    const t = setTimeout(() => setDeepLinkTarget(null), 6000);
    return () => clearTimeout(t);
  }, [searchParams, emails, setSearchParams]);

  // Ref to the inbox column's scroll container so the pagination IO can use
  // it as `root` instead of the document viewport (see PaginationFooter).
  const inboxScrollRef = useRef<HTMLDivElement | null>(null);

  // ─── Resizable middle column ───────────────────────────────
  // Inbox column widths reduced ~30% for a more compact layout.
  const DEFAULT_INBOX_WIDTH = 168;
  const MIN_INBOX_WIDTH = 140;
  const MAX_INBOX_WIDTH = 252;
  const [savedInboxWidth, persistInboxWidth] = useUiPreference<number>('email_inbox_column_width', DEFAULT_INBOX_WIDTH);
  const [liveInboxWidth, setLiveInboxWidth] = useState<number | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // ─── Folder rail: collapsed (icons only) by default, hover-expand, pin to keep open ───
  const [pinnedOpen, setPinnedOpen] = useUiPreference<boolean>('email_folder_rail_pinned', false);
  const [railHovered, setRailHovered] = useState(false);
  const railExpanded = pinnedOpen || railHovered;
  const railHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const handleRailEnter = useCallback(() => {
    if (railHoverTimer.current) clearTimeout(railHoverTimer.current);
    railHoverTimer.current = setTimeout(() => setRailHovered(true), 70);
  }, []);
  const handleRailLeave = useCallback(() => {
    if (railHoverTimer.current) clearTimeout(railHoverTimer.current);
    railHoverTimer.current = setTimeout(() => setRailHovered(false), 120);
  }, []);
  // Add will-change only while animating, then strip it.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    el.style.willChange = 'width';
    const t = setTimeout(() => {
      if (railRef.current) railRef.current.style.willChange = 'auto';
    }, 220);
    return () => clearTimeout(t);
  }, [railExpanded]);
  useEffect(() => () => {
    if (railHoverTimer.current) clearTimeout(railHoverTimer.current);
  }, []);

  const rawInboxWidth = liveInboxWidth ?? savedInboxWidth;
  // Clamp persisted preferences to the current allowed range so older
  // wider values don't survive the 30% reduction.
  const inboxWidth = Math.max(MIN_INBOX_WIDTH, Math.min(MAX_INBOX_WIDTH, rawInboxWidth));

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
  // Inbox-only deal filter chip selection. When set, the inbox is filtered to
  // emails whose best deal-match resolves to this deal id (using the same
  // matching engine that powers the inline "Likely: …" badges) and sorted
  // chronologically across the entire loaded mailbox.
  const [selectedDealFilterId, setSelectedDealFilterId] = useState<string | null>(null);
  // Inbox label-chip filter selection. Holds a label id (DB) or a virtual
  // system label id (e.g. SYSTEM_LABEL_JTURNER_ID). Null = no label filter.
  const [selectedLabelFilterId, setSelectedLabelFilterId] = useState<string | null>(null);
  const isInboxScope = !dealId; // true when rendered inside InboxDialog
  const [searchQuery, setSearchQuery] = useState('');
  // Immediate text-input state. Typing only updates this; the heavy
  // `searchQuery` (which fans out into filter memos, network search,
  // and AI routing) is updated on a debounce so each keystroke does
  // not re-run the full inbox pipeline and freeze the UI.
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const trimmed = searchInput;
    // Clear immediately so the "clear" affordance feels instant; only
    // debounce when there's actually text to search for.
    if (!trimmed) {
      if (searchQuery !== '') setSearchQuery('');
      return;
    }
    const handle = window.setTimeout(() => {
      setSearchQuery(trimmed);
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);
  // Keep the visible input in sync when callers reset searchQuery
  // programmatically (URL hydration, Esc/clear elsewhere).
  useEffect(() => {
    // Mirror programmatic resets/seeds of searchQuery into the input.
    // Only acts when input is empty (hydration) or query was cleared,
    // so it never fights the user's active typing.
    if (searchQuery === '' && searchInput !== '') {
      setSearchInput('');
    } else if (searchQuery && searchInput === '') {
      setSearchInput(searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDetailAction, setPendingDetailAction] = useState<'reply'|'replyAll'|'forward'|null>(null);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    sender: '',
    dateRange: 'all',
    hasAttachments: false,
    responseStatus: 'all',
    dealAssociation: 'all',
  });

  // ── Custom user labels (Foundation slice) ───────────────────
  const { data: userLabels = [] } = useLabels();
  const { data: labelAssignments = [] } = useAllLabelAssignments();
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);

  // ── AI Search state ─────────────────────────────────────────
  const aiSearch = useAIEmailSearch();
  // True once the user has explicitly run an AI search for the current query.
  // Until then, the search bar behaves as plain keyword search.
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const lastAiQueryRef = useRef<string>('');

  // ── All-mail search backfill ────────────────────────────────
  // The inbox view loads only the INBOX label (kept clean: no spam/trash/
  // sent). When the user types a search, we additionally hit Gmail with
  // `search_all_mail=true` so archived mail and user-labeled mail (Censys,
  // Lenders, Deals, …) surface in results. Disabled when not searching.
  // Disabled inside a deal-scope view where `emails` is already the
  // pre-fetched per-deal thread set.
  const allMailSearch = useGmailAllMailSearch(searchQuery, isInboxScope);

  // ── Search routing ─────────────────────────────────────────
  // No visible mode toggle. We classify the query silently:
  //   • short keywords / entity names → keyword (lexical) only
  //   • natural-language / relational queries → AI semantic search
  // Heuristic signals for "natural-language": relational/operator words
  // (cc, from, to, before, after, since, between, about, mention(s|ed),
  // that, with, regarding, re:), or 4+ words.
  const isNaturalLanguageQuery = useCallback((q: string): boolean => {
    const trimmed = q.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    const NL_TOKEN = /(^|\s)(cc|bcc|from|to|before|after|since|between|about|mention(?:s|ed)?|that|with|regarding|re:|find|show|emails?|messages?|invites?|attachments?|signed|unread|starred|last|this|past|next|today|yesterday|week|month|year)(\s|$|[?.!,])/;
    if (NL_TOKEN.test(lower)) return true;
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 4) return true;
    return false;
  }, []);
  // Hydrate query from ?q= — DEAL scope only.
  //
  // In INBOX scope (dashboard popup) we intentionally do NOT seed the
  // search input from the URL so closing and reopening the popup always
  // starts with an empty search field. Persisting `?q=` across reopens was
  // the source of the "previous search sticks" bug.
  useEffect(() => {
    if (isInboxScope) return;
    const q = searchParams.get('q');
    if (q && q !== searchQuery) setSearchQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the inbox deal filter from (a) the ?inboxDeal=<id> URL param when
  // the inbox is opened from the sidebar Deals flyout, and (b) a window
  // event broadcast by the same flyout when the inbox is already mounted.
  // Both paths ultimately set the same selectedDealFilterId state that the
  // legacy chips row used to control.
  useEffect(() => {
    if (!isInboxScope) return;
    const id = searchParams.get('inboxDeal');
    if (id) {
      if (id !== selectedDealFilterId) setSelectedDealFilterId(id);
      // Strip from the URL so reloads / back-button don't re-apply it.
      const next = new URLSearchParams(searchParams);
      next.delete('inboxDeal');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isInboxScope]);

  useEffect(() => {
    if (!isInboxScope) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { dealId?: string } | undefined;
      if (!detail?.dealId) return;
      setSelectedDealFilterId(detail.dealId);
    };
    window.addEventListener('naitive:select-inbox-deal', handler);
    return () => window.removeEventListener('naitive:select-inbox-deal', handler);
  }, [isInboxScope]);
  // Persist q to URL — DEAL scope only. See note above on the inbox popup.
  useEffect(() => {
    if (isInboxScope) return;
    const next = new URLSearchParams(searchParams);
    const trimmed = searchQuery.trim();
    if (trimmed) next.set('q', trimmed); else next.delete('q');
    next.delete('mode');
    // Only write when something actually changed to avoid history spam.
    const cur = searchParams.toString();
    const nxt = next.toString();
    if (cur !== nxt) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

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

  // System mailbox folders only — no smart-category groupings.
  // Outbox is rendered only when there are messages currently being sent.
  const draftsCount = emails.filter(e => e.folder === 'drafts').length;
  const junkCount = emails.filter(e => e.folder === 'junk').length;
  const trashCount = emails.filter(e => e.folder === 'trash').length;
  const outboxCount = emails.filter(e => e.folder === 'outbox').length;

  const systemFolders: SidebarItem[] = [
    { id: 'all_inbox', label: 'Inbox', icon: Inbox, count: unreadCount || undefined, filterFn: e => e.folder === 'inbox' },
    { id: 'sent', label: 'Sent', icon: Send, filterFn: e => e.folder === 'sent' },
    { id: 'drafts', label: 'Drafts', icon: FileEdit, count: draftsCount || undefined, filterFn: e => e.folder === 'drafts' },
    { id: 'junk', label: 'Junk', icon: AlertTriangle, count: junkCount || undefined, filterFn: e => e.folder === 'junk' },
    { id: 'trash', label: 'Trash', icon: Trash2, count: trashCount || undefined, filterFn: e => e.folder === 'trash' },
    ...(outboxCount > 0
      ? [{ id: 'outbox', label: 'Outbox', icon: Send, count: outboxCount, filterFn: (e: MockEmail) => e.folder === 'outbox' }]
      : []),
  ];

  // Build label folder items. Each label is a "folder" that filters emails
  // whose thread_id is assigned that label.
  const labelFolders: SidebarItem[] = useMemo(() => {
    return userLabels.map(l => {
      const threadIds = threadIdsForLabel(l.id, labelAssignments);
      // Match against the canonical provider thread id (label assignments are
      // stored against that key) and fall back to the local threadId for mock
      // / pre-hydration data.
      const matches = (e: MockEmail) =>
        threadIds.has(e.provider_thread_id || e.threadId);
      const count = emails.filter(matches).length;
      return {
        id: `label:${l.id}`,
        label: l.name,
        icon: Tag,
        indicatorColor: undefined,
        count: count || undefined,
        // Stash the swatch hex on the item so the renderer can color the dot.
        emoji: labelSwatch(l.color),
        filterFn: matches,
      };
    });
  }, [userLabels, labelAssignments, emails]);

  const allSections: SidebarSection[] = [
    { title: 'Mailbox', items: systemFolders, defaultOpen: true },
    { title: 'Labels', items: labelFolders, defaultOpen: true },
  ];

  const activeItem = useMemo(() => {
    for (const section of allSections) {
      const found = section.items.find(i => i.id === activeItemId);
      if (found) return found;
    }
    return systemFolders[0];
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

  // ── Inbox-scope: per-email best deal-match id ────────────────────────
  // Used by the deal filter chip row + summary card. Cached per email id +
  // deal list so we only score each loaded message once. Mirrors the engine
  // used by the inline "Likely: …" badges to keep filter membership and
  // badge labels perfectly consistent.
  const { deals: allDeals } = useDealsContext();
  // Per-email best-deal-match map. Auto-pagination appends a new page every
  // ~350ms which produces a fresh `emails` array reference each tick. Without
  // a cache we re-rank EVERY message against EVERY deal on every append
  // (O(N×M) per page), which dominated the inbox CPU profile. We cache by
  // email id and bust the cache when the deal list changes.
  const dealMatchCacheRef = useRef<{ deals: typeof allDeals; map: Map<string, string | null> }>({
    deals: allDeals,
    map: new Map(),
  });
  const emailDealIdMap = useMemo(() => {
    const out = new Map<string, string>();
    if (!isInboxScope || !allDeals?.length) {
      // Reset cache when scope/deal list goes away so a re-enter recomputes.
      dealMatchCacheRef.current = { deals: allDeals, map: new Map() };
      return out;
    }
    // Bust cache if the deal list identity changed (deals added/removed/edited).
    if (dealMatchCacheRef.current.deals !== allDeals) {
      dealMatchCacheRef.current = { deals: allDeals, map: new Map() };
    }
    const cache = dealMatchCacheRef.current.map;
    for (const e of emails) {
      let cached = cache.get(e.id);
      if (cached === undefined) {
        const ranked = rankDealsForThread(allDeals, {
          subject: e.subject,
          messages: [{
            subject: e.subject,
            fromEmail: e.from_email,
            fromName: e.from_name,
            toEmails: e.to_email ? [e.to_email] : undefined,
            isLatest: true,
          }],
        });
        cached =
          ranked.best && ranked.best.confidence !== 'low'
            ? ranked.best.deal.id
            : null;
        cache.set(e.id, cached);
      }
      if (cached) out.set(e.id, cached);
    }
    return out;
  }, [emails, allDeals, isInboxScope]);

  const dealIdsWithEmails = useMemo(() => {
    const set = new Set<string>();
    emailDealIdMap.forEach((dealId) => set.add(dealId));
    return set;
  }, [emailDealIdMap]);

  // Merge live all-mail search hits (archived + labeled mail) into the
  // pool of emails fed to filtering / AI ranking so search can return mail
  // that lives outside the INBOX label.
  const emailsWithSearchHits = useMemo<MockEmail[]>(() => {
    if (!isInboxScope || !searchQuery.trim() || allMailSearch.results.length === 0) {
      return emails;
    }
    const seen = new Set(emails.map((e) => e.id));
    const additions = allMailSearch.results.filter((e) => !seen.has(e.id));
    if (additions.length === 0) return emails;
    return [...emails, ...additions];
  }, [emails, allMailSearch.results, isInboxScope, searchQuery]);

  const filteredEmails = useMemo(() => {
    // When a deal chip is active, span the entire loaded mailbox (inbox + sent)
    // chronologically — the user is following a specific deal conversation,
    // not a folder. Otherwise honor the active sidebar item.
    // While searching in inbox scope, bypass the sidebar item filter so
    // results from outside INBOX (archived / labeled mail) aren't dropped.
    const isSearching = isInboxScope && !!searchQuery.trim();
    const pool = isSearching ? emailsWithSearchHits : emails;
    let filtered = isSearching || (isInboxScope && selectedDealFilterId)
      ? [...pool]
      : pool.filter(activeItem.filterFn);

    // Deal filter (inbox scope only)
    if (isInboxScope && selectedDealFilterId) {
      filtered = filtered.filter(e => emailDealIdMap.get(e.id) === selectedDealFilterId);
      filtered.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    }

    // Category tab filter (shared classifier)
    if (categoryTab !== 'all') {
      filtered = filterEmailsByCategory(filtered, categoryTab, classifierEntities, orgCtx);
    }
    // Label chip filter (DB labels + system auto-tags). Only applied in the
    // inbox scope so deal-page filtering stays untouched.
    if (isInboxScope && selectedLabelFilterId) {
      if (isSystemLabelId(selectedLabelFilterId)) {
        filtered = filtered.filter((e) =>
          emailMatchesSystemLabel(e, selectedLabelFilterId),
        );
      } else {
        const threadIds = threadIdsForLabel(selectedLabelFilterId, labelAssignments);
        filtered = filtered.filter((e) =>
          threadIds.has(e.provider_thread_id || e.threadId),
        );
      }
    }
    if (viewFilter === 'unread') filtered = filtered.filter(e => !e.is_read);
    if (viewFilter === 'needs_response') filtered = filtered.filter(e => e.needs_response);
    if (chipFilter === 'recent') filtered = filtered.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    if (chipFilter === 'important') filtered = filtered.filter(e => e.is_starred || e.labels.includes('Important'));
    if (chipFilter === 'attachments') filtered = filtered.filter(e => e.has_attachments);
    if (chipFilter === 'stale') {
      // Keep only emails belonging to threads that classify as
      // "Clients & Deals" AND whose newest message is 6+ days old without
      // a reply from us — i.e. the orange + red dots in the row UI.
      const cdEmails = filterEmailsByCategory(filtered, 'clients_deals', classifierEntities, orgCtx);
      const threads = groupEmailsByThread(cdEmails);
      const keepThreadIds = new Set<string>();
      const now = Date.now();
      for (const t of threads) {
        const responded = t.emails.length > 0 && t.emails[0]?.from_name === 'You';
        if (responded) continue;
        const ts = new Date(t.latestEmail.received_at).getTime();
        if (!isFinite(ts)) continue;
        const days = (now - ts) / 86_400_000;
        if (days >= 6) keepThreadIds.add(t.threadId);
      }
      filtered = filtered.filter(e => keepThreadIds.has(e.threadId || e.id));
    }
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

    // ── Search: AI-ranked OR plain keyword ─────────────────────
    if (aiSearchActive && aiSearch.result && aiSearch.result.rankedIds.length > 0) {
      // Re-order `filtered` by AI ranking and drop emails Claude did not rank.
      const order = new Map<string, number>();
      aiSearch.result.rankedIds.forEach((id, idx) => order.set(id, idx));
      filtered = filtered
        .filter(e => order.has(e.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

      // Apply (still-active) AI parsed filters as a post-filter pass so
      // chip removal in the banner actually relaxes constraints.
      const f = aiSearch.result.filters;
      if (f.sender) {
        const s = f.sender.toLowerCase();
        filtered = filtered.filter(
          e =>
            e.from_name.toLowerCase().includes(s) ||
            e.from_email.toLowerCase().includes(s)
        );
      }
      if (f.dateRangeStart || f.dateRangeEnd) {
        const start = f.dateRangeStart ? new Date(f.dateRangeStart).getTime() : -Infinity;
        const endDate = f.dateRangeEnd ? new Date(f.dateRangeEnd) : null;
        // Treat end as inclusive end-of-day.
        const end = endDate
          ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999).getTime()
          : Infinity;
        filtered = filtered.filter(e => {
          const t = new Date(e.received_at).getTime();
          return t >= start && t <= end;
        });
      }
      if (f.hasAttachments === true) filtered = filtered.filter(e => e.has_attachments);
      if (f.hasAttachments === false) filtered = filtered.filter(e => !e.has_attachments);
    } else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // Emails sourced from the Gmail "all-mail" search backfill have already
      // been matched server-side (full body + headers, broader than substring),
      // so we accept them unconditionally. Locally-loaded inbox mail still
      // needs to pass the substring check.
      const allMailHitIds = new Set(allMailSearch.results.map((e) => e.id));
      filtered = filtered.filter((e) => {
        if (allMailHitIds.has(e.id)) return true;
        return (
          e.subject.toLowerCase().includes(q) ||
          e.from_name.toLowerCase().includes(q) ||
          e.from_email.toLowerCase().includes(q) ||
          e.snippet.toLowerCase().includes(q)
        );
      });
    }
    return filtered;
  }, [emails, emailsWithSearchHits, activeItem, viewFilter, chipFilter, categoryTab, searchQuery, searchFilters, classifierEntities, aiSearchActive, aiSearch.result, isInboxScope, selectedDealFilterId, emailDealIdMap, orgCtx, selectedLabelFilterId, labelAssignments, allMailSearch.results]);

  // Candidate set for AI search = the same list pre-search (so categories/folders
  // narrow the AI search scope as the spec requires).
  const aiSearchCandidates = useMemo(() => {
    // While searching in inbox scope, include all-mail search hits so the AI
    // can rank archived / labeled mail alongside inbox mail.
    const isSearching = isInboxScope && !!searchQuery.trim();
    const pool = isSearching ? emailsWithSearchHits : emails;
    let base = isSearching ? [...pool] : pool.filter(activeItem.filterFn);
    if (categoryTab !== 'all') {
      base = filterEmailsByCategory(base, categoryTab, classifierEntities, orgCtx);
    }
    return base;
  }, [emails, emailsWithSearchHits, activeItem, categoryTab, classifierEntities, orgCtx, isInboxScope, searchQuery]);

  const runAISearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (aiSearchCandidates.length === 0) {
      toast.message('No emails to search yet');
      return;
    }
    lastAiQueryRef.current = q;
    setAiSearchActive(true);
    await aiSearch.search(q, aiSearchCandidates);
  }, [searchQuery, aiSearchCandidates, aiSearch]);

  const clearAISearch = useCallback(() => {
    setAiSearchActive(false);
    aiSearch.clear();
    lastAiQueryRef.current = '';
  }, [aiSearch]);

  // ── Lifecycle: debounce + cancel + auto-trigger ────────────
  // No visible mode toggle. We classify silently:
  //   • natural-language / relational queries → AI semantic search
  //   • short keywords / entity names → keyword (lexical) only
  // Keyword filtering always runs in parallel via the filteredEmails memo,
  // so AI augments rather than replaces results when it's invoked.
  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      if (aiSearchActive) clearAISearch();
      return;
    }

    // If we already ran AI for this exact query, do nothing.
    if (aiSearchActive && trimmed === lastAiQueryRef.current) return;

    const shouldRunAI = isNaturalLanguageQuery(trimmed);

    // Cancel any in-flight request before scheduling a new one.
    aiSearch.cancel();

    const delay = shouldRunAI ? 500 : 150;
    const handle = window.setTimeout(() => {
      if (shouldRunAI && aiSearchCandidates.length > 0) {
        lastAiQueryRef.current = trimmed;
        setAiSearchActive(true);
        void aiSearch.search(trimmed, aiSearchCandidates);
      } else if (aiSearchActive) {
        // No longer NL — drop back to keyword-only.
        setAiSearchActive(false);
        lastAiQueryRef.current = '';
      }
    }, delay);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, aiSearchCandidates, isNaturalLanguageQuery]);


  // ─── Selected message resolution (per-message inbox rows) ──────────────
  // The inbox renders ONE ROW PER MESSAGE (Gmail "All Mail" behavior). Each
  // row's `threadId` is actually the individual message id and `latestEmail`
  // is the clicked message. The reading pane needs:
  //   • `latestEmail` = the message the user clicked (drives sender/body/UI)
  //   • `emails`      = the surrounding conversation, freshest data
  //
  // Trust `selectedThread.latestEmail.id` as the canonical key, then re-hydrate
  // the conversation context from the live `emails` array so the detail pane
  // always renders the latest read/star state and any newly-arrived sibling
  // messages.
  const currentThread = useMemo(() => {
    if (!selectedThread) return null;
    try {
      const selectedMsgId = selectedThread.latestEmail?.id;
      // Locate the message itself first — survives id-mismatch, deletes, etc.
      const liveMsg =
        (selectedMsgId && emails.find(e => e.id === selectedMsgId)) ||
        selectedThread.latestEmail ||
        null;
      if (!liveMsg) return null;

      // Hydrate the surrounding conversation by provider thread id (or fall
      // back to the local threadId on the message itself).
      const convoKey = liveMsg.provider_thread_id || liveMsg.threadId;
      const convoEmails = convoKey
        ? emails
            .filter(
              e =>
                (e.provider_thread_id || e.threadId) === convoKey,
            )
            .sort(
              (a, b) =>
                new Date(b.received_at).getTime() -
                new Date(a.received_at).getTime(),
            )
        : [liveMsg];

      return {
        ...selectedThread,
        threadId: liveMsg.id, // per-message identity for the detail pane
        provider_thread_id: liveMsg.provider_thread_id ?? null,
        subject: liveMsg.subject || selectedThread.subject || '(no subject)',
        latestEmail: liveMsg,
        emails: convoEmails.length > 0 ? convoEmails : [liveMsg],
        hasUnread: !liveMsg.is_read,
        isStarred: !!liveMsg.is_starred,
        isLinked: !!liveMsg.is_linked_to_deal,
        hasAttachments: !!liveMsg.has_attachments,
        needsResponse: !!liveMsg.needs_response,
        category: liveMsg.category,
      } as typeof selectedThread;
    } catch (err) {
      console.error('[DealEmailsTab] currentThread resolution failed', {
        err,
        selectedThreadId: selectedThread?.threadId,
        selectedMsgId: selectedThread?.latestEmail?.id,
        emailsCount: emails.length,
      });
      // Fail soft — keep the selection (detail pane shows fallback)
      return selectedThread;
    }
  }, [emails, selectedThread]);

  // Stabilize so memoized ThreadListRow / ThreadListItem instances don't get
  // a fresh handler reference on every parent render (which would defeat
  // React.memo and re-render every row in the inbox on each keystroke or
  // hover anywhere in the widget).
  const handleToggleLink = useCallback((email: MockEmail) => {
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_linked_to_deal: !e.is_linked_to_deal } : e));
    toast.success(email.is_linked_to_deal ? 'Email unlinked from deal' : 'Email linked to deal');
  }, []);

  const handleToggleStar = useCallback((email: MockEmail) => {
    const nextStarred = !email.is_starred;
    const prevSnapshot = emails;
    applyLocalOverride(email.id, { is_starred: nextStarred });
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_starred: nextStarred } : e));
    void providerToggleStar(email.id, nextStarred).then((ok) => {
      if (ok) return;
      clearLocalOverride(email.id, ['is_starred']);
      setEmails(prevSnapshot);
      toast.error(`Couldn't ${nextStarred ? 'flag' : 'unflag'} email`, {
        action: { label: 'Retry', onClick: () => handleToggleStar(email) },
      });
    });
  }, [emails, applyLocalOverride, clearLocalOverride, providerToggleStar]);

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
    // Capture pre-change snapshot for rollback if provider sync fails.
    const prevSnapshot = emails;
    const affectedIds: string[] = [];
    setEmails(prev => prev.map(e => {
      const threads = groupEmailsByThread([e]);
      if (threads.some(t => selectedIds.has(t.threadId))) {
        affectedIds.push(e.id);
        applyLocalOverride(e.id, { is_read: true });
        return { ...e, is_read: true };
      }
      return e;
    }));
    toast.success(`${selectedIds.size} marked as read`);
    setSelectedIds(new Set());
    void syncReadStateToProvider(affectedIds, true, () => setEmails(prevSnapshot));
  }, [selectedIds, emails, syncReadStateToProvider, applyLocalOverride]);

  const handleBulkMarkUnread = useCallback(() => {
    const prevSnapshot = emails;
    const affectedIds: string[] = [];
    setEmails(prev => prev.map(e => {
      const threads = groupEmailsByThread([e]);
      if (threads.some(t => selectedIds.has(t.threadId))) {
        affectedIds.push(e.id);
        applyLocalOverride(e.id, { is_read: false });
        return { ...e, is_read: false };
      }
      return e;
    }));
    toast.success(`${selectedIds.size} marked as unread`);
    setSelectedIds(new Set());
    void syncReadStateToProvider(affectedIds, false, () => setEmails(prevSnapshot));
  }, [selectedIds, emails, syncReadStateToProvider, applyLocalOverride]);

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
    const prevSnapshot = emails;
    setEmails(prev => prev.filter(e => !idsToDelete.has(e.id)));
    toast.success(`${selectedIds.size} deleted`);
    setSelectedIds(new Set());
    // Propagate the delete to the user's real mailbox by trashing each
    // provider-backed message. Mock fixtures (mock-…) stay local only.
    const providerIds = Array.from(idsToDelete).filter(isProviderMessageId);
    if (providerIds.length === 0) return;
    void Promise.all(
      providerIds.map((id) => providerTrashMessage(id).catch(() => false)),
    ).then((results) => {
      const anyFailed = results.some((ok) => !ok);
      if (anyFailed) {
        setEmails(prevSnapshot);
        toast.error("Couldn't delete one or more emails");
      } else {
        onAfterTrash?.();
      }
    });
  }, [selectedIds, emails, providerTrashMessage, onAfterTrash]);

  const handleMarkRead = useCallback((email: MockEmail) => {
    const prevSnapshot = emails;
    applyLocalOverride(email.id, { is_read: true });
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e));
    void syncReadStateToProvider([email.id], true, () => setEmails(prevSnapshot));
  }, [emails, syncReadStateToProvider, applyLocalOverride]);

  const handleMarkUnread = useCallback((email: MockEmail) => {
    const prevSnapshot = emails;
    applyLocalOverride(email.id, { is_read: false });
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e));
    void syncReadStateToProvider([email.id], false, () => setEmails(prevSnapshot));
  }, [emails, syncReadStateToProvider, applyLocalOverride]);

  const handleArchiveEmail = useCallback((email: MockEmail) => {
    const prevSnapshot = emails;
    setEmails(prev => prev.filter(e => e.id !== email.id));
    toast.success('Archived');
    void providerArchiveMessage(email.id).then((ok) => {
      if (ok) return;
      setEmails(prevSnapshot);
      toast.error("Couldn't archive email", {
        action: { label: 'Retry', onClick: () => handleArchiveEmail(email) },
      });
    });
  }, [emails, providerArchiveMessage]);

  const handleDeleteEmail = useCallback((email: MockEmail) => {
    const prevSnapshot = emails;
    setEmails(prev => prev.filter(e => e.id !== email.id));
    toast.success('Deleted');
    void providerTrashMessage(email.id).then((ok) => {
      if (ok) { onAfterTrash?.(); return; }
      setEmails(prevSnapshot);
      toast.error("Couldn't delete email", {
        action: { label: 'Retry', onClick: () => handleDeleteEmail(email) },
      });
    });
  }, [emails, providerTrashMessage, onAfterTrash]);

  const handleSelectThread = useCallback((thread: EmailThread) => {
    setSelectedThread(thread);
    setComposeOpen(false);
    if (thread.hasUnread) {
      const unreadIds = new Set(thread.emails.filter(e => !e.is_read).map(e => e.id));
      const prevSnapshot = emails;
      unreadIds.forEach((id) => applyLocalOverride(id, { is_read: true }));
      setEmails(prev => prev.map(e => unreadIds.has(e.id) ? { ...e, is_read: true } : e));
      // Auto-mark-as-read when opening a thread must also propagate to the
      // user's actual mailbox so it doesn't show as unread in Gmail/Outlook.
      void syncReadStateToProvider(
        Array.from(unreadIds),
        true,
        () => setEmails(prevSnapshot)
      );
    }
  }, [emails, syncReadStateToProvider, applyLocalOverride]);

  // Stable handlers for the EmailDetail right-pane. Keeping these out of the
  // JSX prevents a fresh function identity on every parent render — which,
  // combined with the heavy EmailDetail subtree, was a hot path during
  // search keystrokes / hover / list state churn.
  const handleEmailDetailBack = useCallback(() => {
    setSelectedThread(null);
    setReadingPaneExpanded(false);
  }, []);
  const handleEmailDetailToggleExpand = useCallback(() => {
    setReadingPaneExpanded(prev => !prev);
  }, []);

  // Build a per-row EmailThread (matches the shape EmailList renders for a
  // single message) so right-click row actions can open the reading pane on
  // the exact message that was right-clicked.
  const buildRowThread = useCallback((email: MockEmail) => {
    const conv = groupEmailsByThread(emails).find(
      (t) => t.provider_thread_id === (email.provider_thread_id ?? null) || t.threadId === email.threadId,
    );
    return {
      threadId: email.id,
      provider_thread_id: email.provider_thread_id ?? null,
      subject: email.subject || '(no subject)',
      emails: conv?.emails ?? [email],
      latestEmail: email,
      participants: [],
      hasUnread: !email.is_read,
      isStarred: !!email.is_starred,
      isLinked: !!email.is_linked_to_deal,
      hasAttachments: !!email.has_attachments,
      needsResponse: !!email.needs_response,
      dealName: email.deal_name,
      category: email.category,
    } as EmailThread;
  }, [emails]);

  const handleRowReplyAction = useCallback(
    (action: 'reply'|'replyAll'|'forward') => (email: MockEmail) => {
      const t = buildRowThread(email);
      setSelectedThread(t);
      setComposeOpen(false);
      // Defer slightly so EmailDetail mounts with the new thread before the
      // pendingAction effect fires.
      setTimeout(() => setPendingDetailAction(action), 0);
    },
    [buildRowThread],
  );

  const isSectionOpen = (section: SidebarSection) => {
    if (collapsedSections[section.title] !== undefined) return !collapsedSections[section.title];
    return section.defaultOpen ?? false;
  };

  const activeLabel = activeItem?.label || 'Inbox';

  const handleComposeSend = useCallback(async (emailData: Omit<MockEmail, 'id' | 'threadId'>) => {
    const threadId = composeReplyTo?.threadId || `thread-sent-${Date.now()}`;
    if (!onGmailSend) {
      // Mock-only path (no Gmail wired up): just append locally.
      setEmails(prev => [{ ...emailData, id: `mock-sent-${Date.now()}`, threadId }, ...prev]);
      return;
    }
    queueSend({
      payload: {
        to: [emailData.to_email],
        subject: emailData.subject,
        body: emailData.body_preview,
        meta: { threadId, emailData },
      },
      dedupeKey: `compose:${emailData.to_email}:${emailData.subject}:${(emailData.body_preview || '').length}`,
      performSend: (p) => onGmailSend({
        to: p.to,
        subject: p.subject,
        body: p.body,
        bodyHtml: emailData.body_html,
        attachments: emailData._outgoing_files,
        cc: emailData._cc,
        bcc: emailData._bcc,
      }),
      onSent: () => {
        setEmails(prev => [{ ...emailData, id: `mock-sent-${Date.now()}`, threadId }, ...prev]);
        // ─── Activity log writeback ───
        // If this compose is matched to a deal (via the AI Assist deal chip
        // / page-level dealId), write an "Email Sent" entry to that deal's
        // Activity tab so the timeline reflects outbound work — same
        // contract as the reply path. Fire-and-forget; never block sends.
        const resolvedDealId = dealId || null;
        if (!resolvedDealId) {
          toast.message('Reply sent. Link to a deal to log activity.', {
            duration: 4000,
            action: {
              label: 'Link Deal',
              onClick: () => setComposeOpen(false),
            },
          });
          return;
        }
        (async () => {
          const logResult = await logSentReplyToDeal({
            dealId: resolvedDealId,
            threadId,
            subject: emailData.subject,
            body: emailData.body_preview || '',
            toName: emailData.to_name || emailData.to_email,
            toEmail: emailData.to_email,
            fromDisplayName: emailData.from_name,
            cc: emailData._cc,
            bcc: emailData._bcc,
          });
          const dealLabel = logResult.dealName || 'deal';
          if (!logResult.ok) {
            toast.error(`Email sent, but couldn't log to ${dealLabel} activity`);
            return;
          }
          const recipientLabel = emailData.to_name || emailData.to_email || 'recipient';
          toast.success(`✓ Sent — ${dealLabel} Activity log updated.`, {
            description: `To ${recipientLabel} • "${emailData.subject || '(no subject)'}"`,
            duration: 4000,
          });
        })();
      },
      onUndo: () => {
        // Re-open composer with the original draft preloaded.
        setComposeReplyTo({
          subject: emailData.subject,
          to_email: emailData.to_email,
          to_name: emailData.to_name || emailData.to_email,
          threadId,
        });
        setComposeOpen(true);
      },
    });
  }, [onGmailSend, composeReplyTo, queueSend, dealId]);

  const responseCount = filteredEmails.filter(e => e.needs_response).length;
  const filteredUnread = filteredEmails.filter(e => !e.is_read).length;

  // Inbox renders ONE ROW PER MESSAGE — keyboard nav must traverse the same
  // ordering. Build per-message rows here too so j/k step through individual
  // messages, not whole conversations. Match the row identity contract used
  // in EmailList: `threadId = message.id`, `latestEmail = the message`.
  const allThreads = useMemo(() => {
    return [...filteredEmails]
      .sort(
        (a, b) =>
          new Date(b.received_at).getTime() -
          new Date(a.received_at).getTime(),
      )
      .map(
        (msg) =>
          ({
            threadId: msg.id,
            provider_thread_id: msg.provider_thread_id ?? null,
            subject: msg.subject || '(no subject)',
            emails: [msg],
            latestEmail: msg,
            participants: msg.from_name && msg.from_name !== 'You' ? [msg.from_name] : [],
            hasUnread: !msg.is_read,
            isStarred: !!msg.is_starred,
            isLinked: !!msg.is_linked_to_deal,
            hasAttachments: !!msg.has_attachments,
            needsResponse: !!msg.needs_response,
            dealName: msg.deal_name,
            category: msg.category,
          } as EmailThread),
      );
  }, [filteredEmails]);

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
      // Ignore system/browser shortcuts (Cmd+C copy, Cmd+V paste, Ctrl+A, etc.)
      // so plain single-key shortcuts don't hijack copy/paste/select-all.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
    const hasCount = item.count != null && item.count > 0;
    const isHighlightCount =
      item.id === 'needs_response' || (item.id === 'all_inbox' && (item.count ?? 0) > 0);

    const button = (
      <button
        key={item.id}
        onClick={() => {
          setActiveItemId(item.id);
          setSelectedThread(null);
          setViewFilter('all');
          setChipFilter(null);
        }}
        aria-label={item.label}
        title={!railExpanded ? item.label : undefined}
        className={cn(
          'group relative w-full flex items-center text-left border-l-2 py-2 px-0',
          'transition-colors duration-150',
          isActive
            ? 'border-l-[hsl(var(--outlook-blue))] bg-[hsl(var(--outlook-blue)/0.12)] text-foreground font-medium'
            : 'border-l-transparent text-foreground/85 hover:bg-[hsl(var(--foreground)/0.05)] hover:text-foreground'
        )}
      >
        {/* Fixed-width icon column so labels reveal without reflow */}
        <span className="w-[52px] flex items-center justify-center shrink-0">
          {item.indicatorColor ? (
            <span className={cn('w-2 h-2 rounded-full', item.indicatorColor)} />
          ) : item.emoji && item.emoji.startsWith('#') ? (
            <span
              className="w-2.5 h-2.5 rounded-full ring-1 ring-foreground/10"
              style={{ background: item.emoji }}
            />
          ) : (
            <item.icon
              className={cn(
                'h-[18px] w-[18px] shrink-0',
                isActive ? 'text-foreground' : 'text-foreground/90'
              )}
              strokeWidth={2.25}
            />
          )}
        </span>
        {/* Label + count: always mounted, fade via opacity only — no layout shift */}
        <span
          className={cn(
            'flex-1 min-w-0 flex items-center gap-2 pr-3',
            'transition-opacity duration-150 ease-out',
            railExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          aria-hidden={!railExpanded}
        >
          <span className="flex-1 truncate text-[12px]">{item.label}</span>
          {hasCount && (
            <span
              className={cn(
                'text-[10px] font-semibold tabular-nums min-w-[18px] text-center',
                isHighlightCount
                  ? 'text-[hsl(var(--outlook-blue))] font-bold'
                  : 'text-muted-foreground'
              )}
            >
              {item.count}
            </span>
          )}
        </span>
        {/* Collapsed-state count badge — hidden when expanded */}
        {hasCount && (
          <span
            className={cn(
              'absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full px-1 text-[9px] font-bold tabular-nums leading-[14px] text-center',
              'transition-opacity duration-150 ease-out',
              railExpanded ? 'opacity-0' : 'opacity-100',
              isHighlightCount
                ? 'bg-[hsl(var(--outlook-blue))] text-white'
                : 'bg-foreground/15 text-foreground/90'
            )}
            aria-hidden={railExpanded}
          >
            {item.count}
          </span>
        )}
      </button>
    );

    if (!railExpanded) {
      return (
        <Tooltip key={item.id} delayDuration={150}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
            {hasCount ? ` · ${item.count}` : ''}
          </TooltipContent>
        </Tooltip>
      );
    }
    return button;
  };

  return (
    <Card className="overflow-hidden w-full max-w-full h-full flex flex-col border-0 rounded-none bg-transparent">
      {/* Outlook-style top toolbar — unified header: New + inline search +
          right-aligned helpers. The standalone search row below the inbox
          column has been removed; the inbox list now starts directly under
          this row. */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 pr-12 glass-divider-b h-12">
        {/* New — outlined, Outlook style */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8 px-4 border-[hsl(var(--outlook-blue)/0.3)] text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue)/0.08)] bg-transparent shrink-0"
          onClick={() => { setComposeOpen(true); setComposeReplyTo(null); }}
        >
          <PenSquare className="h-3.5 w-3.5" />
          New
        </Button>

        {/* Inline search + filter — width constrained so it aligns with the
            inbox/list column below. When a thread or composer is open we cap
            the search zone to the inbox column width (minus the New button +
            divider) so the message-action toolbar that follows lines up
            visually with the open-message pane. */}
        <div
          className="relative min-w-0 flex items-center gap-1 shrink-0"
          style={{
            width: (currentThread || composeOpen)
              ? `max(180px, ${Math.max(0, Math.round(inboxWidth) - (railExpanded ? 168 : 52) - 24)}px)`
              : undefined,
            flex: (currentThread || composeOpen) ? '0 0 auto' : '1 1 0%',
          }}
        >
          <div className="relative flex-1 min-w-0">
            {(aiSearch.isSearching || allMailSearch.isSearching) ? (
              <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary animate-spin" />
            ) : aiSearchActive ? (
              <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
            ) : (
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Input
              placeholder='Search mail with AI…'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Flush debounce so AI search uses the latest text.
                  if (searchInput !== searchQuery) setSearchQuery(searchInput);
                  runAISearch();
                } else if (e.key === 'Escape' && aiSearchActive) {
                  e.preventDefault();
                  clearAISearch();
                  setSearchInput('');
                  setSearchQuery('');
                }
              }}
              className={cn(
                'pl-8 pr-7 h-8 text-xs bg-white/[0.03] border-white/[0.08] rounded focus:border-white/[0.15]',
                aiSearchActive && 'border-primary/40 focus:border-primary/60'
              )}
            />
            {(aiSearchActive || searchInput) && (
              <button
                type="button"
                onClick={() => { clearAISearch(); setSearchInput(''); setSearchQuery(''); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors px-1"
                aria-label="Clear search"
                title="Clear search (Esc)"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Popover open={searchFiltersOpen} onOpenChange={setSearchFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={activeFilterChips.length > 0 ? 'secondary' : 'ghost'}
                size="icon"
                className={cn('h-8 w-8 shrink-0', activeFilterChips.length > 0 && 'text-[hsl(var(--outlook-blue))]')}
                aria-label="Search filters"
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              className="w-64 p-3 space-y-3 pointer-events-auto"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
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

        {/* Vertical divider between unified search and right-side helpers */}
        <div className="w-px h-6 bg-white/10 mx-1 shrink-0" aria-hidden />

        {/* Slot for the open-email command bar (Close/Reply/Forward/Delete/
            Archive/Flag/AI Assist/Link Deal/Expand). EmailDetail portals its
            toolbar into this element when a thread is open so the entire
            mail UI shares one unified horizontal header row instead of
            stacking a second action bar above the message body. The slot
            takes flex-1 so it spans the same horizontal range as the
            open-message column underneath. */}
        <div id="email-detail-toolbar-slot" className="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden" />
        {/* Keyboard shortcuts help */}
        <Popover open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIntelligenceOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Email Intelligence Settings</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={effectiveRefreshing}>
              <RefreshCw className={cn('h-3.5 w-3.5', effectiveRefreshing && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Refresh</TooltipContent>
        </Tooltip>
        {!externalEmails && <Badge variant="secondary" className="text-[10px] h-5">Mock</Badge>}
      </div>

      <EmailIntelligenceDialog open={intelligenceOpen} onOpenChange={setIntelligenceOpen} />
      <EmailLabelsManageDialog open={manageLabelsOpen} onOpenChange={setManageLabelsOpen} />

      <CardContent className="p-0 flex-1 min-h-0">
        <div className="grid h-full min-w-0 max-w-full overflow-hidden" style={{ gridTemplateColumns: `${railExpanded ? 168 : 52}px minmax(0, ${currentThread || composeOpen ? `${Math.round(inboxWidth)}px` : '1fr'}) minmax(0, 1fr)` }}>
          {/* ─── Left: Outlook-style folder sidebar ─── */}
          <div
            ref={railRef}
            onMouseEnter={handleRailEnter}
            onMouseLeave={handleRailLeave}
            style={{
              width: railExpanded ? 168 : 52,
              transitionProperty: 'width',
              transitionDuration: '180ms',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              contain: 'layout paint',
            }}
            className="glass-divider-r flex-shrink-0 flex flex-col overflow-hidden"
          >
            {/* Hamburger / pin toggle */}
            <div className="flex items-center justify-center border-b border-white/[0.04] h-9 w-[52px] shrink-0">
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-foreground/80 hover:text-foreground"
                    onClick={() => setPinnedOpen(!pinnedOpen)}
                    aria-label={pinnedOpen ? 'Collapse folders' : 'Pin folders open'}
                    aria-pressed={pinnedOpen}
                  >
                    {pinnedOpen ? (
                      <PanelLeftClose className="h-[16px] w-[16px]" />
                    ) : (
                      <PanelLeftOpen className="h-[16px] w-[16px]" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {pinnedOpen ? 'Collapse folders' : 'Pin folders open'}
                </TooltipContent>
              </Tooltip>
            </div>
            <ScrollArea className="flex-1">
              <div className="py-1.5">
                {systemFolders.map(item => renderSidebarItem(item))}
                {/* ── Custom labels section ── */}
                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                  <div
                    className={cn(
                      'flex items-center gap-1 px-3 pb-1 transition-opacity duration-150',
                      railExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 pb-0'
                    )}
                    aria-hidden={!railExpanded}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex-1">
                      Labels
                    </span>
                    <Tooltip delayDuration={150}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setManageLabelsOpen(true)}
                          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-foreground/10"
                          aria-label="Manage labels"
                        >
                          <PlusIcon className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">Manage labels</TooltipContent>
                    </Tooltip>
                  </div>
                  {labelFolders.length === 0 && railExpanded && (
                    <button
                      type="button"
                      onClick={() => setManageLabelsOpen(true)}
                      className="w-full text-left text-[11px] text-muted-foreground/70 hover:text-foreground px-3 py-1"
                    >
                      + Create label
                    </button>
                  )}
                  {labelFolders.map(item => renderSidebarItem(item))}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* ─── Middle: Email list ─── */}
          <div
            className={cn(
              'relative flex flex-col min-w-0 overflow-hidden transition-[opacity] duration-200',
              readingPaneExpanded ? 'hidden' : (currentThread || composeOpen) ? 'hidden md:flex' : 'flex'
            )}
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

            {/* AI search status / interpretation banner */}
            {(aiSearch.isSearching || aiSearchActive || aiSearch.error) && (
              <div
                className="px-3 py-1.5 border-b border-white/[0.06] bg-primary/[0.04]"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {aiSearch.isSearching ? (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>Searching with AI…</span>
                  </div>
                ) : aiSearch.error ? (
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-destructive truncate">
                      AI search unavailable — showing keyword matches instead.
                    </span>
                    <button
                      onClick={() => { clearAISearch(); }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : aiSearch.result ? (
                  (() => {
                    const f = aiSearch.result.filters;
                    const chips: { key: import('@/hooks/useAIEmailSearch').AIEmailFilterKey; label: string }[] = [];
                    if (f.sender) chips.push({ key: 'sender', label: `From: ${f.sender}` });
                    if (f.senderRole) chips.push({ key: 'senderRole', label: `Role: ${f.senderRole}` });
                    if (f.dateRange && f.dateRange !== 'all') {
                      const pretty = String(f.dateRange).replace(/_/g, ' ');
                      chips.push({ key: 'dateRange', label: `Date: ${pretty}` });
                    } else if (f.dateRangeStart || f.dateRangeEnd) {
                      chips.push({
                        key: 'dateRange',
                        label: `Date: ${f.dateRangeStart || '…'} → ${f.dateRangeEnd || '…'}`,
                      });
                    }
                    if (f.category) chips.push({ key: 'category', label: `Category: ${f.category}` });
                    if (f.hasAttachments === true) chips.push({ key: 'hasAttachments', label: 'Has attachments' });
                    if (f.hasAttachments === false) chips.push({ key: 'hasAttachments', label: 'No attachments' });
                    (f.topics || []).forEach((t) => {
                      if (t && typeof t === 'string') chips.push({ key: `topic:${t}` as const, label: t });
                    });
                    return (
                      <div className="flex flex-col gap-1.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Sparkles className="h-3 w-3 text-primary shrink-0" />
                            <span className="text-muted-foreground shrink-0">AI Search:</span>
                            <span className="text-foreground truncate" title={aiSearch.result.interpretation}>
                              {aiSearch.result.interpretation}
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              · {filteredEmails.length} {filteredEmails.length === 1 ? 'result' : 'results'}
                            </span>
                          </div>
                          <button
                            onClick={() => { clearAISearch(); setSearchQuery(''); }}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                            title="Return to inbox (Esc)"
                          >
                            <X className="h-3 w-3" />
                            Clear
                          </button>
                        </div>
                        {chips.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            {chips.map((chip) => (
                              <span
                                key={chip.key}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                              >
                                <span className="truncate max-w-[180px]">{chip.label}</span>
                                <button
                                  type="button"
                                  onClick={() => aiSearch.removeFilter(chip.key)}
                                  className="hover:text-foreground/80"
                                  aria-label={`Remove filter ${chip.label}`}
                                  title="Drop this constraint"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : null}
              </div>
            )}

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
                    {activeItemId.startsWith('label:') && (
                      <button
                        onClick={() => setActiveItemId('all_inbox')}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                        title="Clear label filter"
                      >
                        <X className="h-3 w-3" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setChipFilter(chipFilter === 'stale' ? null : 'stale')}
                      title="Show only Clients & Deals threads with no reply for 6+ days (orange + red)"
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors mr-1',
                        chipFilter === 'stale'
                          ? 'bg-orange-500 text-white'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                        <span className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          chipFilter === 'stale' ? 'bg-white' : 'bg-orange-500'
                        )} />
                      Stale Emails
                    </button>
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

            {/* Deal filter has moved to the left sidebar (DealsFlyoutMenu).
                The active selection is reflected here by DealFilterSummaryCard
                below. The chips row has been removed to keep the inbox header
                free of redundant tag clutter. */}

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

            {/* Email list — single scroll container for the inbox column.
                EmailList no longer wraps its rows in a Radix ScrollArea, so
                this is the sole scroller; that lets the IO pagination
                sentinel observe the right element and lets the browser
                composite this column independently. */}
            {isInboxScope && selectedDealFilterId && (() => {
              const deal = allDeals.find(d => d.id === selectedDealFilterId);
              if (!deal) return null;
              const lastActivityAt = filteredEmails[0]?.received_at || null;
              return (
                <DealFilterSummaryCard
                  deal={deal}
                  lastActivityAt={lastActivityAt}
                  matchedCount={filteredEmails.length}
                  onClear={() => setSelectedDealFilterId(null)}
                />
              );
            })()}
            <div
              ref={inboxScrollRef}
              className="flex-1 min-h-0 min-w-0 overflow-auto"
              style={{
                overscrollBehavior: 'contain',
                contain: 'layout paint style',
              }}
            >
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
                isLoading={aiSearch.isSearching}
                scrollParent={isInboxScope ? inboxScrollRef.current : null}
                onRowReply={handleRowReplyAction('reply')}
                onRowReplyAll={handleRowReplyAction('replyAll')}
                onRowForward={handleRowReplyAction('forward')}
                onSaveToDeal={handleToggleLink}
                onBulkMarkRead={handleBulkMarkRead}
                onBulkMarkUnread={handleBulkMarkUnread}
                onBulkArchive={handleBulkArchive}
                onBulkDelete={handleBulkDelete}
              />
              {/*
                Screen-reader-only announcer for search progress + result counts.
                The visible AI status banner above already announces interpretation
                (role=status). This region adds a count summary so SR users hear
                "12 results for 'signed NDAs'" or "No matching emails" once the
                search settles. We render it OUTSIDE the EmailList so swapping
                between skeleton/empty/list does not blow away the live region.
              */}
              <SearchResultAnnouncer
                isSearching={aiSearch.isSearching}
                aiSearchActive={aiSearchActive}
                aiError={aiSearch.error}
                searchQuery={searchQuery}
                resultCount={filteredEmails.length}
              />
              {/* Pagination footer: shows Load more, loading, or end-of-inbox */}
              {(onLoadMore || hasMore || isLoadingMore || isAutoPaginating) && (
                <PaginationFooter
                  onLoadMore={onLoadMore}
                  hasMore={!!hasMore}
                  isLoadingMore={!!isLoadingMore}
                  isAutoPaginating={!!isAutoPaginating}
                  totalLoaded={filteredEmails.length}
                  scrollRoot={inboxScrollRef.current}
                />
              )}
            </div>
          </div>

          {/* ─── Right: Reading pane / Compose ─── */}
          <div className={cn(
            'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden',
            // No local fill — inherit the popup-shell-surface gradient from
            // the dialog so the email pane matches the Deal pop-up exactly.
            (currentThread || composeOpen) ? 'bg-transparent' : '',
            !currentThread && !composeOpen ? 'hidden md:flex' : 'flex'
          )}>
            {composeOpen ? (
              <InlineComposePanel
                onSend={handleComposeSend}
                onClose={() => { setComposeOpen(false); setComposeReplyTo(null); }}
                replyTo={composeReplyTo}
                dealId={dealId}
                signature={composerSignature}
              />
            ) : currentThread ? (
              <EmailDetail
                thread={currentThread}
                dealId={dealId}
                onBack={handleEmailDetailBack}
                isExpanded={readingPaneExpanded}
                onToggleExpand={handleEmailDetailToggleExpand}
                pendingAction={pendingDetailAction}
                onPendingActionConsumed={() => setPendingDetailAction(null)}
                deepLinkMessageId={
                  deepLinkTarget && deepLinkTarget.threadId === currentThread.threadId
                    ? deepLinkTarget.messageId
                    : null
                }
                deepLinkSignal={
                  deepLinkTarget && deepLinkTarget.threadId === currentThread.threadId
                    ? deepLinkTarget.signal
                    : null
                }
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
                onDelete={handleDeleteEmail}
                onArchive={handleArchiveEmail}
                onSendReply={async (emailData, threadId, linkContext) => {
                  if (!onGmailSend) {
                    setEmails(prev => [{ ...emailData, id: `mock-sent-${Date.now()}`, threadId }, ...prev]);
                    return;
                  }
                  queueSend({
                    payload: {
                      to: [emailData.to_email],
                      subject: emailData.subject,
                      body: emailData.body_preview,
                      meta: { threadId, emailData },
                    },
                    dedupeKey: `reply:${threadId}:${(emailData.body_preview || '').length}`,
                    performSend: (p) => onGmailSend({
                      to: p.to,
                      subject: p.subject,
                      body: p.body,
                      bodyHtml: emailData.body_html,
                      attachments: emailData._outgoing_files,
                      replyToMessageId: emailData._reply_to_message_id,
                      cc: emailData._cc,
                      bcc: emailData._bcc,
                    }),
                    onSent: () => {
                      setEmails(prev => [{ ...emailData, id: `mock-sent-${Date.now()}`, threadId }, ...prev]);
                      // ─── Activity log + lender last-contact + next-step prompt ───
                      // Resolve the linked deal id: an explicit per-thread link
                      // from the email pane wins (covers the global naitive
                      // Inbox where the page-level dealId is empty), then the
                      // page-level dealId. If still unlinked the user already
                      // chose "Send without logging" in the pre-send prompt —
                      // surface a soft confirmation rather than blocking.
                      const thread = currentThread;
                      const resolvedDealId = linkContext?.dealId || dealId || null;
                      const resolvedDealName =
                        linkContext?.dealName || thread?.dealName || null;

                      if (!resolvedDealId) {
                        toast.message('Reply sent. Link to a deal to log activity.', {
                          duration: 4000,
                          action: thread
                            ? {
                                label: 'Link Deal',
                                onClick: () => setSelectedThread(thread),
                              }
                            : undefined,
                        });
                        return;
                      }

                      // Fire-and-forget — never block the send pipeline on logging.
                      (async () => {
                        const logResult = await logSentReplyToDeal({
                          dealId: resolvedDealId,
                          threadId,
                          subject: emailData.subject,
                          body: emailData.body_preview || '',
                          toName: emailData.to_name || emailData.to_email,
                          toEmail: emailData.to_email,
                          fromDisplayName: emailData.from_name,
                          dealName: resolvedDealName,
                          cc: emailData._cc,
                          bcc: emailData._bcc,
                        });

                        const dealLabel = logResult.dealName || resolvedDealName || 'deal';
                        if (!logResult.ok) {
                          toast.error(`Reply sent, but couldn't log to ${dealLabel} activity`);
                          return;
                        }

                        // Success toast — show the matched lender if we bumped one.
                        const lenderSuffix = logResult.matchedLenderName
                          ? ` • ${logResult.matchedLenderName} last-contact updated`
                          : '';

                        const baseToast = `✓ Sent — ${dealLabel} Activity log updated.`;
                        const recipientLabel = emailData.to_name || emailData.to_email || 'recipient';
                        const sendDetail = `To ${recipientLabel} • "${emailData.subject || '(no subject)'}"`;

                        // If the reply commits to a next step, offer one-click
                        // follow-up task creation right from the toast.
                        if (logResult.nextStep.hasNextStep && user?.id) {
                          toast.success(baseToast, {
                            description: `${sendDetail}\n${lenderSuffix ? lenderSuffix.replace(/^ • /, '') + '. ' : ''}Next step detected: "${logResult.nextStep.trigger}". Create a follow-up task?`,
                            duration: 12000,
                            action: {
                              label: 'Create task',
                              onClick: async () => {
                                try {
                                  const draft: TaskDraft = {
                                    title: logResult.nextStep.suggestedTaskTitle || 'Follow up on email reply',
                                    description: `Auto-created from sent reply: "${emailData.subject}"\nDetected: ${logResult.nextStep.trigger}`,
                                    due_date: nextBusinessDayISO(),
                                    due_time: null,
                                    priority: 'normal',
                                    type: 'follow_up',
                                    is_recurring: false,
                                    recurrence_rule: null,
                                    confidence: 1,
                                    owner_id: user.id,
                                    owner_label: 'You',
                                    owner_ambiguous: null,
                                    deal_id: resolvedDealId,
                                    deal_label: dealLabel,
                                    lender_id: null,
                                    lender_label: null,
                                    contact_id: null,
                                    contact_label: null,
                                    source_thread_id: threadId,
                                    hints: { owner: null, deal: null, lender: null, contact: null },
                                  };
                                  await createTaskFromDraft(draft, user.id, company?.id || null, {
                                    syncSource: 'naitive_email_next_step',
                                    sourceThreadId: threadId,
                                  });
                                  toast.success('Follow-up task created');
                                } catch (err: any) {
                                  toast.error(err?.message || 'Failed to create follow-up task');
                                }
                              },
                            },
                          });
                        } else {
                          toast.success(baseToast, {
                            description: lenderSuffix
                              ? `${sendDetail}\n${lenderSuffix.replace(/^ • /, '')}`
                              : sendDetail,
                            duration: 4000,
                          });
                        }
                      })();
                    },
                    onUndo: () => {
                      // Re-open the thread + composer for editing.
                      const thread = allThreads.find(t => t.threadId === threadId);
                      if (thread) setSelectedThread(thread);
                      // Restore the draft into the same localStorage slot
                      // that useEmailDraft(threadId) reads from on mount.
                      try {
                        const restored = {
                          to: emailData.to_email,
                          cc: '',
                          bcc: '',
                          subject: emailData.subject,
                          body: emailData.body_preview || '',
                          attachments: [],
                          threadId,
                          toName: emailData.to_name || emailData.to_email,
                          savedAt: Date.now(),
                        };
                        localStorage.setItem(`email_draft_${threadId}`, JSON.stringify(restored));
                      } catch { /* quota etc. */ }
                    },
                  });
                }}
              />
            ) : (
              /* Minimalist Inbox Summary — empty selection state */
              <InboxSummaryPane
                emails={emails}
                classifierEntities={classifierEntities}
                orgCtx={orgCtx}
                onSelectCategory={setCategoryTab}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Minimalist empty-state summary ────────────────────────────────
interface InboxSummaryPaneProps {
  emails: MockEmail[];
  classifierEntities: any;
  orgCtx: any;
  onSelectCategory: (tab: EmailCategoryTab) => void;
}

function InboxSummaryPane({ emails, classifierEntities, orgCtx, onSelectCategory }: InboxSummaryPaneProps) {
  const summary = useMemo(() => {
    const inbox = emails.filter(e => e.folder === 'inbox');
    const unread = inbox.filter(e => !e.is_read);
    const counts = EMAIL_CATEGORY_TABS
      .filter(t => t.key !== 'all')
      .map(t => ({
        key: t.key,
        label: t.label,
        count: filterEmailsByCategory(unread, t.key, classifierEntities, orgCtx).length,
      }));
    return { totalUnread: unread.length, counts };
  }, [emails, classifierEntities, orgCtx]);

  const totalLabel = summary.totalUnread === 1 ? 'unread message' : 'unread messages';
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex-1 flex items-start justify-center overflow-auto">
      <div
        className="w-full max-w-[360px] px-10 pt-[14vh] pb-16"
        style={{ fontFeatureSettings: '"ss01", "cv11", "tnum"' }}
      >
        {/* Overline — date + context */}
        <div className="flex items-center gap-2.5 mb-14">
          <span className="h-px w-6 bg-foreground/20" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 font-medium">
            {dateLabel}
          </span>
        </div>

        {/* Hero metric */}
        <div className="mb-3">
          <div className="flex items-baseline gap-3">
            <span className="text-[88px] font-extralight text-foreground leading-[0.85] tabular-nums tracking-[-0.04em]">
              {summary.totalUnread}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 pb-2">
              {totalLabel}
            </span>
          </div>
        </div>

        {/* Soft accent rule */}
        <div className="h-px w-12 bg-foreground/15 mb-10 mt-8" />

        {/* Category breakdown — editorial metric list */}
        <div className="space-y-0">
          <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/50 font-medium mb-4">
            By category
          </p>
          {summary.counts.map((c, i) => {
            const isLast = i === summary.counts.length - 1;
            const muted = c.count === 0;
            return (
              <button
                key={c.key}
                onClick={() => onSelectCategory(c.key)}
                className={cn(
                  'w-full flex items-baseline justify-between py-3 text-left group transition-colors',
                  !isLast && 'border-b border-foreground/[0.06]'
                )}
              >
                <span className={cn(
                  'text-[13px] tracking-tight transition-colors',
                  muted
                    ? 'text-muted-foreground/40'
                    : 'text-foreground/85 group-hover:text-foreground'
                )}>
                  {c.label}
                </span>
                <span className={cn(
                  'text-[15px] font-light tabular-nums tracking-tight transition-colors',
                  muted
                    ? 'text-muted-foreground/30'
                    : 'text-foreground/90 group-hover:text-foreground'
                )}>
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Helper text */}
        <p className="mt-14 text-[11px] text-muted-foreground/45 tracking-tight">
          Select a message to begin reading.
        </p>
      </div>
    </div>
  );
}

// ─── Screen-reader announcer for search progress + results ──────────
// A polite live region that emits a single short message per state change
// so SR users hear what the search is doing without spamming on every
// keystroke. We intentionally:
//   • debounce by 300ms so rapid typing collapses into one announcement
//   • only announce a result count once the search has SETTLED (not while
//     `isSearching` is true) — the visible status banner already covers the
//     "Searching with AI…" beat.
function SearchResultAnnouncer({
  isSearching,
  aiSearchActive,
  aiError,
  searchQuery,
  resultCount,
}: {
  isSearching: boolean;
  aiSearchActive: boolean;
  aiError: string | null;
  searchQuery: string;
  resultCount: number;
}) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const trimmed = searchQuery.trim();
    let next = '';
    if (isSearching) {
      next = 'Searching emails…';
    } else if (aiError) {
      next = `AI search failed: ${aiError}. Showing keyword results.`;
    } else if (aiSearchActive) {
      next =
        resultCount === 0
          ? `No matching emails for ${trimmed || 'your search'}.`
          : `${resultCount} ${resultCount === 1 ? 'result' : 'results'} for ${trimmed || 'your search'}.`;
    } else if (trimmed) {
      next =
        resultCount === 0
          ? `No matching emails for ${trimmed}.`
          : `${resultCount} ${resultCount === 1 ? 'result' : 'results'} for ${trimmed}.`;
    } else {
      // Cleared search — stay silent.
      next = '';
    }

    const t = window.setTimeout(() => setMessage(next), 300);
    return () => window.clearTimeout(t);
  }, [isSearching, aiSearchActive, aiError, searchQuery, resultCount]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
