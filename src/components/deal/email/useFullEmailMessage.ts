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
 * Hard timeout for a single message-body fetch. Without this, a hung edge
 * function or stalled network leaves the viewer spinning forever — the
 * symptom Niki reported as "Email message not loading, refreshed multiple
 * times."
 */
const FETCH_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
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
  return messageCache.get(messageId) || null;
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
  // IMPORTANT: do NOT wrap with .catch() and re-assign `inflight` here.
  // fetchFullEmailMessage already manages its own inflight de-dupe; wrapping
  // it with `.catch(() => null)` and overwriting the inflight entry used to
  // poison the cache — a subsequent click would await the wrapped promise
  // and silently receive `null`, rendering a blank message body with no
  // error and no spinner.
  void fetchFullEmailMessage(messageId).catch(() => {
    /* swallow — this is a best-effort prefetch */
  });
}

export async function fetchFullEmailMessage(messageId: string): Promise<FullMessage> {
  // De-dupe concurrent fetches for the same id (e.g. hover-prefetch + click).
  const existing = inflight.get(messageId);
  if (existing) return existing;

  const p = (async () => {
  const { data: resp, error: err } = await withTimeout(
    supabase.functions.invoke('gmail-messages', {
      body: { action: 'get', message_id: messageId },
    }),
    FETCH_TIMEOUT_MS,
    'gmail-messages get',
  );

  if (err) {
    throw new Error(err.message || 'Failed to load message');
  }

  const m = resp?.message;
  if (!m) {
    throw new Error('No message returned');
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
    return out;
  })();
  inflight.set(messageId, p);
  try {
    return await p;
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
