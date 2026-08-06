import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EmailAttachment } from './mockEmailData';

export interface FullMessage {
  id?: string;
  thread_id?: string;
  body_html?: string;
  body_text?: string;
  attachments?: EmailAttachment[];
  /**
   * Inline attachments (Content-Disposition: inline OR carrying a Content-ID).
   * Used to resolve `cid:` references in the HTML body — signature logos,
   * embedded headshots, etc. These are NOT rendered as user-visible
   * attachment cards.
   */
  inline_attachments?: EmailAttachment[];
}

export interface FullThreadMessage extends FullMessage {
  subject?: string;
  from_name?: string;
  from_email?: string;
  received_at?: string;
}

/**
 * Module-level cache for full message bodies. Keyed by Gmail message id.
 *
 * Populated by:
 *   - `fetchFullEmailMessage` (cache-write on success)
 *   - `prefetchFullEmailMessage` (hover / focus prefetch from list rows)
 *
 * Read by `useFullEmailMessage` so opening a previously-prefetched or
 * previously-viewed message is instant (no spinner, no network roundtrip).
 *
 * In-flight fetches are de-duplicated via `inflight` so multiple concurrent
 * subscribers (e.g. thread header + per-message block) share a single
 * edge-function call.
 */
const messageCache = new Map<string, FullMessage>();
const inflight = new Map<string, Promise<FullMessage>>();
const MAX_CACHE = 200;

/**
 * Background-prefetch concurrency limiter.
 *
 * Click-driven fetches (`fetchFullEmailMessage` called directly from the
 * viewer) bypass this queue and go immediately. Only background prefetches
 * triggered by list rendering / hover (`prefetchFullEmailMessage`) flow
 * through it.
 *
 * Why: when the inbox renders 10+ thread rows, each used to fire its own
 * `gmail-messages` invocation in the same tick. The edge function has no
 * warm pool for that user, so every request cold-started its own isolate
 * (~45ms boot) and Nylas throttled the burst — surfacing as the 15s
 * timeouts and "Stale Emails" errors. Capping parallel background work at
 * 2 flattens the spike without slowing the user-visible click path.
 */
const MAX_PARALLEL_PREFETCH = 2;
let activePrefetches = 0;
const prefetchQueue: Array<() => void> = [];

function runNextPrefetch() {
  while (activePrefetches < MAX_PARALLEL_PREFETCH && prefetchQueue.length > 0) {
    const next = prefetchQueue.shift();
    if (!next) break;
    activePrefetches++;
    next();
  }
}

// ─── Prefetch status (for the subtle "Last synced X ago" indicator) ─────
//
// Tiny pub/sub kept in module scope so any list component can subscribe
// without prop drilling. Updated whenever a background prefetch is
// queued/finished, and whenever a real fetch succeeds.
let lastFetchAt: number | null = null;
let lastFetchOk = true;
const statusListeners = new Set<() => void>();

function notifyStatus() {
  statusListeners.forEach((l) => {
    try { l(); } catch { /* ignore listener errors */ }
  });
}

function markFetchSuccess() {
  lastFetchAt = Date.now();
  lastFetchOk = true;
  notifyStatus();
}

function markFetchFailure() {
  lastFetchOk = false;
  notifyStatus();
}

function isTransientFetchError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /rate.?limit|429|503|502|504|timeout|timed out|taking longer than usual|temporar|try again in a moment|service unavailable/i.test(msg);
}

export interface EmailPrefetchStatus {
  /** Pending background prefetches (queued + actively in flight). */
  pending: number;
  /** Timestamp of the most recent successful body fetch, or null. */
  lastFetchAt: number | null;
  /** Whether the most recent fetch succeeded (false after a failure). */
  ok: boolean;
}

// Cached snapshot. useSyncExternalStore requires getSnapshot to return a
// stable, referentially-equal value when nothing has changed — otherwise
// React detects a "change" on every render and re-subscribes / re-renders
// in an infinite loop. We rebuild the snapshot ONLY when one of the
// underlying fields actually differs from the last one we returned.
let cachedStatus: EmailPrefetchStatus = {
  pending: 0,
  lastFetchAt: null,
  ok: true,
};

function getStatus(): EmailPrefetchStatus {
  const pending = activePrefetches + prefetchQueue.length;
  if (
    cachedStatus.pending === pending &&
    cachedStatus.lastFetchAt === lastFetchAt &&
    cachedStatus.ok === lastFetchOk
  ) {
    return cachedStatus;
  }
  cachedStatus = { pending, lastFetchAt, ok: lastFetchOk };
  return cachedStatus;
}

/**
 * Subscribe to prefetch queue / last-sync changes. Designed for use with
 * React's `useSyncExternalStore` so the indicator renders only when the
 * underlying status actually changes.
 */
export function subscribeEmailPrefetchStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => { statusListeners.delete(cb); };
}

export function getEmailPrefetchStatus(): EmailPrefetchStatus {
  return getStatus();
}

/**
 * localStorage-backed persistence layer for full email bodies. Survives
 * modal close/reopen, route changes, and full page reloads so a thread
 * the user has opened once renders instantly the next time.
 *
 * Keyed per message id under a single bucket so we can prune the LRU
 * cheaply without scanning the whole storage. Failures (quota, private
 * mode, serialization) are silent.
 */
const LS_KEY = 'naitive.email.body_cache.v1';
const LS_MAX = 80; // smaller than in-memory cap to stay well under quota
const LS_BODY_MAX = 250_000; // skip persisting absurdly large bodies

type LSCache = Record<string, { msg: FullMessage; ts: number }>;

function readLS(): LSCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as LSCache) : {};
  } catch {
    return {};
  }
}

function writeLS(c: LSCache) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {
    /* quota — give up silently */
  }
}

function persistMessage(id: string, msg: FullMessage) {
  const htmlLen = msg.body_html?.length || 0;
  const textLen = msg.body_text?.length || 0;
  if (htmlLen + textLen > LS_BODY_MAX) return;
  const c = readLS();
  c[id] = { msg, ts: Date.now() };
  const entries = Object.entries(c);
  if (entries.length > LS_MAX) {
    entries.sort((a, b) => a[1].ts - b[1].ts);
    const trimmed = Object.fromEntries(entries.slice(-LS_MAX));
    writeLS(trimmed);
  } else {
    writeLS(c);
  }
}

function hydrateFromLS(id: string): FullMessage | null {
  const c = readLS();
  const hit = c[id];
  return hit ? hit.msg : null;
}

/**
 * Hard timeout for a single message-body fetch. Without this, a hung edge
 * function or stalled network leaves the viewer spinning forever — the
 * symptom Niki reported as "Email message not loading, refreshed multiple
 * times."
 */
// With server-side cache-first (gmail-messages :get reads from
// public.email_cache before hitting Nylas), the edge function returns in
// <200ms on cache hits. But a COLD open (no email_cache row) still has to
// cold-start the isolate and round-trip Nylas, which regularly exceeds 5s
// — that's the "gmail-messages get timed out after 5000ms" users hit.
//
// So: keep background prefetches on a short leash (they're best-effort and
// must not hog the queue), and give user-initiated opens a realistic
// ceiling with one automatic retry — the retry almost always lands on a
// warm isolate + populated cache.
const FETCH_TIMEOUT_MS = 20_000;
const PREFETCH_TIMEOUT_MS = 6_000;
const TIMEOUT_MARKER = '__gmail_fetch_timeout__';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const e = new Error(`${label} timed out after ${ms}ms`);
      (e as any)[TIMEOUT_MARKER] = true;
      reject(e);
    }, ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function rememberMessage(id: string, msg: FullMessage) {
  if (messageCache.has(id)) messageCache.delete(id);
  messageCache.set(id, msg);
  while (messageCache.size > MAX_CACHE) {
    const oldest = messageCache.keys().next().value;
    if (oldest === undefined) break;
    messageCache.delete(oldest);
  }
}

export function getCachedFullEmailMessage(messageId: string): FullMessage | null {
  if (!messageId) return null;
  const mem = messageCache.get(messageId);
  if (mem) return mem;
  // Promote from localStorage into the in-memory LRU on first access so
  // subsequent reads in this session are O(1).
  const ls = hydrateFromLS(messageId);
  if (ls) {
    messageCache.set(messageId, ls);
    return ls;
  }
  return null;
}

/**
 * Fire-and-forget prefetch for a message body. Safe to call on hover /
 * focus / render — multiple calls for the same id share a single fetch and
 * failures are swallowed silently.
 */
export function prefetchFullEmailMessage(messageId: string | undefined): void {
  if (!messageId || messageId.startsWith('mock-')) return;
  if (messageCache.has(messageId)) return;
  if (inflight.has(messageId)) return;
  // Queue behind the concurrency limiter so a render burst (10+ rows) does
  // not fan out 10+ parallel edge-function invocations. We re-check the
  // cache / inflight map at dequeue time because a click on the same
  // message may have already kicked off (or completed) a fetch while we
  // were queued.
  //
  // IMPORTANT: do NOT wrap fetchFullEmailMessage with .catch() and
  // re-assign `inflight` here. fetchFullEmailMessage already manages its
  // own inflight de-dupe; wrapping it with `.catch(() => null)` and
  // overwriting the inflight entry used to poison the cache — a
  // subsequent click would await the wrapped promise and silently
  // receive `null`, rendering a blank message body with no error and
  // no spinner.
  prefetchQueue.push(() => {
    if (messageCache.has(messageId) || inflight.has(messageId)) {
      activePrefetches--;
      runNextPrefetch();
      notifyStatus();
      return;
    }
    fetchFullEmailMessage(messageId, { background: true })
      .catch(() => {
        /* swallow — this is a best-effort prefetch */
      })
      .finally(() => {
        activePrefetches--;
        runNextPrefetch();
        notifyStatus();
      });
  });
  runNextPrefetch();
  notifyStatus();
}

export async function fetchFullEmailMessage(
  messageId: string,
  opts?: { background?: boolean },
): Promise<FullMessage> {
  // De-dupe concurrent fetches for the same id (e.g. hover-prefetch + click).
  const existing = inflight.get(messageId);
  if (existing) return existing;

  const background = opts?.background === true;
  const timeoutMs = background ? PREFETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS;

  const p = (async () => {
  const invokeOnce = () =>
    withTimeout(
      supabase.functions.invoke('gmail-messages', {
        body: { action: 'get', message_id: messageId },
      }),
      timeoutMs,
      'gmail-messages get',
    );

  let resp: any;
  let err: any;
  try {
    ({ data: resp, error: err } = await invokeOnce());
  } catch (e: any) {
    // One automatic retry for user-initiated opens that timed out — the
    // first call typically warmed the isolate and populated email_cache.
    if (background || !e?.[TIMEOUT_MARKER]) {
      if (e?.[TIMEOUT_MARKER] && !background) {
        throw new Error('Message is taking longer than usual to load. Try again in a moment.');
      }
      throw e;
    }
    try {
      ({ data: resp, error: err } = await invokeOnce());
    } catch (e2: any) {
      if (e2?.[TIMEOUT_MARKER]) {
        throw new Error('Message is taking longer than usual to load. Try again in a moment.');
      }
      throw e2;
    }
  }

  // Soft fallback (transient rate-limit / 5xx / network blip). The edge
  // function returns HTTP 200 with `{ fallback: true, error_message }` in
  // this case so this branch is reachable WITHOUT `err` being set. We
  // surface the friendly message so the viewer renders an inline
  // "Message could not be loaded. Try again in a moment." + Retry instead
  // of crashing the page with an unhandled rejection.
  if (resp?.fallback) {
    const friendly =
      resp.error_message || 'Message could not be loaded. Try again in a moment.';
    throw new Error(friendly);
  }

  if (err) {
    // Some transient transport errors still come through as `err`; map any
    // recognizable rate-limit / unavailable signal to the same friendly
    // string so the user never sees raw "non-2xx" text.
    const raw = err.message || '';
    if (/non-2xx|rate.?limit|unavailable|429|503|502|504|timeout/i.test(raw)) {
      throw new Error('Message could not be loaded. Try again in a moment.');
    }
    throw new Error(raw || 'Failed to load message');
  }

  const m = resp?.message;
  if (!m) {
    throw new Error('Message could not be loaded. Try again in a moment.');
  }

    const out: FullMessage = {
    id: m.id || messageId,
    thread_id: m.thread_id || undefined,
    body_html: m.body_html || undefined,
    body_text: m.body_text || undefined,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    inline_attachments: Array.isArray(m.inline_attachments) ? m.inline_attachments : [],
  };
    rememberMessage(messageId, out);
    persistMessage(messageId, out);
    markFetchSuccess();
    return out;
  })();
  inflight.set(messageId, p);
  try {
    return await p;
  } catch (e) {
    if (!isTransientFetchError(e)) {
      markFetchFailure();
    }
    throw e;
  } finally {
    inflight.delete(messageId);
  }
}

export async function fetchFullEmailThread(threadId: string): Promise<FullThreadMessage[]> {
  const { data: resp, error: err } = await supabase.functions.invoke('gmail-messages', {
    body: { action: 'get_thread', thread_id: threadId },
  });

  if (err) {
    // Soft-fail: upstream 404 / transient errors shouldn't crash callers
    // (e.g. summarize, thread viewer). Return empty so callers can fall
    // back to whatever messages they already have in memory.
    console.warn('[fetchFullEmailThread] soft-fail', err?.message || err);
    return [];
  }

  if (resp?.fallback) {
    console.warn('[fetchFullEmailThread] fallback', resp?.error_message || resp?.error);
    return [];
  }

  const messages = Array.isArray(resp?.thread?.messages) ? resp.thread.messages : [];
  return messages.map((m: any) => ({
    id: m.id,
    thread_id: m.thread_id || threadId,
    subject: m.subject || undefined,
    from_name: m.from_name || undefined,
    from_email: m.from_email || undefined,
    received_at: m.received_at || undefined,
    body_html: m.body_html || undefined,
    body_text: m.body_text || undefined,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    inline_attachments: Array.isArray(m.inline_attachments) ? m.inline_attachments : [],
  }));
}

export function useFullEmailThread(
  threadId: string | undefined,
  enabled: boolean,
): { data: FullThreadMessage[] | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<FullThreadMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedThreadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !threadId) return;
    if (fetchedThreadRef.current === threadId) return;

    fetchedThreadRef.current = threadId;
    setLoading(true);

    fetchFullEmailThread(threadId)
      .then((messages) => {
        setData(messages);
        setError(null);
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to load thread');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [threadId, enabled]);

  return { data, loading, error };
}

/**
 * Lazy-load the full body + attachments for a real Gmail/Nylas message.
 *
 * Mock messages (id starts with "mock-") and messages already hydrated
 * (`alreadyLoaded === true`) are skipped.
 *
 * The fetch happens once `enabled` becomes true (typically when the
 * thread message is expanded), so we don't blow through Nylas quota
 * for collapsed messages the user never opens.
 */
export function useFullEmailMessage(
  messageId: string,
  enabled: boolean,
  alreadyLoaded: boolean,
): { data: FullMessage | null; loading: boolean; error: string | null; reload: () => void } {
  // Seed from the module cache so prefetched / previously-viewed messages
  // render their body on the first paint without a spinner.
  const cached = messageId ? getCachedFullEmailMessage(messageId) : null;
  const [data, setData] = useState<FullMessage | null>(cached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const fetchedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || alreadyLoaded) return;
    if (!messageId || messageId.startsWith('mock-')) return;

    // Cache hit — surface immediately, skip refetch (unless caller asked to
    // reload, in which case we always re-fetch from the network).
    const hit = reloadTick === 0 ? getCachedFullEmailMessage(messageId) : null;
    if (hit) {
      fetchedMessageRef.current = messageId;
      setData(hit);
      setError(null);
      setLoading(false);
      return;
    }

    if (reloadTick === 0 && fetchedMessageRef.current === messageId) return;

    fetchedMessageRef.current = messageId;
    setLoading(true);
    setError(null);

    // On manual reload, drop any cached or in-flight entry so we hit the
    // edge function fresh.
    if (reloadTick > 0) {
      messageCache.delete(messageId);
      inflight.delete(messageId);
    }

    fetchFullEmailMessage(messageId)
      .then((message) => {
        if (!message) {
          // Defensive — should not happen now that prefetch no longer
          // poisons the inflight cache, but guard anyway.
          setData(null);
          setError('Empty response from email service');
        } else {
          setData(message);
          setError(null);
        }
      })
      .catch((e: any) => {
        const msg = e?.message || 'Failed to load message';
        setError(msg);
        setData(null);
        // eslint-disable-next-line no-console
        console.warn('[email.load_failed]', { messageId, error: msg });
      })
      .finally(() => setLoading(false));
  }, [messageId, enabled, alreadyLoaded, reloadTick]);

  const reload = useCallback(() => {
    setReloadTick((n) => n + 1);
  }, []);

  return { data, loading, error, reload };
}

/**
 * Trigger a download for an attachment via the gmail-messages edge function.
 * Streams base64 back, then converts to a blob and forces a browser save.
 */
export async function downloadAttachment(
  messageId: string,
  attachment: EmailAttachment,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('gmail-messages', {
    body: {
      action: 'get_attachment',
      message_id: messageId,
      attachment_id: attachment.id,
    },
  });

  if (error || !data?.data) {
    throw new Error(error?.message || 'Failed to download attachment');
  }

  const binary = atob(data.data);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: data.content_type || attachment.content_type });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.filename || 'attachment';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetch a single attachment as a `data:` URL. Used to resolve inline `cid:`
 * image references in HTML email bodies — keeps the URL self-contained so
 * we don't leak blob URLs across React re-renders.
 */
export async function fetchAttachmentDataUrl(
  messageId: string,
  attachment: EmailAttachment,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('gmail-messages', {
      body: {
        action: 'get_attachment',
        message_id: messageId,
        attachment_id: attachment.id,
      },
    });
    if (error || !data?.data) return null;
    const ct = data.content_type || attachment.content_type || 'application/octet-stream';
    return `data:${ct};base64,${data.data}`;
  } catch {
    return null;
  }
}

/**
 * Open an attachment inline in a new browser tab when the type is viewable
 * (PDF, image, text). Falls back to a download for non-viewable types so the
 * user always gets the file in one click.
 */
export async function openAttachmentInNewTab(
  messageId: string,
  attachment: EmailAttachment,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('gmail-messages', {
    body: {
      action: 'get_attachment',
      message_id: messageId,
      attachment_id: attachment.id,
    },
  });
  if (error || !data?.data) {
    throw new Error(error?.message || 'Failed to open attachment');
  }
  const binary = atob(data.data);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const ct = data.content_type || attachment.content_type || 'application/octet-stream';
  const blob = new Blob([bytes], { type: ct });
  const url = URL.createObjectURL(blob);

  const viewable =
    ct.startsWith('image/') ||
    ct.includes('pdf') ||
    ct.startsWith('text/');

  if (viewable) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Pop-up blocked — fall back to a download so the user still gets the file.
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.filename || 'attachment';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
