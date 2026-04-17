import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EmailAttachment } from './mockEmailData';

interface FullMessage {
  body_html?: string;
  body_text?: string;
  attachments?: EmailAttachment[];
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
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled || alreadyLoaded || hasFetchedRef.current) return;
    if (!messageId || messageId.startsWith('mock-')) return;

    hasFetchedRef.current = true;
    setLoading(true);

    supabase.functions
      .invoke('gmail-messages', {
        body: { action: 'get', message_id: messageId },
      })
      .then(({ data: resp, error: err }) => {
        if (err) {
          setError(err.message || 'Failed to load message');
          setData(null);
          return;
        }
        const m = resp?.message;
        if (!m) {
          setError('No message returned');
          return;
        }
        setData({
          body_html: m.body_html || undefined,
          body_text: m.body_text || undefined,
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
        });
        setError(null);
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to load message');
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
