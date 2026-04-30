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

const PAGE_SIZE = 50;

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
  applyStateDeltas: (states: Array<{ id: string; is_read: boolean; is_starred: boolean; missing?: boolean }>) => void;
  /** Reset on auth change / logout. */
  reset: () => void;
}

/** Merge `incoming` into `existing` deduped by id, preserving order. */
function mergeUniqueById(existing: any[], incoming: any[]): any[] {
  const seen = new Set(existing.map((m) => m.id || m.gmail_message_id));
  const additions = incoming.filter((m) => {
    const key = m.id || m.gmail_message_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return additions.length ? [...additions, ...existing] : existing;
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
      if (inboxPage.ok) {
        set((prev) => ({
          // Merge so previously loaded older pages aren't dropped on poll.
          inboxMessages: mergeUniqueById(prev.inboxMessages, inboxPage.messages),
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
          if (m.is_read === s.is_read && m.is_starred === s.is_starred) return m;
          changed = true;
          return { ...m, is_read: s.is_read, is_starred: s.is_starred };
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