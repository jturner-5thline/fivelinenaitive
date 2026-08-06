import { useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { useNavigate } from 'react-router-dom';
import { DealEmailsTab } from '@/components/deal/DealEmailsTab';
import { MockEmail } from '@/components/deal/email/mockEmailData';
import { EmailPaneErrorBoundary } from '@/components/deal/email/EmailListAndDetail';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCarouselSwipeClass } from '@/hooks/useCarouselSwipeClass';
import { cn } from '@/lib/utils';
import { useInboxCacheStore } from '@/stores/inboxCacheStore';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { startMailTimer } from '@/lib/perfDiagnostics';

function InboxRefreshStatus({
  isRefreshing,
  lastRefreshAt,
  error,
  onRetry,
}: {
  isRefreshing: boolean;
  lastRefreshAt: number | null;
  error: boolean;
  onRetry: () => void;
}) {
  const [, force] = useState(0);
  // Tick once per 30s so the relative timestamp stays fresh while open.
  // Visibility-aware so a backgrounded tab doesn't keep re-rendering.
  useVisibilityAwareInterval(() => force((n) => n + 1), 30_000);
  if (error) {
    return (
      <div className="px-4 py-1 text-[11px] text-destructive flex items-center gap-2">
        Couldn't refresh —
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-2 hover:text-destructive/80"
        >
          retry
        </button>
      </div>
    );
  }
  let label = '';
  if (isRefreshing) label = 'Refreshing…';
  else if (lastRefreshAt) {
    const secs = Math.max(0, Math.round((Date.now() - lastRefreshAt) / 1000));
    if (secs < 10) label = 'Updated just now';
    else if (secs < 60) label = `Updated ${secs}s ago`;
    else label = `Updated ${Math.round(secs / 60)}m ago`;
  }
  if (!label) return null;
  return (
    <div className="px-4 py-1 text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
      {isRefreshing && <RefreshCw className="h-3 w-3 animate-spin" />}
      <span>{label}</span>
    </div>
  );
}

interface InboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// How many messages to request per page from Nylas/Gmail.
// Bumped to 100 so the first paint of the inbox already has a deep working
// set and "Load more" is needed far less often during normal scrolling.
const PAGE_SIZE = 100;
// Safety cap: hard maximum number of inbox messages we will ever auto-load in
// one session. Prevents accidentally fetching tens of thousands of messages
// from a very large mailbox. Users can keep clicking "Load more" past this
// only by keeping the dialog open and clicking again — auto-load stops here.
const AUTO_LOAD_CAP = 1000;
// Delay between auto-pagination requests so we don't hammer the provider
// or trip Nylas' rate limiter.
const AUTO_LOAD_DELAY_MS = 350;

function getStateFreshness(value: any): number {
  const raw = value?.state_fetched_at || value?.received_at || null;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function shouldApplyProviderState(current: any, incoming: any): boolean {
  return getStateFreshness(incoming) >= getStateFreshness(current);
}

function getMessageKey(value: any): string {
  return String(value?.gmail_message_id || value?.message_id || value?.id || '');
}

function normalizeReadState(message: any): any {
  const labels = Array.isArray(message?.labels) ? message.labels : [];
  const normalizedLabels = labels.map((label: any) => String(
    label?.id ?? label?.name ?? label?.display_name ?? label?.label ?? label,
  ).toUpperCase());
  const hasUnreadLabel = normalizedLabels.includes('UNREAD');
  if (hasUnreadLabel) return message?.is_read === false ? message : { ...message, is_read: false };
  if (labels.length > 0 && message?.is_read !== true) return { ...message, is_read: true };
  return message;
}

// Map Gmail messages to MockEmail format for DealEmailsTab compatibility.
// Defensive: per-message try/catch + drop messages without an id so a single
// malformed payload can't crash the inbox list mid-render.
function mapGmailToMockEmails(
  gmailMessages: any[],
  folderOverride: 'inbox' | 'sent' | 'drafts' | 'junk' | 'trash' = 'inbox',
): MockEmail[] {
  if (!Array.isArray(gmailMessages)) return [];
  const out: MockEmail[] = [];
  for (const msg of gmailMessages) {
    try {
      if (!msg || typeof msg !== 'object') continue;
      const normalized = normalizeReadState(msg);
      const id = getMessageKey(normalized);
      if (!id) continue; // can't render a row without a stable id
      out.push({
        id,
        threadId: normalized.thread_id || id,
        // Canonical provider thread id — never falls back to a message id,
        // so label assignments persisted against this key remain stable.
        provider_thread_id: normalized.thread_id || null,
        subject: normalized.subject || '(No subject)',
        from_name: normalized.from_name || normalized.from_email || 'Unknown',
        from_email: normalized.from_email || '',
        to_name: (normalized.to_names || normalized.to_emails || [])[0] || 'You',
        to_email: (normalized.to_emails || [])[0] || '',
        snippet: normalized.snippet || '',
        body_preview: normalized.body_text || normalized.body_html || normalized.snippet || '',
        body_html: normalized.body_html || undefined,
        body_text: normalized.body_text || undefined,
        body_loaded: !!(normalized.body_html || normalized.body_text),
        received_at: normalized.received_at || new Date().toISOString(),
        is_read: normalized.is_read ?? true,
        is_starred: normalized.is_starred ?? false,
        folder: folderOverride,
        labels: Array.isArray(normalized.labels) ? normalized.labels : [],
        has_attachments: !!normalized.has_attachments,
        attachments: Array.isArray(normalized.attachments) ? normalized.attachments : undefined,
        is_linked_to_deal: false,
        is_follow_up: false,
        needs_response: folderOverride === 'inbox' ? !normalized.is_read : false,
        category: 'deal' as const,
        provider: normalized.provider || 'gmail',
      });
    } catch (err) {
      console.error('[InboxDialog] failed to map gmail message', {
        err,
        msgId: msg?.id || msg?.gmail_message_id,
      });
    }
  }
  return out;
}

// Direct paginated fetch against the gmail-messages edge function. Returns
// the messages and next_page_token without mutating any global state.
async function fetchPage(args: {
  labelIds: string[];
  pageToken?: string | null;
  maxResults?: number;
  forceRefresh?: boolean;
}): Promise<{
  messages: any[];
  nextPageToken: string | null;
  rateLimited: boolean;
  reauthRequired?: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const { labelIds, pageToken, maxResults = PAGE_SIZE, forceRefresh = false } = args;
  try {
    const { data, error } = await supabase.functions.invoke('gmail-messages', {
      body: {
        action: 'list',
        max_results: maxResults,
        label_ids: labelIds,
        page_token: pageToken || undefined,
        // When the caller is a user-initiated refresh, ask the edge
        // function to bypass any HTTP/intermediary cache by appending a
        // cachebuster to the upstream Nylas URL. The provider itself is
        // already authoritative, but this guarantees no CDN/proxy layer
        // returns a previously-cached response on rapid retries.
        force_refresh: forceRefresh || undefined,
        // Cache-bust this very invoke so the browser / SW never serves
        // a memoized response for the manual refresh call itself.
        _cb: forceRefresh ? Date.now() : undefined,
      },
    });
    if (error) {
      // Defensive: supabase.functions.invoke throws/returns an `error`
      // on non-2xx. The edge function now soft-returns 200 for 4xx/5xx,
      // so this branch should only fire on transport failures. Treat as
      // a soft error — never let it bubble to the error boundary.
      console.warn('[InboxDialog] gmail-messages transport error', error);
      return {
        messages: [],
        nextPageToken: null,
        rateLimited: false,
        errorCode: 'transport_error',
        errorMessage: (error as any)?.message || 'Network error',
      };
    }
    if (data?.fallback) {
      return {
        messages: [],
        nextPageToken: null,
        rateLimited: data?.error_code !== 'reauth_required',
        reauthRequired: data?.action === 'reauth_required' || data?.error_code === 'reauth_required',
        errorCode: data?.error_code,
        errorMessage: data?.error,
      };
    }
    return {
      messages: (data?.messages || []).map(normalizeReadState),
      nextPageToken: data?.next_page_token || null,
      rateLimited: false,
    };
  } catch (e: any) {
    console.warn('[InboxDialog] gmail-messages threw', e);
    return {
      messages: [],
      nextPageToken: null,
      rateLimited: false,
      errorCode: 'threw',
      errorMessage: e?.message || 'Unknown error',
    };
  }
}

async function applyAuthoritativeReadState(
  messages: any[],
  limit = PAGE_SIZE,
  enabled = true,
): Promise<any[]> {
  const normalizedMessages = messages.map(normalizeReadState);
  // Microsoft/Outlook mailboxes are served from the synced `emails` table
  // and the `sync_state` action is not supported upstream — calling it
  // just burns a round-trip and returns a 400 on every refresh.
  if (!enabled) return normalizedMessages;
  const ids = normalizedMessages.slice(0, limit).map(getMessageKey).filter(Boolean);
  if (!ids.length) return normalizedMessages;
  try {
    const { data, error } = await supabase.functions.invoke('gmail-messages', {
      body: { action: 'sync_state', message_ids: ids },
    });
    const states = !error && Array.isArray(data?.states) ? data.states : [];
    if (!states.length) return normalizedMessages;
    useInboxCacheStore.getState().applyStateDeltas(states);
    const stateMap = new Map(states.map((s: any) => [getMessageKey(s), s]));
    let changed = false;
    const next = normalizedMessages
      .filter((m) => {
        const s: any = stateMap.get(getMessageKey(m));
        if (s?.missing) { changed = true; return false; }
        return true;
      })
      .map((m) => {
        const s: any = stateMap.get(getMessageKey(m));
        if (!s || !shouldApplyProviderState(m, s)) return m;
        if (m.is_read === s.is_read && m.is_starred === s.is_starred) return m;
        changed = true;
        return { ...m, is_read: s.is_read, is_starred: s.is_starred, labels: s.folders ?? m.labels, state_fetched_at: s.state_fetched_at ?? m.state_fetched_at };
      });
    return changed ? next : normalizedMessages;
  } catch {
    return normalizedMessages;
  }
}

function InboxDialogImpl({ open, onOpenChange }: InboxDialogProps) {
  const { status, sendEmail } = useGmail();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Microsoft/Outlook mailboxes are served straight from the synced
  // `emails` table (no Nylas). Several Gmail-only round-trips
  // (`sync_state`, SENT / DRAFT / SPAM / TRASH folders, the `email_cache`
  // fallback) are no-ops for them and were the main reason the popup felt
  // slow and kept showing "Still fetching latest emails…". We branch on
  // the provider and skip the dead work.
  const isMicrosoft = status.provider === 'microsoft';
  const isMicrosoftRef = useRef(false);
  isMicrosoftRef.current = isMicrosoft;

  // Perf: close the [InboxOpen] timer started on the dashboard tile click
  // exactly once after the dialog mounts with `open === true`. This lets
  // us measure click → first paint in the console / User Timing track.
  const perfLoggedRef = useRef(false);
  const popupOpenTimerRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    if (!open || perfLoggedRef.current) return;
    perfLoggedRef.current = true;
    // Mail perf: click → first paint of the popup shell.
    if (!popupOpenTimerRef.current) popupOpenTimerRef.current = startMailTimer('popupOpen');
    // Wait one frame so we measure post-commit (first paint), not mount.
    requestAnimationFrame(() => {
      try {
        // eslint-disable-next-line no-console
        console.timeEnd('[InboxOpen] click → first paint');
        if (typeof performance !== 'undefined' && performance.getEntriesByName('inbox:open-click').length) {
          performance.measure('inbox:open → first paint', 'inbox:open-click');
        }
      } catch {
        // Timer may not have been started (e.g. modal opened via deep link).
      }
      // Record into mail perf bucket exposed by the Observability panel.
      popupOpenTimerRef.current?.();
      popupOpenTimerRef.current = null;
    });
  }, [open]);

  useEffect(() => {
    if (!open) perfLoggedRef.current = false;
  }, [open]);

  // Inbox + sent message stores (raw Gmail/Nylas shape, deduped by id).
  // Seeded synchronously from the shared `inboxCacheStore` that the
  // Dashboard pre-warms on mount + polls every 2 minutes — so the dialog
  // is never blank on open. Pagination still flows through local state
  // and is mirrored back into the cache store so the unread badge and
  // next open both see the latest data.
  const cacheSnapshot = useInboxCacheStore.getState();
  const [inboxMessages, setInboxMessages] = useState<any[]>(() => cacheSnapshot.inboxMessages);
  const [sentMessages, setSentMessages] = useState<any[]>(() => cacheSnapshot.sentMessages);
  const [cachedInboxEmails, setCachedInboxEmails] = useState<any[]>([]);
  // Provider-backed system folders beyond inbox/sent. We fetch the first
  // page of each on open so the sidebar tabs (Drafts / Junk / Trash) are
  // wired to the actual mailbox state instead of an empty local bucket.
  const [draftsMessages, setDraftsMessages] = useState<any[]>([]);
  const [junkMessages, setJunkMessages] = useState<any[]>([]);
  const [trashMessages, setTrashMessages] = useState<any[]>([]);

  // Pagination cursors — also seeded from the cache so "Load more" picks
  // up where the prefetch left off.
  const [inboxNextToken, setInboxNextToken] = useState<string | null>(cacheSnapshot.inboxNextToken);
  const [sentNextToken, setSentNextToken] = useState<string | null>(cacheSnapshot.sentNextToken);
  // Seed hasMore* from the cached cursor so a warm open with a fully
  // drained upstream cursor doesn't show a stuck "Load more" that calls
  // loadMore with a null pageToken and no-ops forever. Cold open has no
  // cached token, but the first foreground fetch in the open-effect sets
  // these accurately before the list ever needs the value.
  const [hasMoreInbox, setHasMoreInbox] = useState<boolean>(
    cacheSnapshot.inboxMessages.length === 0 ? true : !!cacheSnapshot.inboxNextToken,
  );
  const [hasMoreSent, setHasMoreSent] = useState<boolean>(
    cacheSnapshot.sentMessages.length === 0 ? true : !!cacheSnapshot.sentNextToken,
  );
  // Tracks whether the local `email_cache` cursor fallback still has
  // older rows. Starts optimistic; flips false the first time a cursor
  // query returns 0 rows so the "End of inbox" sentinel can render.
  const [hasMoreCache, setHasMoreCache] = useState(true);

  // Warm-mount: once the dialog component is alive, schedule an idle pass
  // that pre-renders the (closed) DialogContent + DealEmailsTab subtree.
  // The Radix portal mounts in the background, virtualizers warm up, and
  // hooks settle BEFORE the user clicks the mail icon. When they do click,
  // open flips true and the existing nodes simply become visible — no
  // multi-hundred-millisecond mount on the click frame.
  const [warmMounted, setWarmMounted] = useState(false);
  useEffect(() => {
    if (warmMounted) return;
    const w = typeof window !== 'undefined' ? (window as any) : null;
    // Always bind the prewarm listener so a `inbox:prewarm` dispatched
    // before the gmail status finishes loading still flips the heavy
    // subtree into the DOM. The idle warm-up only kicks in once the
    // mailbox is actually connected.
    const onPrewarm = () => setWarmMounted(true);
    if (typeof window !== 'undefined') window.addEventListener('inbox:prewarm', onPrewarm);
    if (!status.connected) {
      return () => {
        if (typeof window !== 'undefined') window.removeEventListener('inbox:prewarm', onPrewarm);
      };
    }
    const schedule = w?.requestIdleCallback
      ? (cb: () => void) => w.requestIdleCallback(cb, { timeout: 2000 })
      : (cb: () => void) => setTimeout(cb, 800);
    const cancel = w?.cancelIdleCallback
      ? (h: any) => w.cancelIdleCallback(h)
      : (h: any) => clearTimeout(h);
    const handle = schedule(() => setWarmMounted(true));
    return () => {
      cancel(handle);
      if (typeof window !== 'undefined') window.removeEventListener('inbox:prewarm', onPrewarm);
    };
  }, [warmMounted, status.connected]);

  // Loading flags
  // Only show the initial spinner when we have nothing cached to render.
  // Otherwise the open is instant and the refresh happens silently below.
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Mirror of `isPaginatingRef` exposed as React state so the
  // PaginationFooter (and its IntersectionObserver) actually re-render
  // when auto-pagination starts/stops. A bare ref never triggers a
  // re-render, which kept the "Loading older messages…" copy and the
  // sentinel out of sync with the real fetch state.
  const [isAutoPaginating, setIsAutoPaginating] = useState(false);

  // Lifecycle refs to prevent overlapping fetches & stale state writes after close
  // Pre-seeded as `true` when cache already has data so the open-effect
  // skips the foreground fetch and only kicks the silent background refresh.
  const hasLoadedRef = useRef(cacheSnapshot.hasInitial && cacheSnapshot.inboxMessages.length > 0);
  const isMountedRef = useRef(true);
  const isPaginatingRef = useRef(false);

  // Live-subscribe to the shared inbox cache so that if the global
  // 5-min prefetch hydrates AFTER this dialog mounted (cold open before
  // the first prefetch finished), the list fills in immediately instead
  // of waiting for the dialog's own foreground fetch.
  useEffect(() => {
    const unsub = useInboxCacheStore.subscribe((state, prev) => {
      if (!isMountedRef.current) return;
      if (state.inboxMessages !== prev.inboxMessages && state.inboxMessages.length) {
        setInboxMessages((local) => {
          if (local === state.inboxMessages) return local;
          // If local is empty, adopt the cache wholesale; otherwise merge.
          return local.length === 0 ? state.inboxMessages : mergeUniqueById(local, state.inboxMessages);
        });
        if (state.inboxNextToken && !inboxNextToken) {
          setInboxNextToken(state.inboxNextToken);
          setHasMoreInbox(true);
        }
        // Cache filled — treat as already-seeded so the open-effect
        // skips its spinner-bound foreground fetch.
        hasLoadedRef.current = true;
        setIsInitialLoading(false);
      }
      if (state.sentMessages !== prev.sentMessages && state.sentMessages.length) {
        setSentMessages((local) =>
          local.length === 0 ? state.sentMessages : mergeUniqueById(local, state.sentMessages),
        );
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to dedupe by id.
  //
  // Bug fix (Niki): when a message already existed in `existing`, fresh
  // fields from `incoming` (notably `is_read`, `is_starred`, `labels`)
  // were dropped — so an email read directly in Gmail still rendered as
  // unread in Naitive until the cache was reset. We now overlay the
  // mutable provider-side state from the incoming row onto the cached
  // row, while keeping any locally enriched fields the UI added.
  const mergeUniqueById = useCallback((existing: any[], incoming: any[]) => {
    const incomingById = new Map<string, any>();
    for (const raw of incoming) {
      const m = normalizeReadState(raw);
      const key = getMessageKey(m);
      if (key) incomingById.set(key, m);
    }
    const seen = new Set<string>();
    const merged = existing.map((m) => {
      const key = getMessageKey(m);
      if (!key) return m;
      seen.add(key);
      const fresh = incomingById.get(key);
      if (!fresh) return m;
      if (!shouldApplyProviderState(m, fresh)) return m;
      // Only patch fields that genuinely change to keep referential
      // equality stable for the virtualized list when nothing moved.
      const nextIsRead = fresh.is_read ?? m.is_read;
      const nextIsStarred = fresh.is_starred ?? m.is_starred;
      const nextLabels = Array.isArray(fresh.labels) ? fresh.labels : m.labels;
      if (
        nextIsRead === m.is_read &&
        nextIsStarred === m.is_starred &&
        nextLabels === m.labels
      ) {
        return m;
      }
      return {
        ...m,
        is_read: nextIsRead,
        is_starred: nextIsStarred,
        labels: nextLabels,
        state_fetched_at: fresh.state_fetched_at ?? m.state_fetched_at,
      };
    });
    const additions: any[] = [];
    for (const raw of incoming) {
      const m = normalizeReadState(raw);
      const key = getMessageKey(m);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      additions.push(m);
    }
    return additions.length ? [...merged, ...additions] : merged;
  }, []);

  // ─── Cursor-based pagination ──────────────────────────────────────
  // Upstream (Gmail/Nylas) is already cursor-based via opaque
  // `page_token`s. The edge case the inbox needs to defend against is
  // *new mail arriving while the user is paginating*: relying on offsets
  // or "load more from position N" would skip or duplicate rows because
  // the top of the inbox shifts. Opaque tokens handle this for us, but
  // the local cache fallback (`email_cache`) was previously offset-based
  // (`.limit(200)` with no anchor) which had the exact problem.
  //
  // We now keep a derived `oldestReceivedAt` cursor — the timestamp of
  // the oldest currently-loaded message — and use it as a stable anchor
  // for the cache-backed "load older" path. Combined with the upstream
  // page_token, every page request is anchored to a fixed point in time
  // and is immune to inserts at the top.
  const oldestReceivedAt = useMemo(() => {
    if (inboxMessages.length === 0) return null;
    let oldest: string | null = null;
    for (const m of inboxMessages) {
      const t = m.received_at as string | undefined;
      if (!t) continue;
      if (!oldest || t < oldest) oldest = t;
    }
    return oldest;
  }, [inboxMessages]);

  // Load older rows from the local DB cache using a `received_at` cursor
  // instead of offset/limit. Used both as the cold-open fallback (no
  // cursor → newest 200) and as the secondary "load older" path when the
  // upstream Gmail token is exhausted or rate-limited.
  const loadOlderFromCache = useCallback(async (
    beforeReceivedAt: string | null,
    limit = 200,
  ) => {
    if (!user) return [] as any[];
    let q = supabase
      .from('email_cache')
      .select('*')
      .eq('user_id', user.id)
      .order('received_at', { ascending: false })
      .limit(limit);
    if (beforeReceivedAt) q = q.lt('received_at', beforeReceivedAt);
    const { data: cached } = await q;
    return cached || [];
  }, [user]);

  // Cold-open fallback: hydrate the newest cached rows.
  const hydrateFromCache = useCallback(async () => {
    // `email_cache` only ever holds Gmail/Nylas rows — skip for Outlook.
    if (isMicrosoftRef.current) return;
    const cached = await loadOlderFromCache(null, 200);
    if (cached.length && isMountedRef.current) {
      const authoritative = await applyAuthoritativeReadState(cached, PAGE_SIZE, !isMicrosoftRef.current);
      setCachedInboxEmails(authoritative);
      setInboxMessages((prev) => {
        if (prev.length) return prev;
        useInboxCacheStore.setState({ inboxMessages: authoritative });
        return authoritative;
      });
    }
  }, [loadOlderFromCache]);

  // Auto-paginate the inbox (and then the sent folder) until exhausted or until
  // the safety cap is hit. Sequential to avoid Nylas rate limits.
  const autoPaginate = useCallback(async (
    initialInboxToken: string | null,
  ) => {
    if (isPaginatingRef.current) return;
    isPaginatingRef.current = true;
    setIsAutoPaginating(true);
    try {
      // 1. Drain inbox
      let token: string | null = initialInboxToken;
      let totalLoaded = 0;
      const ms = isMicrosoftRef.current;
      // DB-backed Outlook pages don't hit a provider rate limiter, so no
      // inter-page delay is needed; and a smaller cap keeps the popup from
      // grinding through 1,000 rows the user never scrolls to.
      const pageDelay = ms ? 0 : AUTO_LOAD_DELAY_MS;
      const loadCap = ms ? 300 : AUTO_LOAD_CAP;
      // current count is captured at call time; we re-check below
      while (token && totalLoaded < loadCap && isMountedRef.current) {
        if (pageDelay) await new Promise(r => setTimeout(r, pageDelay));
        if (!isMountedRef.current) break;
        const page = await fetchPage({ labelIds: ['INBOX'], pageToken: token });
        if (!isMountedRef.current) break;
        if (page.rateLimited) {
          // Stop auto-loading on rate limit; user can click Load more later.
          break;
        }
        if (page.messages.length === 0 && !page.nextPageToken) break;
        setInboxMessages(prev => {
          const next = mergeUniqueById(prev, page.messages);
          useInboxCacheStore.setState({ inboxMessages: next });
          return next;
        });
        token = page.nextPageToken;
        setInboxNextToken(token);
        useInboxCacheStore.setState({ inboxNextToken: token });
        setHasMoreInbox(!!token);
        totalLoaded += page.messages.length;
      }

      // 2. Drain sent (smaller, but still paginate) — only after inbox is done
      let sentToken: string | null = null;
      let sentLoaded = 0;
      // Outlook sync doesn't populate a SENT folder — every page is an
      // empty round-trip.
      if (ms) return;
      // First sent page
      if (isMountedRef.current) {
        await new Promise(r => setTimeout(r, AUTO_LOAD_DELAY_MS));
        const firstSent = await fetchPage({ labelIds: ['SENT'] });
        if (isMountedRef.current && !firstSent.rateLimited) {
          setSentMessages(prev => {
            const next = mergeUniqueById(prev, firstSent.messages);
            useInboxCacheStore.setState({ sentMessages: next });
            return next;
          });
          sentToken = firstSent.nextPageToken;
          setSentNextToken(sentToken);
          useInboxCacheStore.setState({ sentNextToken: sentToken });
          setHasMoreSent(!!sentToken);
          sentLoaded = firstSent.messages.length;
        }
      }
      while (sentToken && sentLoaded < AUTO_LOAD_CAP && isMountedRef.current) {
        await new Promise(r => setTimeout(r, AUTO_LOAD_DELAY_MS));
        if (!isMountedRef.current) break;
        const page = await fetchPage({ labelIds: ['SENT'], pageToken: sentToken });
        if (!isMountedRef.current) break;
        if (page.rateLimited) break;
        if (page.messages.length === 0 && !page.nextPageToken) break;
        setSentMessages(prev => {
          const next = mergeUniqueById(prev, page.messages);
          useInboxCacheStore.setState({ sentMessages: next });
          return next;
        });
        sentToken = page.nextPageToken;
        setSentNextToken(sentToken);
        useInboxCacheStore.setState({ sentNextToken: sentToken });
        setHasMoreSent(!!sentToken);
        sentLoaded += page.messages.length;
      }
    } finally {
      isPaginatingRef.current = false;
      if (isMountedRef.current) setIsAutoPaginating(false);
    }
  }, [mergeUniqueById]);

  // Open effect.
  // Two paths:
  //  • Cold open (cache empty): show the initial spinner, fetch page 1 of
  //    inbox foreground, then kick off the background auto-pagination.
  //  • Warm open (cache populated): NEVER show a spinner. Render whatever
  //    the prefetch put in the store, silently re-fetch page 1 of inbox
  //    + sent in the background, merge anything newer in place, and only
  //    auto-paginate if we haven't yet drained the tail.
  useEffect(() => {
    if (!open || !status.connected) return;
    isMountedRef.current = true;
    if (hasLoadedRef.current) return; // already seeded from cache
    hasLoadedRef.current = true;

    const cacheHasData = inboxMessages.length > 0;

    (async () => {
      if (!cacheHasData) setIsInitialLoading(true);
      const firstInbox = await fetchPage({ labelIds: ['INBOX'] });
      if (!isMountedRef.current) return;

      const firstInboxMessages = firstInbox.messages;
      if (firstInboxMessages.length === 0 && !firstInbox.nextPageToken) {
        // Empty / rate-limited — try DB cache only on cold open.
        if (!cacheHasData) await hydrateFromCache();
      } else {
        // Paint the freshly-fetched list IMMEDIATELY — don't await
        // sync_state. The authoritative read/starred reconcile runs in
        // the background a moment later via `applyAuthoritativeReadState`
        // and patches deltas in-place without blocking first paint.
        setInboxMessages((prev) => {
          const next = mergeUniqueById(prev, firstInboxMessages);
          // Mirror into the shared cache so the unread badge & next open
          // see the freshest data even after this dialog unmounts.
          useInboxCacheStore.setState({ inboxMessages: next });
          return next;
        });
        setInboxNextToken(firstInbox.nextPageToken);
        setHasMoreInbox(!!firstInbox.nextPageToken);

        // Background reconcile — fire-and-forget so the UI is never
        // blocked waiting on per-message metadata.
        void applyAuthoritativeReadState(firstInboxMessages).then((reconciled) => {
          if (!isMountedRef.current) return;
          if (reconciled === firstInboxMessages) return;
          setInboxMessages((prev) => {
            const next = mergeUniqueById(prev, reconciled);
            useInboxCacheStore.setState({ inboxMessages: next });
            return next;
          });
        }).catch(() => { /* best-effort */ });
      }
      if (!cacheHasData) setIsInitialLoading(false);

      // Kick off background auto-pagination (inbox tail + full sent).
      autoPaginate(firstInbox.nextPageToken);
    })();
    // `inboxMessages.length` intentionally omitted — `hasLoadedRef` guards
    // re-entry, and including it would re-evaluate this effect on every
    // page append during auto-pagination (wasted work, no behavior change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status.connected, hydrateFromCache, mergeUniqueById, autoPaginate]);

  // ─── Auto-refresh on reopen / focus / interval ───────────────────
  // Bug fix (Niki, Asana #1215178140447221): the popup only auto-refreshed
  // on first open. Subsequent opens required a manual refresh click.
  // Now we silently re-fetch page 1 of inbox + sent on every open
  // transition false→true, on tab focus / visibility change, and every
  // 60s while open — debounced to at most once per 10s so we don't
  // hammer the provider. Scroll position and the currently-open thread
  // are preserved because we merge in-place rather than reset state.
  const lastSilentRefreshRef = useRef(0);
  const SILENT_REFRESH_MIN_GAP_MS = 10_000;
  // Hard floor for *manual* refresh clicks. Even when the user mashes
  // the refresh button (or `force=true` is passed), we never hit the
  // provider more often than this. Without it, rapid clicks pile up
  // requests against Nylas/Gmail and trip rate limits — which is what
  // surfaced the "sync issue" banner Niki reported.
  const MANUAL_REFRESH_MIN_GAP_MS = 3_000;
  const lastManualRefreshRef = useRef(0);
  // Visible-tab cadence: 30s so newly-arrived mail surfaces quickly without
  // hammering the Gmail quota. When the tab is hidden we back off to 120s
  // (we still resume immediately on visibilitychange → visible below) so
  // background tabs aren't burning quota the user can't see.
  const SILENT_REFRESH_INTERVAL_VISIBLE_MS = 30_000;
  const SILENT_REFRESH_INTERVAL_HIDDEN_MS = 120_000;
  // Tracks the in-flight refresh so we can render a top loading bar
  // without blanking the cached list. Separate from `isInitialLoading`
  // (cold-open spinner) so warm opens stay instant.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const refreshInFlightRef = useRef(false);

  // Core refresh routine. `force=true` bypasses the 10s debounce gap so
  // every popup open transition triggers a fresh fetch even if the user
  // toggles rapidly. The in-flight ref still prevents truly concurrent
  // fetches (e.g. open + focus firing in the same tick).
  const runRefresh = useCallback(async (opts: { force?: boolean; manual?: boolean } = {}) => {
    if (!status.connected) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (!opts.force && now - lastSilentRefreshRef.current < SILENT_REFRESH_MIN_GAP_MS) return;
    // Manual-click throttle: applies even when force=true.
    if (opts.manual && now - lastManualRefreshRef.current < MANUAL_REFRESH_MIN_GAP_MS) return;
    refreshInFlightRef.current = true;
    lastSilentRefreshRef.current = now;
    if (opts.manual) lastManualRefreshRef.current = now;
    // Only manual refreshes show chrome/spinners. Silent background refreshes
    // should never make the already-open email popup look like it's still loading.
    setIsRefreshing(!!opts.manual);
    // Soft 5s timeout: if the refresh hasn't returned in 5s, surface a
    // non-blocking toast so the user knows we're still working on it
    // instead of staring at a silently-spinning button.
    let slowToastId: string | number | undefined;
    if (opts.manual) {
      slowToastId = setTimeout(() => {
        slowToastId = toast.loading('Still fetching latest emails…', {
          duration: 8000,
        });
      }, 5000) as unknown as number;
    }
    try {
      const [inbox, sent] = await Promise.all([
        fetchPage({ labelIds: ['INBOX'], forceRefresh: !!opts.manual }),
        fetchPage({ labelIds: ['SENT'], forceRefresh: !!opts.manual }),
      ]);
      if (!isMountedRef.current) return;
      // Reauth required from upstream — surface a CTA to /integrations
      // instead of silently swallowing the empty fetch.
      if (inbox.reauthRequired || sent.reauthRequired) {
        setRefreshError(true);
        if (opts.manual) {
          toast.error('Reconnect Gmail to refresh', {
            description: inbox.errorMessage || sent.errorMessage || 'Your mailbox session expired.',
            action: {
              label: 'Reconnect',
              onClick: () => { onOpenChange(false); navigate('/integrations'); },
            },
          });
        }
        return;
      }
      // Other soft errors (rate-limit / transport / malformed) are
      // almost always transient — the next polling tick or the user's
      // next click will succeed. Don't flip the visible "Couldn't
      // refresh" banner on for these; just leave the cached list in
      // place and keep `lastRefreshAt` from the previous success so
      // the indicator continues to show "Updated Xs ago" instead of a
      // scary destructive bar.
      if (inbox.errorCode || sent.errorCode) {
        console.warn('[InboxDialog] soft refresh error', {
          inbox: inbox.errorCode,
          sent: sent.errorCode,
        });
        return;
      }
      const inboxMessagesAuthoritative = await applyAuthoritativeReadState(inbox.messages);
      if (!isMountedRef.current) return;
      // Prepend new messages above the cached list; mergeUniqueById
      // preserves the already-loaded tail so scroll position and the
      // currently-open thread stay put.
      setInboxMessages((prev) => {
        const next = mergeUniqueById(inboxMessagesAuthoritative, prev);
        useInboxCacheStore.setState({ inboxMessages: next });
        return next;
      });
      setSentMessages((prev) => {
        const next = mergeUniqueById(sent.messages, prev);
        useInboxCacheStore.setState({ sentMessages: next });
        return next;
      });
      setRefreshError(false);
      setLastRefreshAt(Date.now());
      if (opts.manual) {
        const newCount = inboxMessagesAuthoritative.filter(
          (m: any) => !inboxMessages.some((p) => getMessageKey(p) === getMessageKey(m))
        ).length;
        if (newCount > 0) {
          toast.success(`${newCount} new ${newCount === 1 ? 'email' : 'emails'}`);
        }
      }
    } catch (e) {
      // Network blip or aborted invoke — keep the cached list visible
      // and stay quiet. The next interval / focus event will retry.
      console.warn('[InboxDialog] refresh threw — staying silent', e);
    } finally {
      if (slowToastId !== undefined) {
        // If it was still a timeout handle, cancel it. If it was a toast
        // id (number/string), dismiss it.
        try { clearTimeout(slowToastId as number); } catch { /* noop */ }
        try { toast.dismiss(slowToastId); } catch { /* noop */ }
      }
      refreshInFlightRef.current = false;
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [status.connected, mergeUniqueById, inboxMessages]);

  const silentRefresh = useCallback(() => runRefresh({ force: false }), [runRefresh]);
  const forceRefresh = useCallback(() => runRefresh({ force: true }), [runRefresh]);

  // Fire a forced refresh on every open transition false→true, independent
  // of cache state or the silent-refresh debounce. This is the contract:
  // popup opens => fresh fetch, every single time.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;
    if (!status.connected) return;
    void forceRefresh();
  }, [open, status.connected, forceRefresh]);

  useEffect(() => {
    if (!open || !status.connected) return;
    const onFocus = () => { void silentRefresh(); };
    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval) clearInterval(interval);
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const ms = hidden ? SILENT_REFRESH_INTERVAL_HIDDEN_MS : SILENT_REFRESH_INTERVAL_VISIBLE_MS;
      interval = setInterval(() => { void silentRefresh(); }, ms);
    };
    const onVisible = () => {
      // Immediately refresh on tab-return so newly-arrived mail surfaces
      // without waiting for the next interval tick. Then re-arm the
      // interval at the visible cadence (or back off when hidden).
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void silentRefresh();
      }
      startInterval();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    startInterval();
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      if (interval) clearInterval(interval);
    };
  }, [open, status.connected, silentRefresh]);

  // On close we tear down the in-flight fetch flags but DELIBERATELY keep
  // local state intact AND keep `hasLoadedRef.current = true` so reopening
  // the popup does NOT trigger a fresh page-1 Gmail fetch. The shared
  // cache + the periodic background sync remain the durable source of
  // truth between opens. Re-fetching on every close→reopen was the root
  // cause of the unread badge "jumping" (e.g. 36 → 35 → 44) when the
  // user closed an email they had just marked read.
  useEffect(() => {
    if (!open) {
      isMountedRef.current = false;
      isPaginatingRef.current = false;
      setIsLoadingMore(false);
      setIsAutoPaginating(false);
    } else {
      isMountedRef.current = true;
    }
  }, [open]);

  // Dedicated cursor for the UNREAD-only stream. When the user has the
  // "Unread" view filter selected, paginating the full INBOX is wasteful
  // (most pages contain zero unread rows) and was the cause of the
  // ~60s wait Niki reported. We instead ask Gmail for INBOX+UNREAD
  // directly so each page is dense with unread messages.
  const unreadNextTokenRef = useRef<string | null>(null);
  const unreadExhaustedRef = useRef(false);

  // Manual "Load more" — drains one page each from inbox & sent (whichever still has more)
  const loadMore = useCallback(async (opts?: { unreadOnly?: boolean }) => {
    if (isLoadingMore) return;
    // Fast path: only fetch unread messages from Gmail directly. Bypasses
    // the full-INBOX cursor so older unread mail surfaces in a single
    // round-trip instead of dozens of "Load more" pages.
    if (opts?.unreadOnly) {
      if (unreadExhaustedRef.current) return;
      setIsLoadingMore(true);
      try {
        const page = await fetchPage({
          labelIds: ['INBOX', 'UNREAD'],
          pageToken: unreadNextTokenRef.current,
          // Gmail allows up to 500 per page. Fetching the max in one
          // round-trip is dramatically faster than chaining smaller
          // pages — one network call instead of 5.
          maxResults: 500,
        });
        if (!isMountedRef.current) return;
        if (page.rateLimited) return;
        if (page.messages.length) {
          setInboxMessages((prev) => {
            const next = mergeUniqueById(prev, page.messages);
            useInboxCacheStore.setState({ inboxMessages: next });
            return next;
          });
        }
        unreadNextTokenRef.current = page.nextPageToken;
        if (!page.nextPageToken) unreadExhaustedRef.current = true;
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
      return;
    }
    // Cursor-based fallback: even when upstream token is gone, we may
    // still have older messages cached locally — keep going if so.
    const canCacheFallback = !!oldestReceivedAt && hasMoreCache;
    // Edge case from a warm open: hasMoreInbox was optimistically true but
    // we never received a page token (cursor exhausted previously). Flip
    // it false here so the UI advances to the cache fallback (or "End of
    // inbox") instead of looping with a null pageToken forever.
    const inboxHasUpstreamMore = hasMoreInbox && !!inboxNextToken;
    const sentHasUpstreamMore = hasMoreSent && !!sentNextToken;
    if (hasMoreInbox && !inboxNextToken) setHasMoreInbox(false);
    if (hasMoreSent && !sentNextToken) setHasMoreSent(false);
    if (!inboxHasUpstreamMore && !sentHasUpstreamMore && !canCacheFallback) return;
    setIsLoadingMore(true);

    // ── Instant-cache path ─────────────────────────────────────────
    // Serve older rows from the local email_cache immediately so the
    // user sees a populated list within ~50ms instead of waiting on the
    // Gmail/Nylas round-trip (which can take several seconds). Then
    // kick off upstream pagination in the background to backfill any
    // messages that aren't in the cache yet.
    if (canCacheFallback) {
      try {
        const cachedOlder = await loadOlderFromCache(oldestReceivedAt, 200);
        if (isMountedRef.current && cachedOlder.length) {
          setInboxMessages((prev) => {
            const next = mergeUniqueById(prev, cachedOlder);
            useInboxCacheStore.setState({ inboxMessages: next });
            return next;
          });
        } else if (isMountedRef.current && !cachedOlder.length && !inboxHasUpstreamMore && !sentHasUpstreamMore) {
          setHasMoreCache(false);
        }
      } catch (err) {
        console.error('[InboxDialog] cache load failed', err);
      }
      // Drop the spinner now — UI is already showing older messages.
      if (isMountedRef.current) setIsLoadingMore(false);

      // Background upstream backfill (fire-and-forget). Updates state
      // when it returns; never re-enters the spinner path.
      if (inboxHasUpstreamMore || sentHasUpstreamMore) {
        void (async () => {
          try {
            const inboxPromise = inboxHasUpstreamMore
              ? fetchPage({ labelIds: ['INBOX'], pageToken: inboxNextToken, maxResults: 500 })
              : Promise.resolve(null);
            const sentPromise = sentHasUpstreamMore
              ? fetchPage({ labelIds: ['SENT'], pageToken: sentNextToken, maxResults: 500 })
              : Promise.resolve(null);
            const [inboxPage, sentPage] = await Promise.all([inboxPromise, sentPromise]);
            if (!isMountedRef.current) return;
            if (inboxPage && !inboxPage.rateLimited) {
              setInboxMessages((prev) => mergeUniqueById(prev, inboxPage.messages));
              setInboxNextToken(inboxPage.nextPageToken);
              setHasMoreInbox(!!inboxPage.nextPageToken);
            }
            if (sentPage && !sentPage.rateLimited) {
              setSentMessages((prev) => mergeUniqueById(prev, sentPage.messages));
              setSentNextToken(sentPage.nextPageToken);
              setHasMoreSent(!!sentPage.nextPageToken);
            }
          } catch (err) {
            console.error('[InboxDialog] background backfill failed', err);
          }
        })();
      }
      return;
    }

    try {
      // Fire inbox + sent in parallel (no artificial delay) and bump
      // page size to the Gmail max so each "Load more" returns far more
      // history in a single round-trip.
      const inboxPromise = inboxHasUpstreamMore
        ? fetchPage({ labelIds: ['INBOX'], pageToken: inboxNextToken, maxResults: 500 })
        : Promise.resolve(null);
      const sentPromise = sentHasUpstreamMore
        ? fetchPage({ labelIds: ['SENT'], pageToken: sentNextToken, maxResults: 500 })
        : Promise.resolve(null);
      const [inboxPage, sentPage] = await Promise.all([inboxPromise, sentPromise]);
      if (!isMountedRef.current) return;

      if (inboxPage) {
        if (!inboxPage.rateLimited) {
          setInboxMessages(prev => mergeUniqueById(prev, inboxPage.messages));
          setInboxNextToken(inboxPage.nextPageToken);
          setHasMoreInbox(!!inboxPage.nextPageToken);
        } else if (canCacheFallback) {
          const older = await loadOlderFromCache(oldestReceivedAt, 200);
          if (isMountedRef.current) {
            if (older.length) setInboxMessages(prev => mergeUniqueById(prev, older));
            else setHasMoreCache(false);
          }
        }
      } else if (canCacheFallback) {
        const older = await loadOlderFromCache(oldestReceivedAt, 200);
        if (isMountedRef.current) {
          if (older.length) setInboxMessages(prev => mergeUniqueById(prev, older));
          else setHasMoreCache(false);
        }
      }

      if (sentPage && !sentPage.rateLimited) {
        setSentMessages(prev => mergeUniqueById(prev, sentPage.messages));
        setSentNextToken(sentPage.nextPageToken);
        setHasMoreSent(!!sentPage.nextPageToken);
      }
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [hasMoreInbox, hasMoreSent, hasMoreCache, inboxNextToken, sentNextToken, isLoadingMore, mergeUniqueById, oldestReceivedAt, loadOlderFromCache]);

  // ─── Background read-state sync ───────────────────────────────────
  // Periodically reconciles is_read / is_starred state for messages
  // currently loaded in the popup against Gmail (via Nylas) so that
  // emails read or marked unread elsewhere (Gmail web, mobile) reflect
  // here in near-real time. Lightweight delta sync — only fetches state
  // for already-loaded message IDs, never the full mailbox.
  // 5-minute background reconcile cadence. The previous 15s interval was
  // aggressive enough that a Gmail mark-as-read PATCH issued when the user
  // opened a thread sometimes hadn't propagated server-side before the next
  // sync_state poll, which then flipped the message back to unread and made
  // the badge oscillate. 5 minutes is well past Gmail's read-state
  // consistency window while still surfacing externally-read mail promptly.
  const SYNC_INTERVAL_MS = 300_000;
  const SYNC_BATCH_LIMIT = 150; // most-recent N messages per cycle
  const syncInFlightRef = useRef(false);
  // Hold the latest inboxMessages snapshot in a ref so the sync effect
  // doesn't re-subscribe (clearing/recreating its interval + visibility
  // listeners) every time a new page is appended. Without this, every
  // page append during auto-pagination tore down and rebuilt the listener
  // graph — wasted work and a steady stream of listener churn.
  const inboxMessagesRef = useRef<any[]>(inboxMessages);
  useEffect(() => {
    inboxMessagesRef.current = inboxMessages;
  }, [inboxMessages]);

  const reconcileStates = useCallback((states: Array<{ id: string; is_read: boolean; is_starred: boolean; missing?: boolean; state_fetched_at?: string }>) => {
    if (!states.length || !isMountedRef.current) return;
    const stateMap = new Map(states.map(s => [getMessageKey(s), s]));
    // Push deltas into the shared cache too so the unread badge updates
    // even when the dialog is closed on the next render.
    useInboxCacheStore.getState().applyStateDeltas(states);
    setInboxMessages(prev => {
      let changed = false;
      const next = prev
        .filter(m => {
          const s = stateMap.get(getMessageKey(m));
          if (s?.missing) { changed = true; return false; }
          return true;
        })
        .map(m => {
          const s = stateMap.get(getMessageKey(m));
          if (!s) return m;
          if (!shouldApplyProviderState(m, s)) return m;
          if (m.is_read === s.is_read && m.is_starred === s.is_starred) return m;
          changed = true;
          return {
            ...m,
            is_read: s.is_read,
            is_starred: s.is_starred,
            state_fetched_at: s.state_fetched_at ?? m.state_fetched_at,
          };
        });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!open || !status.connected) return;
    let cancelled = false;

    const runSync = async () => {
      if (syncInFlightRef.current) return;
      // Skip when tab is hidden — saves quota and avoids needless calls.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // Snapshot most-recent inbox message IDs for delta sync.
      const ids = inboxMessagesRef.current
        .slice(0, SYNC_BATCH_LIMIT)
        .map(getMessageKey)
        .filter(Boolean);
      if (ids.length === 0) return;
      syncInFlightRef.current = true;
      try {
        const { data, error } = await supabase.functions.invoke('gmail-messages', {
          body: { action: 'sync_state', message_ids: ids },
        });
        if (cancelled || error || !data?.states) return;
        void supabase
          .from('email_cache')
          .upsert(
            data.states
              .filter((s: any) => !s?.missing)
              .map((s: any) => ({
                user_id: user?.id,
                gmail_message_id: s.id,
                is_read: s.is_read,
                is_starred: s.is_starred,
                labels: s.folders ?? null,
                fetched_at: s.state_fetched_at ?? new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })),
            { onConflict: 'user_id,gmail_message_id' },
          )
          .then(() => {}, () => {});
        reconcileStates(data.states);
      } catch {
        // Swallow transient errors — next tick will retry.
      } finally {
        syncInFlightRef.current = false;
      }
    };

    // Sync once a few seconds after the popup opens (so externally-read
    // mail surfaces quickly), then every SYNC_INTERVAL_MS. We intentionally
    // do NOT re-run on tab focus / visibility change anymore — those were
    // the loudest sources of the "unread count jumping on close" bug,
    // because closing an email pane often coincides with a focus event.
    const kickoff = setTimeout(runSync, 4_000);
    const interval = setInterval(runSync, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      clearInterval(interval);
    };
    // Intentionally omit `inboxMessages` from deps — we read it via ref so
    // pagination updates do not tear down/recreate this effect's listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status.connected, reconcileStates]);


  // Combined deduped list (use API results if any; fall back to cache)
  const mappedEmails = useMemo(() => {
    const inboxSource = inboxMessages.length > 0 ? inboxMessages : cachedInboxEmails;
    const inboxEmails = mapGmailToMockEmails(inboxSource, 'inbox');
    const sentEmails = mapGmailToMockEmails(sentMessages, 'sent');
    const draftsEmails = mapGmailToMockEmails(draftsMessages, 'drafts');
    const junkEmails = mapGmailToMockEmails(junkMessages, 'junk');
    const trashEmails = mapGmailToMockEmails(trashMessages, 'trash');
    const seen = new Set<string>();
    const out: MockEmail[] = [];
    // Trash takes precedence so a deleted message moved to trash doesn't
    // also linger in the inbox bucket due to a stale cached copy.
    for (const e of trashEmails) { seen.add(e.id); out.push(e); }
    for (const e of junkEmails) { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } }
    for (const e of inboxEmails) { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } }
    for (const e of sentEmails) { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } }
    for (const e of draftsEmails) { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } }
    return out;
  }, [inboxMessages, sentMessages, cachedInboxEmails, draftsMessages, junkMessages, trashMessages]);

  // Fetch first page of provider-backed system folders (Drafts / Junk /
  // Trash). Called on open and on manual refresh, and re-called after a
  // delete so the Trash tab immediately reflects the new state.
  const refreshSystemFolders = useCallback(async () => {
    const [drafts, junk, trash] = await Promise.all([
      fetchPage({ labelIds: ['DRAFT'], maxResults: 50 }),
      fetchPage({ labelIds: ['SPAM'], maxResults: 50 }),
      fetchPage({ labelIds: ['TRASH'], maxResults: 100 }),
    ]);
    if (!isMountedRef.current) return;
    if (drafts.messages.length || drafts.nextPageToken) setDraftsMessages(drafts.messages);
    if (junk.messages.length || junk.nextPageToken) setJunkMessages(junk.messages);
    setTrashMessages(trash.messages);
  }, []);

  // Re-fetch a single system folder. Used as the post-mutation refresh
  // hook so deletes reliably surface in Trash.
  const refreshTrash = useCallback(async () => {
    const trash = await fetchPage({ labelIds: ['TRASH'], maxResults: 100 });
    if (!isMountedRef.current) return;
    setTrashMessages(trash.messages);
  }, []);

  // Kick off the system-folder fetch once on open, and again whenever the
  // user reconnects. Cheap (single page per folder) and lets Junk / Trash
  // tabs render real data without waiting for a manual refresh.
  const systemFoldersLoadedRef = useRef(false);
  useEffect(() => {
    if (!open || !status.connected) return;
    if (systemFoldersLoadedRef.current) return;
    systemFoldersLoadedRef.current = true;
    void refreshSystemFolders();
  }, [open, status.connected, refreshSystemFolders]);
  useEffect(() => {
    if (!open) systemFoldersLoadedRef.current = false;
  }, [open]);

  // Manual refresh: stale-while-revalidate. We DO NOT clear the existing
  // list — the cached messages stay visible so the user keeps their
  // scroll position and any open thread, while we pull the latest page
  // from upstream (cache-busted) and merge new messages in at the top.
  // The runRefresh path handles the in-flight indicator, error toast,
  // and slow-fetch toast.
  const handleRefresh = useCallback(async () => {
    if (!status.connected) return;
    const now = Date.now();
    if (refreshInFlightRef.current) return;
    if (now - lastManualRefreshRef.current < MANUAL_REFRESH_MIN_GAP_MS) return;
    await runRefresh({ force: true, manual: true });
    // Also refresh the auxiliary folders silently — cheap and keeps
    // Drafts / Junk / Trash in sync without a full reset.
    void refreshSystemFolders();
  }, [status.connected, runRefresh, refreshSystemFolders]);

  // IMPORTANT: call every hook on every render BEFORE any conditional return,
  // otherwise the hook order changes when `status.connected` flips and React
  // throws (which surfaces as the chained "Maximum update depth exceeded" /
  // React error #185 inside the carousel). Compute the swipe class up-front
  // so both branches below render with an identical hook sequence.
  const swipeClass = useCarouselSwipeClass();

  if (!status.connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">Email</DialogTitle>
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Connect your mail</p>
              <p className="text-sm text-muted-foreground mt-1">
                Link your email in Integrations to access your inbox here.
              </p>
            </div>
            <Button variant="liquid-glass" size="sm" className="gap-2" onClick={() => { onOpenChange(false); navigate('/integrations'); }}>
              Go to Integrations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // `hasMore` drives the infinite-scroll sentinel. We surface "more" when
  // either upstream still has a next page_token OR our local
  // `received_at` cursor still resolves to older cached rows — so the
  // user can keep scrolling past upstream rate limits / end-of-token.
  const hasMore = hasMoreInbox || hasMoreSent || (hasMoreCache && !!oldestReceivedAt);
  // Once the warm pass has happened (or the user has opened once), keep
  // DialogContent in the DOM via `forceMount` so subsequent opens are
  // instant. We hide it with `data-[state=closed]:hidden` so the closed
  // state has zero visual impact.
  const persistMount = warmMounted || open;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="email-popup-modal-root"
        {...(persistMount ? { forceMount: true } : {})}
        className={cn(
          swipeClass,
          // Near-fullscreen workspace: scales proportionally with the viewport
          // at all sizes (no fixed max width) while keeping a comfortable margin.
          "popup-shell-surface p-0 flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20",
          "h-[92vh] sm:h-[92vh]",
          "w-[min(1400px,calc(100vw-2rem))] max-w-[min(1400px,calc(100vw-2rem))] sm:max-w-[min(1400px,calc(100vw-2rem))] max-h-none",
          "overflow-hidden",
          // When force-mounted but closed, fully hide so the pre-warmed
          // tree doesn't paint or capture pointer events.
          persistMount ? "data-[state=closed]:hidden" : "",
        )}
        style={{
          width: 'min(1400px, calc(100vw - 2rem))',
        }}
      >
        <DialogTitle className="sr-only">Email</DialogTitle>
        {/* Thin top loading bar shown while a background refresh is in
            flight. Sits above the list so the cached content stays
            visible behind it. Respects prefers-reduced-motion via plain
            opacity transitions. */}
        {isRefreshing && (
          <div className="absolute left-0 right-0 top-0 z-50 h-0.5 overflow-hidden pointer-events-none">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent animate-[shimmer_1.2s_ease-in-out_infinite]" />
          </div>
        )}
        <InboxRefreshStatus
          isRefreshing={isRefreshing}
          lastRefreshAt={lastRefreshAt}
          error={refreshError}
          onRetry={handleRefresh}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Error boundary so a single bad message / thread / attachment
              cannot crash the entire inbox popup. Reset key tied to
              `mappedEmails.length` lets the boundary auto-recover when the
              underlying data set changes (new fetch, refresh, retry). */}
          <EmailPaneErrorBoundary
            fallbackTitle="Inbox failed to load"
            fallbackMessage="One of your emails couldn't be displayed. Try refreshing — if it keeps happening, the failing message will be skipped automatically."
            resetKey={`inbox-${mappedEmails.length}`}
          >
            <DealEmailsTab
              dealId=""
              externalEmails={mappedEmails}
              onRefresh={handleRefresh}
              isRefreshingExternal={isInitialLoading}
              onGmailSend={sendEmail}
              onLoadMore={loadMore}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
            isAutoPaginating={isAutoPaginating}
              onAfterTrash={refreshTrash}
            />
          </EmailPaneErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Memoize the dialog: the dashboard re-renders frequently for unrelated
// reasons (carousel state, toggles, layout). Without this, every parent
// render walks the inbox subtree even when `open` and `onOpenChange` are
// referentially stable.
export const InboxDialog = memo(InboxDialogImpl);
