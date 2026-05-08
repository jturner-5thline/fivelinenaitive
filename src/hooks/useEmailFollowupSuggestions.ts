import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { FollowupSuggestionInput } from '@/components/deal/email/SuggestedFollowupsCard';

interface Options {
  /** Pass the analyzed thread payload (same shape used by smart-email-ai). */
  threadData?: any;
  /** Currently linked deal id, if any. */
  dealId?: string | null;
  dealName?: string | null;
  /**
   * Gate. The hook ONLY fires when this is true — typically wired to
   * `!workflowLoading && !!workflowAnalysis` so suggestions never appear
   * during "Analyzing thread…".
   */
  enabled: boolean;
}

/**
 * useEmailFollowupSuggestions
 * ---------------------------
 * Calls the dedicated `detect-email-followups` edge function once the main
 * thread workflow analysis has completed. Returns structured follow-up
 * task suggestions (same shape `SuggestedFollowupsCard` already accepts)
 * plus loading / error state.
 *
 * Caches the last (threadId, latest message id) we ran for so we don't
 * re-fire the AI when the user toggles tabs in the sidebar.
 */
export function useEmailFollowupSuggestions({ threadData, dealId, dealName, enabled }: Options) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<FollowupSuggestionInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef<string | null>(null);

  const latest = threadData?.latestEmail
    || (Array.isArray(threadData?.emails) ? threadData.emails[threadData.emails.length - 1] : null);
  const messageId: string | undefined = latest?.gmail_message_id || latest?.id;
  const cacheKey = threadData?.threadId && messageId ? `${threadData.threadId}::${messageId}` : null;

  useEffect(() => {
    if (!enabled) return;
    if (!cacheKey) return;
    const key = `${cacheKey}::${dealId || 'no-deal'}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'detect-email-followups',
          {
            body: {
              threadData: {
                subject: threadData.subject,
                threadId: threadData.threadId,
                latestEmail: latest,
                emails: (threadData.emails || []).slice(-6),
              },
              emailData: latest,
              dealId: dealId || undefined,
              dealName: dealName || undefined,
              currentUserName:
                (user?.user_metadata as any)?.full_name
                || user?.email
                || undefined,
            },
          },
        );
        if (cancelled) return;
        if (fnError) {
          setError(fnError.message || 'failed');
          setSuggestions([]);
          return;
        }
        const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(list as FollowupSuggestionInput[]);
        if (data?.error) setError(String(data.error));
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'failed');
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, cacheKey, dealId, dealName, latest, threadData, user]);

  return { suggestions, loading, error };
}
