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
// 25 keeps the background prefetch fast so the inbox dialog opens
// instantly; older pages are fetched lazily on scroll via "Load more".
const PAGE_SIZE = 25;

// localStorage hydration: persist the top of the inbox so that on a fresh
// page load (or hard refresh) the dialog can paint previously-loaded emails
// instantly while a background `refresh()` reconciles with the server.
const LS_KEY = 'naitive.inboxCache.v1';
const LS_MAX_MESSAGES = 50;

function loadPersistedCache(): {
  inboxMessages: any[];
  sentMessages: any[];
  lastFetchedAt: number | null;
} {
  if (typeof window === 'undefined') {
    return { inboxMessages: [], sentMessages: [], lastFetchedAt: null };
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { inboxMessages: [], sentMessages: [], lastFetchedAt: null };
    const parsed = JSON.parse(raw);
    return {
      inboxMessages: Array.isArray(parsed?.inboxMessages) ? parsed.inboxMessages.map(normalizeReadState) : [],
      sentMessages: Array.isArray(parsed?.sentMessages) ? parsed.sentMessages : [],
      lastFetchedAt: typeof parsed?.lastFetchedAt === 'number' ? parsed.lastFetchedAt : null,
    };
  } catch {
    return { inboxMessages: [], sentMessages: [], lastFetchedAt: null };
  }
}

function persistCache(state: { inboxMessages: any[]; sentMessages: any[]; lastFetchedAt: number | null }) {
  if (typeof window === 'undefined') return;
  try {
    // Strip heavy fields (bodies/attachments) — we only need enough to
    // paint the list rows. Bodies are re-fetched on row click via the
    // existing prefetcher.
    const trim = (m: any) => {
      if (!m) return m;
      const { body_html, body_text, attachments, inline_attachments, ...rest } = m;
      return rest;
    };
    const payload = {
      inboxMessages: state.inboxMessages.slice(0, LS_MAX_MESSAGES).map(trim),
      sentMessages: state.sentMessages.slice(0, LS_MAX_MESSAGES).map(trim),
      lastFetchedAt: state.lastFetchedAt,
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    // Quota / serialization errors are non-fatal — cache is best-effort.
  }
}

function getMessageKey(value: any): string {
  return String(value?.gmail_message_id || value?.message_id || value?.id || '');
}

function getStateFreshness(value: any): number {
  const raw = value?.state_fetched_at || value?.received_at || null;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function shouldApplyProviderState(current: any, incoming: any): boolean {
  return getStateFreshness(incoming) >= getStateFreshness(current);
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

function overlayStateDeltas(messages: any[], states: Array<{ id: string; gmail_message_id?: string; is_read: boolean; is_starred: boolean; missing?: boolean; state_fetched_at?: string }>): any[] {
  if (!states.length) return messages;
  const stateMap = new Map(states.map((s) => [getMessageKey(s), s]));
  let changed = false;
  const next = messages.map(normalizeReadState)
    .filter((m) => {
      const s = stateMap.get(getMessageKey(m));
      if (s?.missing) { changed = true; return false; }
      return true;
    })
    .map((m) => {
      const s = stateMap.get(getMessageKey(m));
      if (!s || !shouldApplyProviderState(m, s)) return m;
      if (m.is_read === s.is_read && m.is_starred === s.is_starred) return m;
      changed = true;
      return { ...m, is_read: s.is_read, is_starred: s.is_starred, state_fetched_at: s.state_fetched_at ?? m.state_fetched_at };
    });
  return changed ? next : messages.map(normalizeReadState);
}

async function syncMessageStates(messages: any[], limit = PAGE_SIZE) {
  const ids = messages.map(normalizeReadState).slice(0, limit).map(getMessageKey).filter(Boolean);
  if (!ids.length) return [];
  try {
    const { data } = await supabase.functions.invoke('gmail-messages', {
      body: { action: 'sync_state', message_ids: ids },
    });
    return (data?.states || []) as Array<{ id: string; gmail_message_id?: string; is_read: boolean; is_starred: boolean; missing?: boolean; state_fetched_at?: string }>;
  } catch {
    return [];
  }
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
  for (const raw of incoming) {
    const m = normalizeReadState(raw);
    const key = getMessageKey(m);
    if (key) incomingById.set(key, m);
  }
  const seen = new Set<string>();
  const patched = existing.map((m) => {
    const key = getMessageKey(m);
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
  for (const raw of incoming) {
    const m = normalizeReadState(raw);
    const key = getMessageKey(m);
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
      messages: (data?.messages || []).map(normalizeReadState),
      nextPageToken: data?.next_page_token || null,
      ok: true,
    };
  } catch {
    return { messages: [], nextPageToken: null, ok: false };
  }
}

const __persisted = loadPersistedCache();

export const useInboxCacheStore = create<InboxCacheState>((set, get) => ({
  // Hydrate from localStorage so the inbox dialog can render instantly on
  // first open after a page reload — no spinner, no blank state.
  inboxMessages: __persisted.inboxMessages,
  sentMessages: __persisted.sentMessages,
  inboxNextToken: null,
  sentNextToken: null,
  // We deliberately leave `hasInitial=false` so the background `prefetch()`
  // still runs to merge in anything newer.
  hasInitial: false,
  lastFetchedAt: __persisted.lastFetchedAt,
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
      // Optimistically commit the freshly-fetched list BEFORE running
      // `sync_state` so the UI can paint immediately. The per-message
      // sync_state call below corrects read/starred state in the
      // background a moment later.
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
      // Mark as initial-loaded as soon as the list is in memory so the
      // dialog can render without waiting for sync_state.
      set({ hasInitial: true, lastFetchedAt: Date.now() });
      persistCache({
        inboxMessages: get().inboxMessages,
        sentMessages: get().sentMessages,
        lastFetchedAt: get().lastFetchedAt,
      });
      // Authoritative read/starred reconcile happens in the background.
      if (inboxMerged.length) {
        const inboxStates = await syncMessageStates(inboxMerged, PAGE_SIZE);
        if (inboxStates.length) get().applyStateDeltas(inboxStates);
      }
      const sentPage = await fetchPage({ labelIds: ['SENT'] });
      if (sentPage.ok) {
        set((prev) => ({
          sentMessages: mergeUniqueById(prev.sentMessages, sentPage.messages),
          sentNextToken: prev.sentMessages.length === 0
            ? sentPage.nextPageToken
            : prev.sentNextToken,
        }));
        persistCache({
          inboxMessages: get().inboxMessages,
          sentMessages: get().sentMessages,
          lastFetchedAt: get().lastFetchedAt,
        });
      }
    } finally {
      set({ isRefreshing: false });
    }
  },

  setInboxMessages: (msgs) => {
    set({ inboxMessages: msgs });
    persistCache({
      inboxMessages: msgs,
      sentMessages: get().sentMessages,
      lastFetchedAt: get().lastFetchedAt,
    });
  },
  setSentMessages: (msgs) => {
    set({ sentMessages: msgs });
    persistCache({
      inboxMessages: get().inboxMessages,
      sentMessages: msgs,
      lastFetchedAt: get().lastFetchedAt,
    });
  },

  applyStateDeltas: (states) => {
    if (!states.length) return;
    const stateMap = new Map(states.map((s) => [getMessageKey(s), s]));
    set((prev) => {
      let changed = false;
      const next = prev.inboxMessages
        .filter((m) => {
          const s = stateMap.get(getMessageKey(m));
          if (s?.missing) { changed = true; return false; }
          return true;
        })
        .map((m) => {
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
      return changed ? { inboxMessages: next } : {};
    });
    persistCache({
      inboxMessages: get().inboxMessages,
      sentMessages: get().sentMessages,
      lastFetchedAt: get().lastFetchedAt,
    });
  },

  reset: () => {
    set({
      inboxMessages: [],
      sentMessages: [],
      inboxNextToken: null,
      sentNextToken: null,
      hasInitial: false,
      lastFetchedAt: null,
      isRefreshing: false,
    });
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(LS_KEY); } catch { /* noop */ }
    }
  },
}));

/** Selector: unread inbox count derived from cached messages. */
export const selectUnreadCount = (s: InboxCacheState): number =>
  s.inboxMessages.reduce((n, m) => {
    if (!m || m.is_read !== false) return n;
    // Respect Gmail labels: if the provider says it's read (labels exist
    // and don't contain UNREAD), don't count it — keeps the badge in sync
    // with what the user sees in Gmail.
    const labels = Array.isArray(m.labels) ? m.labels : [];
    if (labels.length > 0) {
      const hasUnreadLabel = labels.some((label: any) => {
        const v = String(label?.id ?? label?.name ?? label?.display_name ?? label?.label ?? label).toUpperCase();
        return v === 'UNREAD';
      });
      if (!hasUnreadLabel) return n;
    }
    return n + 1;
  }, 0);