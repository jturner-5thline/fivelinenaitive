import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Inbox cache store
 *
 * Holds the latest inbox + sent message lists in memory so the InboxDialog can
 * open instantly with no spinner. The Dashboard calls `useInboxPrefetch()` on
 * mount to:
 *   1. Eagerly fetch the first inbox + sent pages in the background.
 *   2. Re-fetch every 2 minutes while mounted (polling for new messages).
 * `InboxDialog` reads `inboxMessages` / `sentMessages` synchronously on open
 * and silently calls `refresh()` to merge in anything newer without
 * disrupting the currently rendered list.
 *
 * The unread badge surfaces the same data via `selectUnreadCount` — no
 * separate fetch path required.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Initial page size for inbox prefetch + first Gmail/Nylas page.
// Bumped from 50 → 100 so the dialog opens deep enough that
// "Load more" rarely fires during normal scrolling.
const PAGE_SIZE = 100;

function getStateFreshness(value: any): number {
  const raw = value?.state_fetched_at || value?.received_at || null;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function shouldApplyProviderState(current: any, incoming: any): boolean {
  return getStateFreshness(incoming) >= getStateFreshness(current);
}

/**
 * Fetch Microsoft (Outlook) messages from the unified `emails` table and
 * shape them into the same field set the Gmail edge function returns, so the
 * existing inbox mapper renders them without further changes. Carries a
 * `provider: 'microsoft'` flag so UI rows can show an Outlook badge.
 */
async function fetchMicrosoftEmails(folder: 'INBOX' | 'SENT'): Promise<any[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    // We only have inbound messages today. Suppress for SENT until outbound
    // sync exists, otherwise the SENT tab would show received messages.
    if (folder === 'SENT') return [];
    const { data, error } = await supabase
      .from('emails')
      .select('message_id, thread_id, subject, from_email, from_name, to_emails, preview, received_at, is_read, has_attachments, provider')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .order('received_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error || !data) return [];
    return data.map((m) => ({
      id: m.message_id,
      gmail_message_id: m.message_id,
      thread_id: m.thread_id,
      subject: m.subject,
      from_email: m.from_email,
      from_name: m.from_name,
      to_emails: m.to_emails ?? [],
      snippet: m.preview ?? '',
      received_at: m.received_at,
      is_read: m.is_read,
      is_starred: false,
      labels: folder === 'INBOX' ? ['INBOX'] : ['SENT'],
      has_attachments: m.has_attachments,
      provider: 'microsoft',
    }));
  } catch {
    return [];
  }
}

export interface InboxCacheState {
  inboxMessages: any[];
  sentMessages: any[];
  inboxNextToken: string | null;
  sentNextToken: string | null;
  /** True once the first prefetch (success or empty) has completed. */
  hasInitial: boolean;
  /** Epoch ms of last successful refresh. */
  lastFetchedAt: number | null;
  /** A foreground or background refresh is in flight. */
  isRefreshing: boolean;

  /** First-time fetch — no-op if data already present. */
  prefetch: () => Promise<void>;
  /** Explicit refresh — re-fetches first page of inbox + sent and merges. */
  refresh: () => Promise<void>;
  /** Replace inbox messages outright (used by the dialog after pagination). */
  setInboxMessages: (msgs: any[]) => void;
  setSentMessages: (msgs: any[]) => void;
  /** Reconcile is_read / is_starred deltas pushed by the dialog. */
  applyStateDeltas: (states: Array<{ id: string; is_read: boolean; is_starred: boolean; missing?: boolean; state_fetched_at?: string }>) => void;
  /** Reset on auth change / logout. */
  reset: () => void;
}

/**
 * Merge `incoming` into `existing` deduped by id, preserving order.
 *
 * Bug fix (Niki): the previous implementation only added rows that
 * weren't already present. When a message had been read in Gmail since
 * it was last cached, the fresh `is_read: true` from the incoming list
 * was discarded and Naitive kept showing the message as unread until a
 * hard reset. We now overlay mutable provider-side state (is_read,
 * is_starred, labels) onto the cached entry while preserving order.
 */
function mergeUniqueById(existing: any[], incoming: any[]): any[] {
  const incomingById = new Map<string, any>();
  for (const m of incoming) {
    const key = m?.id || m?.gmail_message_id;
    if (key) incomingById.set(key, m);
  }
  const seen = new Set<string>();
  const patched = existing.map((m) => {
    const key = m?.id || m?.gmail_message_id;
    if (!key) return m;
    seen.add(key);
    const fresh = incomingById.get(key);
    if (!fresh) return m;
    if (!shouldApplyProviderState(m, fresh)) return m;
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
  for (const m of incoming) {
    const key = m?.id || m?.gmail_message_id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    additions.push(m);
  }
  return additions.length ? [...additions, ...patched] : patched;
}

/** Single page fetch against the gmail-messages edge function. */
async function fetchPage(args: {
  labelIds: string[];
  pageToken?: string | null;
  maxResults?: number;
}): Promise<{ messages: any[]; nextPageToken: string | null; ok: boolean }> {
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
    if (error || data?.fallback) return { messages: [], nextPageToken: null, ok: false };
    return {
      messages: data?.messages || [],
      nextPageToken: data?.next_page_token || null,
      ok: true,
    };
  } catch {
    return { messages: [], nextPageToken: null, ok: false };
  }
}

export const useInboxCacheStore = create<InboxCacheState>((set, get) => ({
  inboxMessages: [],
  sentMessages: [],
  inboxNextToken: null,
  sentNextToken: null,
  hasInitial: false,
  lastFetchedAt: null,
  isRefreshing: false,

  prefetch: async () => {
    const s = get();
    if (s.hasInitial || s.isRefreshing) return;
    await get().refresh();
  },

  refresh: async () => {
    if (get().isRefreshing) return;
    set({ isRefreshing: true });
    try {
      // Inbox first (drives the unread badge), then sent.
      const inboxPage = await fetchPage({ labelIds: ['INBOX'] });
      const msInbox = await fetchMicrosoftEmails('INBOX');
      const inboxMerged = [...(inboxPage.ok ? inboxPage.messages : []), ...msInbox]
        .sort((a, b) => new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime());
      if (inboxPage.ok || msInbox.length) {
        set((prev) => ({
          // Merge so previously loaded older pages aren't dropped on poll.
          inboxMessages: mergeUniqueById(prev.inboxMessages, inboxMerged),
          // Only overwrite the next-token when we re-fetched page 1 — it
          // represents the cursor *after* the freshest page.
          inboxNextToken: prev.inboxMessages.length === 0
            ? inboxPage.nextPageToken
            : prev.inboxNextToken,
        }));
      }
      const sentPage = await fetchPage({ labelIds: ['SENT'] });
      if (sentPage.ok) {
        set((prev) => ({
          sentMessages: mergeUniqueById(prev.sentMessages, sentPage.messages),
          sentNextToken: prev.sentMessages.length === 0
            ? sentPage.nextPageToken
            : prev.sentNextToken,
        }));
      }
      set({ hasInitial: true, lastFetchedAt: Date.now() });
    } finally {
      set({ isRefreshing: false });
    }
  },

  setInboxMessages: (msgs) => set({ inboxMessages: msgs }),
  setSentMessages: (msgs) => set({ sentMessages: msgs }),

  applyStateDeltas: (states) => {
    if (!states.length) return;
    const stateMap = new Map(states.map((s) => [s.id, s]));
    set((prev) => {
      let changed = false;
      const next = prev.inboxMessages
        .filter((m) => {
          const s = stateMap.get(m.id);
          if (s?.missing) { changed = true; return false; }
          return true;
        })
        .map((m) => {
          const s = stateMap.get(m.id);
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
      return changed ? { inboxMessages: next } : {};
    });
  },

  reset: () => set({
    inboxMessages: [],
    sentMessages: [],
    inboxNextToken: null,
    sentNextToken: null,
    hasInitial: false,
    lastFetchedAt: null,
    isRefreshing: false,
  }),
}));

/** Selector: unread inbox count derived from cached messages. */
export const selectUnreadCount = (s: InboxCacheState): number =>
  s.inboxMessages.reduce((n, m) => (m && m.is_read === false ? n + 1 : n), 0);