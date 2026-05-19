import { useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
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
      const id = msg.id || msg.gmail_message_id;
      if (!id) continue; // can't render a row without a stable id
      out.push({
        id,
        threadId: msg.thread_id || id,
        // Canonical provider thread id — never falls back to a message id,
        // so label assignments persisted against this key remain stable.
        provider_thread_id: msg.thread_id || null,
        subject: msg.subject || '(No subject)',
        from_name: msg.from_name || msg.from_email || 'Unknown',
        from_email: msg.from_email || '',
        to_name: (msg.to_names || msg.to_emails || [])[0] || 'You',
        to_email: (msg.to_emails || [])[0] || '',
        snippet: msg.snippet || '',
        body_preview: msg.body_text || msg.body_html || msg.snippet || '',
        body_html: msg.body_html || undefined,
        body_text: msg.body_text || undefined,
        body_loaded: !!(msg.body_html || msg.body_text),
        received_at: msg.received_at || new Date().toISOString(),
        is_read: msg.is_read ?? true,
        is_starred: msg.is_starred ?? false,
        folder: folderOverride,
        labels: Array.isArray(msg.labels) ? msg.labels : [],
        has_attachments: !!msg.has_attachments,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
        is_linked_to_deal: false,
        is_follow_up: false,
        needs_response: folderOverride === 'inbox' ? !msg.is_read : false,
        category: 'deal' as const,
        provider: msg.provider || 'gmail',
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
}): Promise<{ messages: any[]; nextPageToken: string | null; rateLimited: boolean }> {
  const { labelIds, pageToken, maxResults = PAGE_SIZE } = args;
  try {
    const { data, error } = await supabase.functions.invoke('gmail-messages', {
      body: {
        action: 'list',
        max_results: maxResults,
        label_ids: labelIds,
        page_token: pageToken || undefined,
      },
    });
    if (error) {
      return { messages: [], nextPageToken: null, rateLimited: false };
    }
    if (data?.fallback) {
      return { messages: [], nextPageToken: null, rateLimited: true };
    }
    return {
      messages: data?.messages || [],
      nextPageToken: data?.next_page_token || null,
      rateLimited: false,
    };
  } catch {
    return { messages: [], nextPageToken: null, rateLimited: false };
  }
}

function InboxDialogImpl({ open, onOpenChange }: InboxDialogProps) {
  const { status, sendEmail } = useGmail();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Perf: close the [InboxOpen] timer started on the dashboard tile click
  // exactly once after the dialog mounts with `open === true`. This lets
  // us measure click → first paint in the console / User Timing track.
  const perfLoggedRef = useRef(false);
  useEffect(() => {
    if (!open || perfLoggedRef.current) return;
    perfLoggedRef.current = true;
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
  const [hasMoreInbox, setHasMoreInbox] = useState(true);
  const [hasMoreSent, setHasMoreSent] = useState(true);
  // Tracks whether the local `email_cache` cursor fallback still has
  // older rows. Starts optimistic; flips false the first time a cursor
  // query returns 0 rows so the "End of inbox" sentinel can render.
  const [hasMoreCache, setHasMoreCache] = useState(true);

  // Loading flags
  // Only show the initial spinner when we have nothing cached to render.
  // Otherwise the open is instant and the refresh happens silently below.
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Lifecycle refs to prevent overlapping fetches & stale state writes after close
  // Pre-seeded as `true` when cache already has data so the open-effect
  // skips the foreground fetch and only kicks the silent background refresh.
  const hasLoadedRef = useRef(cacheSnapshot.hasInitial && cacheSnapshot.inboxMessages.length > 0);
  const isMountedRef = useRef(true);
  const isPaginatingRef = useRef(false);

  // Helper to dedupe by id
  const mergeUniqueById = useCallback((existing: any[], incoming: any[]) => {
    const seen = new Set(existing.map(m => m.id || m.gmail_message_id));
    const additions = incoming.filter(m => {
      const key = m.id || m.gmail_message_id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return additions.length ? [...existing, ...additions] : existing;
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
    const cached = await loadOlderFromCache(null, 200);
    if (cached.length && isMountedRef.current) {
      setCachedInboxEmails(cached);
    }
  }, [loadOlderFromCache]);

  // Auto-paginate the inbox (and then the sent folder) until exhausted or until
  // the safety cap is hit. Sequential to avoid Nylas rate limits.
  const autoPaginate = useCallback(async (
    initialInboxToken: string | null,
  ) => {
    if (isPaginatingRef.current) return;
    isPaginatingRef.current = true;
    try {
      // 1. Drain inbox
      let token: string | null = initialInboxToken;
      let totalLoaded = 0;
      // current count is captured at call time; we re-check below
      while (token && totalLoaded < AUTO_LOAD_CAP && isMountedRef.current) {
        await new Promise(r => setTimeout(r, AUTO_LOAD_DELAY_MS));
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

      if (firstInbox.messages.length === 0 && !firstInbox.nextPageToken) {
        // Empty / rate-limited — try DB cache only on cold open.
        if (!cacheHasData) await hydrateFromCache();
      } else {
        setInboxMessages((prev) => {
          const next = mergeUniqueById(prev, firstInbox.messages);
          // Mirror into the shared cache so the unread badge & next open
          // see the freshest data even after this dialog unmounts.
          useInboxCacheStore.setState({ inboxMessages: next });
          return next;
        });
        setInboxNextToken(firstInbox.nextPageToken);
        setHasMoreInbox(!!firstInbox.nextPageToken);
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
    } else {
      isMountedRef.current = true;
    }
  }, [open]);

  // Manual "Load more" — drains one page each from inbox & sent (whichever still has more)
  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    // Cursor-based fallback: even when upstream token is gone, we may
    // still have older messages cached locally — keep going if so.
    const canCacheFallback = !!oldestReceivedAt && hasMoreCache;
    if (!hasMoreInbox && !hasMoreSent && !canCacheFallback) return;
    setIsLoadingMore(true);
    try {
      if (hasMoreInbox && inboxNextToken) {
        const page = await fetchPage({ labelIds: ['INBOX'], pageToken: inboxNextToken });
        if (!isMountedRef.current) return;
        if (!page.rateLimited) {
          setInboxMessages(prev => mergeUniqueById(prev, page.messages));
          setInboxNextToken(page.nextPageToken);
          setHasMoreInbox(!!page.nextPageToken);
        } else if (canCacheFallback) {
          // Upstream rate-limited — fall back to cursor-anchored cache read
          // so the user still gets older messages instead of a hard stop.
          const older = await loadOlderFromCache(oldestReceivedAt, 100);
          if (isMountedRef.current) {
            if (older.length) setInboxMessages(prev => mergeUniqueById(prev, older));
            else setHasMoreCache(false);
          }
        }
      } else if (!hasMoreInbox && canCacheFallback) {
        // Upstream exhausted but the local cache still has older rows
        // anchored before our oldest loaded `received_at`.
        const older = await loadOlderFromCache(oldestReceivedAt, 100);
        if (isMountedRef.current) {
          if (older.length) setInboxMessages(prev => mergeUniqueById(prev, older));
          else setHasMoreCache(false);
        }
      }
      if (hasMoreSent && sentNextToken) {
        await new Promise(r => setTimeout(r, AUTO_LOAD_DELAY_MS));
        const page = await fetchPage({ labelIds: ['SENT'], pageToken: sentNextToken });
        if (!isMountedRef.current) return;
        if (!page.rateLimited) {
          setSentMessages(prev => mergeUniqueById(prev, page.messages));
          setSentNextToken(page.nextPageToken);
          setHasMoreSent(!!page.nextPageToken);
        }
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

  const reconcileStates = useCallback((states: Array<{ id: string; is_read: boolean; is_starred: boolean; missing?: boolean }>) => {
    if (!states.length || !isMountedRef.current) return;
    const stateMap = new Map(states.map(s => [s.id, s]));
    // Push deltas into the shared cache too so the unread badge updates
    // even when the dialog is closed on the next render.
    useInboxCacheStore.getState().applyStateDeltas(states);
    setInboxMessages(prev => {
      let changed = false;
      const next = prev
        .filter(m => {
          const s = stateMap.get(m.id);
          if (s?.missing) { changed = true; return false; }
          return true;
        })
        .map(m => {
          const s = stateMap.get(m.id);
          if (!s) return m;
          if (m.is_read === s.is_read && m.is_starred === s.is_starred) return m;
          changed = true;
          return { ...m, is_read: s.is_read, is_starred: s.is_starred };
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
        .map(m => m.id || m.gmail_message_id)
        .filter(Boolean);
      if (ids.length === 0) return;
      syncInFlightRef.current = true;
      try {
        const { data, error } = await supabase.functions.invoke('gmail-messages', {
          body: { action: 'sync_state', message_ids: ids },
        });
        if (cancelled || error || !data?.states) return;
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
    const seenIds = new Set(inboxEmails.map(e => e.id));
    const uniqueSent = sentEmails.filter(e => !seenIds.has(e.id));
    return [...inboxEmails, ...uniqueSent];
  }, [inboxMessages, sentMessages, cachedInboxEmails]);

  // Refresh: reset state and re-fetch from page 1 (then auto-paginate again)
  const handleRefresh = useCallback(async () => {
    if (!status.connected) return;
    isPaginatingRef.current = false;
    setInboxMessages([]);
    setSentMessages([]);
    setDraftsMessages([]);
    setJunkMessages([]);
    setTrashMessages([]);
    setInboxNextToken(null);
    setSentNextToken(null);
    setHasMoreInbox(true);
    setHasMoreSent(true);
    setHasMoreCache(true);
    setIsInitialLoading(true);

    const firstInbox = await fetchPage({ labelIds: ['INBOX'] });
    if (!isMountedRef.current) return;
    setInboxMessages(prev => mergeUniqueById(prev, firstInbox.messages));
    setInboxNextToken(firstInbox.nextPageToken);
    setHasMoreInbox(!!firstInbox.nextPageToken);
    setIsInitialLoading(false);
    autoPaginate(firstInbox.nextPageToken);
    void refreshSystemFolders();
  }, [status.connected, mergeUniqueById, autoPaginate]);

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
              <p className="font-medium text-foreground">Connect your Gmail</p>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          swipeClass,
          // Near-fullscreen workspace: scales proportionally with the viewport
          // at all sizes (no fixed max width) while keeping a comfortable margin.
          "popup-shell-surface p-0 flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20",
          "h-[92vh] sm:h-[92vh]",
          "w-[94vw] max-w-none sm:max-w-none max-h-none",
          "overflow-hidden"
        )}
        style={{
          width: '94vw',
        }}
      >
        <DialogTitle className="sr-only">Email</DialogTitle>
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
              isAutoPaginating={isPaginatingRef.current}
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
