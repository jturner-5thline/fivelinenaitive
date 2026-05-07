import { useEffect, useRef, useState } from 'react';
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

export async function fetchFullEmailMessage(messageId: string): Promise<FullMessage> {
  const { data: resp, error: err } = await supabase.functions.invoke('gmail-messages', {
    body: { action: 'get', message_id: messageId },
  });

  if (err) {
    throw new Error(err.message || 'Failed to load message');
  }

  const m = resp?.message;
  if (!m) {
    throw new Error('No message returned');
  }

  return {
    id: m.id || messageId,
    thread_id: m.thread_id || undefined,
    body_html: m.body_html || undefined,
    body_text: m.body_text || undefined,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    inline_attachments: Array.isArray(m.inline_attachments) ? m.inline_attachments : [],
  };
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
): { data: FullMessage | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<FullMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || alreadyLoaded) return;
    if (!messageId || messageId.startsWith('mock-')) return;
    if (fetchedMessageRef.current === messageId) return;

    fetchedMessageRef.current = messageId;
    setLoading(true);

    fetchFullEmailMessage(messageId)
      .then((message) => {
        setData(message);
        setError(null);
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to load message');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [messageId, enabled, alreadyLoaded]);

  return { data, loading, error };
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
