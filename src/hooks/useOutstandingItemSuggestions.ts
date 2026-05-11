import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { OutstandingItem } from '@/hooks/useOutstandingItems';
import type { EmailAttachment, EmailThread } from '@/components/deal/email/mockEmailData';

/**
 * useOutstandingItemSuggestions
 * -----------------------------
 * Calls the `analyze-email-outstanding-items` edge function (Claude-backed)
 * to produce three confirm-first suggestion sets for an inbound email
 * matched to a deal:
 *   1. attachment_matches      → filename ↔ open item
 *   2. info_fulfillment_matches → email satisfies "Request X from Y"
 *   3. new_item_suggestions     → email mentions a NEW deliverable
 *
 * Per-(deal, message) results are cached in sessionStorage so re-opening
 * the same thread doesn't re-spend an AI call.
 *
 * Pure read hook — never writes. The card components own the confirm flow.
 */

export interface AiAttachmentMatch {
  item_id: string;
  filename: string;
  matched_on: string;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}
export interface AiInfoFulfillmentMatch {
  item_id: string;
  requested_from: string;
  supporting_quote: string;
  confidence: 'low' | 'medium' | 'high';
}
export interface AiNewItemSuggestion {
  description: string;
  due_date: string | null;
  source_quote: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  confidence: 'low' | 'medium' | 'high';
  /** When set, every suggestion sharing the same group_id was extracted
   *  from a single lender-request list and should render as ONE grouped
   *  approval card ("Add N items"). */
  group_id?: string | null;
  group_label?: string | null;
  group_size?: number | null;
  requested_by_contact_name?: string | null;
  requested_by_contact_email?: string | null;
  requested_by_lender_name?: string | null;
  source_thread_id?: string | null;
  source_message_id?: string | null;
}

export interface OutstandingItemAiResult {
  attachment_matches: AiAttachmentMatch[];
  info_fulfillment_matches: AiInfoFulfillmentMatch[];
  new_item_suggestions: AiNewItemSuggestion[];
}

const EMPTY: OutstandingItemAiResult = {
  attachment_matches: [],
  info_fulfillment_matches: [],
  new_item_suggestions: [],
};

const CACHE_PREFIX = 'naitive.outstandingItemAi.v1';

function readCache(key: string): OutstandingItemAiResult | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}::${key}`);
    return raw ? (JSON.parse(raw) as OutstandingItemAiResult) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, value: OutstandingItemAiResult) {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}::${key}`, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

interface Options {
  dealId?: string;
  dealName?: string;
  openItems: OutstandingItem[];
  attachments?: EmailAttachment[];
  thread?: EmailThread;
  /** Optional lender firm name for source attribution on extracted items. */
  lenderName?: string;
  /** Skip AI when false — useful when caller wants deterministic-only mode. */
  enabled?: boolean;
}

export function useOutstandingItemSuggestions({
  dealId,
  dealName,
  openItems,
  attachments,
  thread,
  lenderName,
  enabled = true,
}: Options) {
  const [result, setResult] = useState<OutstandingItemAiResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef<string | null>(null);

  const messageId =
    thread?.latestEmail?.id ||
    (thread?.latestEmail as any)?.gmail_message_id ||
    null;

  const cacheKey = useMemo(() => {
    if (!dealId || !messageId) return null;
    // Bust the cache when the open-item set changes so the AI re-evaluates
    // after the user adds/edits items between opens.
    const itemsSig = openItems.map((i) => i.id).sort().join(',');
    const attSig = (attachments || []).map((a) => a.id || a.filename || '').sort().join(',');
    return `${dealId}::${messageId}::${itemsSig}::${attSig}::${lenderName || ''}`;
  }, [dealId, messageId, openItems, attachments, lenderName]);

  useEffect(() => {
    if (!enabled) {
      setResult(EMPTY);
      return;
    }
    if (!dealId || !thread || !messageId || !cacheKey) {
      setResult(EMPTY);
      return;
    }
    if (openItems.length === 0 && (!attachments || attachments.length === 0)) {
      // Nothing for the AI to chew on (no items AND no attachments) — but
      // we may still want NEW ITEM suggestions from the body even with no
      // open items. Allow the call when there is at least an email body.
      const body = thread.latestEmail?.body_preview || thread.latestEmail?.snippet || '';
      if (!body || body.length < 40) {
        setResult(EMPTY);
        return;
      }
    }
    if (lastKey.current === cacheKey) return;
    lastKey.current = cacheKey;

    const cached = readCache(cacheKey);
    if (cached) {
      setResult(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          'analyze-email-outstanding-items',
          {
            body: {
              dealId,
              dealName,
              lenderName: lenderName || undefined,
              openItems: openItems.map((i) => ({ id: i.id, text: i.text })),
              attachments: (attachments || [])
                .filter((a) => !a.is_inline && a.filename)
                .map((a) => ({ id: a.id, filename: a.filename, size: a.size })),
              email: {
                threadId: thread.threadId,
                messageId,
                subject: thread.subject || thread.latestEmail?.subject,
                fromName: thread.latestEmail?.from_name,
                fromEmail: thread.latestEmail?.from_email,
                receivedAt: thread.latestEmail?.received_at,
                bodyPreview:
                  thread.latestEmail?.body_preview ||
                  thread.latestEmail?.snippet ||
                  '',
              },
            },
          },
        );
        if (cancelled) return;
        if (error || !data?.success) {
          console.warn('[useOutstandingItemSuggestions] error:', error || data?.error);
          setResult(EMPTY);
          return;
        }
        const r = (data.result || EMPTY) as OutstandingItemAiResult;
        writeCache(cacheKey, r);
        setResult(r);
      } catch (err) {
        console.warn('[useOutstandingItemSuggestions] threw:', err);
        if (!cancelled) setResult(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, dealId, dealName, cacheKey, thread, messageId, openItems, attachments]);

  return { result, loading };
}
