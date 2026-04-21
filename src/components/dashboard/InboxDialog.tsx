import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { useNavigate } from 'react-router-dom';
import { DealEmailsTab } from '@/components/deal/DealEmailsTab';
import { MockEmail } from '@/components/deal/email/mockEmailData';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCarouselSwipeClass } from '@/hooks/useCarouselSwipeClass';
import { cn } from '@/lib/utils';

interface InboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// How many messages to request per page from Nylas/Gmail
const PAGE_SIZE = 50;
// Safety cap: hard maximum number of inbox messages we will ever auto-load in
// one session. Prevents accidentally fetching tens of thousands of messages
// from a very large mailbox. Users can keep clicking "Load more" past this
// only by keeping the dialog open and clicking again — auto-load stops here.
const AUTO_LOAD_CAP = 1000;
// Delay between auto-pagination requests so we don't hammer the provider
// or trip Nylas' rate limiter.
const AUTO_LOAD_DELAY_MS = 350;

// Map Gmail messages to MockEmail format for DealEmailsTab compatibility
function mapGmailToMockEmails(gmailMessages: any[], folderOverride: 'inbox' | 'sent' | 'drafts' = 'inbox'): MockEmail[] {
  return gmailMessages.map((msg) => ({
    id: msg.id || msg.gmail_message_id,
    threadId: msg.thread_id || msg.id || msg.gmail_message_id,
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
    labels: msg.labels || [],
    has_attachments: !!msg.has_attachments,
    attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
    is_linked_to_deal: false,
    is_follow_up: false,
    needs_response: folderOverride === 'inbox' ? !msg.is_read : false,
    category: 'deal' as const,
  }));
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

export function InboxDialog({ open, onOpenChange }: InboxDialogProps) {
  const { status, sendEmail } = useGmail();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Inbox + sent message stores (raw Gmail/Nylas shape, deduped by id)
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [cachedInboxEmails, setCachedInboxEmails] = useState<any[]>([]);

  // Pagination cursors
  const [inboxNextToken, setInboxNextToken] = useState<string | null>(null);
  const [sentNextToken, setSentNextToken] = useState<string | null>(null);
  const [hasMoreInbox, setHasMoreInbox] = useState(true);
  const [hasMoreSent, setHasMoreSent] = useState(true);

  // Loading flags
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Lifecycle refs to prevent overlapping fetches & stale state writes after close
  const hasLoadedRef = useRef(false);
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

  // Load fallback from local cache when API returns nothing on first load
  const hydrateFromCache = useCallback(async () => {
    if (!user) return;
    const { data: cached } = await supabase
      .from('email_cache')
      .select('*')
      .eq('user_id', user.id)
      .order('received_at', { ascending: false })
      .limit(200);
    if (cached?.length && isMountedRef.current) {
      setCachedInboxEmails(cached);
    }
  }, [user]);

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
        setInboxMessages(prev => mergeUniqueById(prev, page.messages));
        token = page.nextPageToken;
        setInboxNextToken(token);
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
          setSentMessages(prev => mergeUniqueById(prev, firstSent.messages));
          sentToken = firstSent.nextPageToken;
          setSentNextToken(sentToken);
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
        setSentMessages(prev => mergeUniqueById(prev, page.messages));
        sentToken = page.nextPageToken;
        setSentNextToken(sentToken);
        setHasMoreSent(!!sentToken);
        sentLoaded += page.messages.length;
      }
    } finally {
      isPaginatingRef.current = false;
    }
  }, [mergeUniqueById]);

  // Initial load: first inbox page (so UI is responsive), then kick off background auto-pagination.
  useEffect(() => {
    if (!open || !status.connected || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    isMountedRef.current = true;

    (async () => {
      setIsInitialLoading(true);
      const firstInbox = await fetchPage({ labelIds: ['INBOX'] });
      if (!isMountedRef.current) return;

      if (firstInbox.messages.length === 0 && !firstInbox.nextPageToken) {
        // Empty / rate-limited — try cache
        await hydrateFromCache();
      } else {
        setInboxMessages(prev => mergeUniqueById(prev, firstInbox.messages));
        setInboxNextToken(firstInbox.nextPageToken);
        setHasMoreInbox(!!firstInbox.nextPageToken);
      }
      setIsInitialLoading(false);

      // Kick off background auto-pagination (inbox tail + full sent)
      autoPaginate(firstInbox.nextPageToken);
    })();
  }, [open, status.connected, hydrateFromCache, mergeUniqueById, autoPaginate]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      hasLoadedRef.current = false;
      isMountedRef.current = false;
      isPaginatingRef.current = false;
      setInboxMessages([]);
      setSentMessages([]);
      setCachedInboxEmails([]);
      setInboxNextToken(null);
      setSentNextToken(null);
      setHasMoreInbox(true);
      setHasMoreSent(true);
      setIsInitialLoading(false);
      setIsLoadingMore(false);
    } else {
      isMountedRef.current = true;
    }
  }, [open]);

  // Manual "Load more" — drains one page each from inbox & sent (whichever still has more)
  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    if (!hasMoreInbox && !hasMoreSent) return;
    setIsLoadingMore(true);
    try {
      if (hasMoreInbox && inboxNextToken) {
        const page = await fetchPage({ labelIds: ['INBOX'], pageToken: inboxNextToken });
        if (!isMountedRef.current) return;
        if (!page.rateLimited) {
          setInboxMessages(prev => mergeUniqueById(prev, page.messages));
          setInboxNextToken(page.nextPageToken);
          setHasMoreInbox(!!page.nextPageToken);
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
  }, [hasMoreInbox, hasMoreSent, inboxNextToken, sentNextToken, isLoadingMore, mergeUniqueById]);

  // ─── Background read-state sync ───────────────────────────────────
  // Periodically reconciles is_read / is_starred state for messages
  // currently loaded in the popup against Gmail (via Nylas) so that
  // emails read or marked unread elsewhere (Gmail web, mobile) reflect
  // here in near-real time. Lightweight delta sync — only fetches state
  // for already-loaded message IDs, never the full mailbox.
  const SYNC_INTERVAL_MS = 15_000;
  const SYNC_BATCH_LIMIT = 150; // most-recent N messages per cycle
  const syncInFlightRef = useRef(false);

  const reconcileStates = useCallback((states: Array<{ id: string; is_read: boolean; is_starred: boolean; missing?: boolean }>) => {
    if (!states.length || !isMountedRef.current) return;
    const stateMap = new Map(states.map(s => [s.id, s]));
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
      const ids = inboxMessages
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

    // Run once shortly after open so quick external reads sync fast,
    // then on a steady interval.
    const kickoff = setTimeout(runSync, 4_000);
    const interval = setInterval(runSync, SYNC_INTERVAL_MS);

    // Also sync immediately when the tab/window regains focus.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runSync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', runSync);

    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', runSync);
    };
  }, [open, status.connected, inboxMessages, reconcileStates]);


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
    setInboxNextToken(null);
    setSentNextToken(null);
    setHasMoreInbox(true);
    setHasMoreSent(true);
    setIsInitialLoading(true);

    const firstInbox = await fetchPage({ labelIds: ['INBOX'] });
    if (!isMountedRef.current) return;
    setInboxMessages(prev => mergeUniqueById(prev, firstInbox.messages));
    setInboxNextToken(firstInbox.nextPageToken);
    setHasMoreInbox(!!firstInbox.nextPageToken);
    setIsInitialLoading(false);
    autoPaginate(firstInbox.nextPageToken);
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
            <Button onClick={() => { onOpenChange(false); navigate('/integrations'); }}>
              Go to Integrations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const hasMore = hasMoreInbox || hasMoreSent;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          swipeClass,
          // Responsive width: scales with viewport, capped at 1400px, never overflows.
          "p-0 flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20",
          "h-[92vh] sm:h-[92vh]",
          "w-[95vw] max-w-[1400px] sm:max-w-[1400px]",
          "overflow-hidden"
        )}
        style={{ width: 'min(1400px, 95vw)' }}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
