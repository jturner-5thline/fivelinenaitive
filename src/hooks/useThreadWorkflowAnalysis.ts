import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';

export type WorkflowConfidence = 'low' | 'medium' | 'high';
export type WorkflowSignalType =
  | 'terms_issued'
  | 'lender_pass'
  | 'not_a_fit'
  | 'info_request'
  | 'meeting_request'
  | 'positive_interest'
  | 'diligence_question'
  | 'access_issue'
  | 'internal_note'
  | 'no_signal';

export interface WorkflowAnalysis {
  likely_deal: { id: string; name: string; confidence: WorkflowConfidence; reasoning: string };
  likely_contact: { name: string; email: string; confidence: WorkflowConfidence };
  likely_lender_firm: { id: string; name: string; confidence: WorkflowConfidence; reasoning: string };
  signal: {
    type: WorkflowSignalType;
    label: string;
    confidence: WorkflowConfidence;
    supporting_quote: string;
    nuance: string;
  };
  recommended_update: {
    kind: 'deal_stage' | 'lender_status' | 'none';
    title: string;
    deal_id: string;
    deal_name: string;
    lender_id: string;
    lender_name: string;
    new_stage: string;
    reason_note: string;
    confidence: WorkflowConfidence;
  };
  secondary_action: {
    kind: 'draft_reply' | 'log_activity' | 'none';
    title: string;
    details: string;
  };
}

interface UseThreadWorkflowAnalysisOptions {
  /** Currently linked deal id, if any. */
  dealId?: string;
  threadData?: any;
  /** When true, runs the analyzer on mount and whenever inputs change. */
  autoRun?: boolean;
}

type DismissalState = Record<string, true>;
const DISMISS_KEY = 'naitive.threadWorkflow.dismissed';

function readDismissed(): DismissalState {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeDismissed(state: DismissalState) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * useThreadWorkflowAnalysis
 * --------------------------
 * Runs the Claude-backed `analyze_thread_workflow` action on the latest inbound
 * email of an open thread and returns structured workflow intelligence
 * (likely deal, likely lender contact + firm, detected workflow signal,
 * confirm-first recommended update, supporting quote, nuance).
 *
 * The hook also exposes a confirm handler that writes back the suggested
 * update through existing Naitive workflow models (lender stage update for
 * `lender_status` recommendations) and an audit row in `activity_logs`.
 *
 * Confirm/dismiss decisions are cached per (thread, latest message) so
 * the suggestion does not re-prompt after the user has acted on it.
 */
export function useThreadWorkflowAnalysis({
  dealId,
  threadData,
  autoRun = true,
}: UseThreadWorkflowAnalysisOptions) {
  const { user } = useAuth();
  const { updateLender, refreshDeals } = useDealsContext();
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<DismissalState>(() => readDismissed());
  const lastRunKey = useRef<string | null>(null);

  // The latest inbound message anchors caching + dismissal.
  const latestInbound =
    threadData?.emails?.find?.((e: any) => e.from_name !== 'You') || threadData?.latestEmail;
  const messageId: string | undefined = latestInbound?.gmail_message_id || latestInbound?.id;
  const cacheKey = threadData?.threadId && messageId ? `${threadData.threadId}::${messageId}` : null;
  const isDismissed = cacheKey ? !!dismissedKeys[cacheKey] : false;

  const run = useCallback(async () => {
    if (!threadData || !latestInbound || !messageId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-email-ai', {
        body: {
          action: 'analyze_thread_workflow',
          dealId: dealId || undefined,
          emailData: {
            gmail_message_id: messageId,
            id: messageId,
            from_name: latestInbound.from_name,
            from_email: latestInbound.from_email,
            subject: latestInbound.subject,
            body_preview: latestInbound.body_preview,
            received_at: latestInbound.received_at,
          },
          threadData: {
            subject: threadData.subject,
            threadId: threadData.threadId,
            latestEmail: latestInbound,
            emails: (threadData.emails || []).slice(0, 6),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const r = data?.result as WorkflowAnalysis | { raw?: string } | undefined;
      if (!r || (r as any).raw) throw new Error('Invalid workflow analysis response');
      setAnalysis(r as WorkflowAnalysis);
    } catch (err: any) {
      console.warn('[useThreadWorkflowAnalysis] error:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [dealId, threadData, latestInbound, messageId]);

  // Auto-run on mount + when key inputs change. Re-runs when the linked
  // deal id changes so we can refine the analysis with deal context.
  useEffect(() => {
    if (!autoRun) return;
    if (!cacheKey) return;
    const key = `${cacheKey}::${dealId || 'no-deal'}`;
    if (lastRunKey.current === key) return;
    lastRunKey.current = key;
    run();
  }, [cacheKey, dealId, autoRun, run]);

  const dismiss = useCallback(() => {
    if (!cacheKey) return;
    const next = { ...dismissedKeys, [cacheKey]: true as const };
    setDismissedKeys(next);
    writeDismissed(next);
  }, [cacheKey, dismissedKeys]);

  const confirmRecommendation = useCallback(async (overrides?: {
    reasonNote?: string;
    confirmedStatus?: string;
  }) => {
    if (!analysis || !user) return false;
    const rec = analysis.recommended_update;
    if (!rec || rec.kind === 'none') return false;

    setCommitting(true);
    try {
      const targetDealId = rec.deal_id || dealId || analysis.likely_deal.id;
      if (!targetDealId) {
        toast.error('No deal identified — please link a deal first.');
        return false;
      }
      const reason = overrides?.reasonNote ?? rec.reason_note ?? analysis.signal.label;
      const aiSuggestedStatus = (rec.new_stage || '').toLowerCase();
      const finalStatus = (overrides?.confirmedStatus || aiSuggestedStatus || 'passed').toLowerCase();
      const userOverrodeSuggestion = !!overrides?.confirmedStatus
        && overrides.confirmedStatus.toLowerCase() !== aiSuggestedStatus;

      if (rec.kind === 'lender_status') {
        if (!rec.lender_id) {
          toast.error('Lender not matched on this deal — please confirm the lender first.');
          return false;
        }
        // Map the user-confirmed status onto known lender stages used by
        // updateLender. CRITICAL: "Not a Fit" and "Passed" are NOT collapsed
        // — both close the lender out, but with distinct pass_reason context
        // so reporting can tell them apart. Other statuses preserve their
        // semantic meaning (interest, diligence, follow-up).
        const stageMap: Record<string, { stage: string; trackingStatus: string; closes: boolean }> = {
          passed:       { stage: 'passed',         trackingStatus: 'passed',  closes: true  },
          not_a_fit:    { stage: 'passed',         trackingStatus: 'passed',  closes: true  },
          declined:     { stage: 'passed',         trackingStatus: 'passed',  closes: true  },
          interested:   { stage: 'engaged',        trackingStatus: 'active',  closes: false },
          in_diligence: { stage: 'reviewing-drl',  trackingStatus: 'active',  closes: false },
          follow_up:    { stage: 'engaged',        trackingStatus: 'active',  closes: false },
        };
        const mapped = stageMap[finalStatus] || stageMap.passed;
        const passReasonText = mapped.closes
          ? `${finalStatus === 'not_a_fit' ? 'Not a fit' : finalStatus === 'declined' ? 'Declined' : 'Passed'}: ${reason}`
          : undefined;

        await updateLender(rec.lender_id, {
          stage: mapped.stage,
          trackingStatus: mapped.trackingStatus,
          passReason: passReasonText,
        } as any);
      }

      // Always log the AI-suggested + user-confirmed action for auditability.
      const sourceMessageId =
        latestInbound?.gmail_message_id || latestInbound?.id || messageId || null;
      await supabase.from('activity_logs').insert({
        deal_id: targetDealId,
        activity_type: rec.kind === 'lender_status' ? 'lender_update' : 'status_update',
        description: userOverrodeSuggestion
          ? `${rec.lender_name || 'Lender'} marked as ${finalStatus.replace('_', ' ')} (user override)`
          : rec.title.replace(/\?$/, ''),
        user_id: user.id,
        metadata: {
          source: 'ai_thread_workflow',
          signal_type: analysis.signal.type,
          signal_label: analysis.signal.label,
          supporting_quote: analysis.signal.supporting_quote,
          nuance: analysis.signal.nuance,
          ai_suggested_status: aiSuggestedStatus,
          final_confirmed_status: finalStatus,
          user_overrode_suggestion: userOverrodeSuggestion,
          lender_id: rec.lender_id || null,
          lender_name: rec.lender_name || null,
          reason_note: reason,
          confidence: rec.confidence,
          source_thread_id: threadData?.threadId || null,
          source_message_id: sourceMessageId,
        },
      });

      const successMsg = userOverrodeSuggestion
        ? `${rec.lender_name || 'Lender'} marked as ${finalStatus.replace('_', ' ')}`
        : rec.title.replace(/\?$/, '');
      toast.success(successMsg);
      dismiss();
      await refreshDeals();
      return true;
    } catch (err: any) {
      console.error('confirmRecommendation error:', err);
      toast.error(err?.message || 'Failed to apply update');
      return false;
    } finally {
      setCommitting(false);
    }
  }, [analysis, user, dealId, updateLender, refreshDeals, dismiss, latestInbound, messageId, threadData]);

  return {
    analysis,
    loading,
    committing,
    isDismissed,
    run,
    dismiss,
    confirmRecommendation,
  };
}
