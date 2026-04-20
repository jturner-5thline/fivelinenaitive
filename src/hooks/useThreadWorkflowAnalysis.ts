import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import {
  PASS_REASON_LABELS,
  type LenderPassReasonCategory,
} from '@/hooks/useLenderDisqualifications';

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
    /** Master lender id when the firm is in the directory but not yet on the deal. */
    master_lender_id?: string;
    lender_name: string;
    new_stage: string;
    /** AI-suggested disposition detail (mirrors lenders-page taxonomy). */
    suggested_detail?: string;
    suggested_detail_confidence?: WorkflowConfidence;
    reason_note: string;
    confidence: WorkflowConfidence;
    ambiguity_flags?: string[];
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

function logEvent(event: string, payload: Record<string, unknown>) {
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...payload });
    window.dispatchEvent(new CustomEvent(event, { detail: payload }));
    // eslint-disable-next-line no-console
    console.debug('[useThreadWorkflowAnalysis]', event, payload);
  } catch { /* ignore */ }
}

function debugStep(step: string, payload: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.debug(`[useThreadWorkflowAnalysis] ${step}`, payload);
}

/**
 * Map a confirmed status to its underlying lender stage + tracking status.
 * "Passed" and "Not a Fit" both close the lender out, but with distinct
 * pass_reason context preserved in the disqualification + activity log.
 */
const STATUS_STAGE_MAP: Record<string, { stage: string; trackingStatus: string; closes: boolean }> = {
  passed:       { stage: 'passed',         trackingStatus: 'passed',  closes: true  },
  not_a_fit:    { stage: 'passed',         trackingStatus: 'passed',  closes: true  },
  declined:     { stage: 'passed',         trackingStatus: 'passed',  closes: true  },
  interested:   { stage: 'engaged',        trackingStatus: 'active',  closes: false },
  in_diligence: { stage: 'reviewing-drl',  trackingStatus: 'active',  closes: false },
  follow_up:    { stage: 'engaged',        trackingStatus: 'active',  closes: false },
};

/**
 * useThreadWorkflowAnalysis
 * --------------------------
 * Runs the Claude-backed `analyze_thread_workflow` action on the latest
 * inbound email of an open thread and returns structured workflow
 * intelligence (likely deal, likely lender firm, detected workflow signal,
 * confirm-first recommended update, supporting quote, nuance).
 *
 * Confirm flow follows a 4-step pattern shared with the lenders page:
 *   1. resolveDealAndLenderFromSuggestion()
 *   2. ensureLenderOnDeal()  — auto-creates the deal_lenders row if missing
 *   3. apply confirmed disposition (stage/tracking_status + pass_reason)
 *      + writes a lender_disqualifications row when status is passed/not_a_fit
 *      so reporting reuses the SAME taxonomy as the lenders modal.
 *   4. write activity_logs entry with full audit metadata.
 */
export function useThreadWorkflowAnalysis({
  dealId,
  threadData,
  autoRun = true,
}: UseThreadWorkflowAnalysisOptions) {
  const { user } = useAuth();
  const { refreshDeals } = useDealsContext();
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
      const result = r as WorkflowAnalysis;
      setAnalysis(result);

      // Fire prefill analytics event so we can track AI suggestion quality.
      const rec = result.recommended_update;
      if (rec && rec.kind !== 'none') {
        logEvent('ai_suggested_update_prefilled', {
          dealId: rec.deal_id || result.likely_deal.id,
          lenderId: rec.lender_id || null,
          masterLenderId: rec.master_lender_id || null,
          lenderName: rec.lender_name || null,
          aiSuggestedStatus: (rec.new_stage || '').toLowerCase(),
          aiSuggestedDetail: rec.suggested_detail || null,
          confidence: rec.confidence,
          ambiguityFlags: rec.ambiguity_flags || [],
        });
      }
    } catch (err: any) {
      console.warn('[useThreadWorkflowAnalysis] error:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [dealId, threadData, latestInbound, messageId]);

  // Auto-run on mount + when key inputs change.
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

  /**
   * Step 2 of the confirm flow: ensure a deal_lenders row exists for the
   * suggested firm. If one already exists for this deal+name (case-insensitive)
   * we reuse it; otherwise we create a new one via addLenderToDeal.
   * Returns the resolved deal_lender id, plus whether we created the row.
   */
  const ensureLenderOnDeal = useCallback(async (
    targetDealId: string,
    suggestedLenderId: string | undefined,
    masterLenderId: string | undefined,
    lenderName: string,
  ): Promise<{ dealLenderId: string; created: boolean } | null> => {
    if (suggestedLenderId) {
      return { dealLenderId: suggestedLenderId, created: false };
    }
    if (!lenderName && !masterLenderId) return null;

    logEvent('ai_suggested_update_autolink_started', {
      dealId: targetDealId,
      masterLenderId: masterLenderId || null,
      lenderName,
    });

    try {
      // Look up by case-insensitive name match against existing deal lenders
      // first — this avoids duplicates if the row exists but the AI didn't
      // pick it up (e.g. fuzzy spellings).
      const { data: existing } = await supabase
        .from('deal_lenders')
        .select('id, name')
        .eq('deal_id', targetDealId)
        .ilike('name', lenderName);
      const match = (existing || []).find((l: any) =>
        (l.name || '').trim().toLowerCase() === lenderName.trim().toLowerCase()
      );
      if (match?.id) {
        logEvent('ai_suggested_update_autolink_succeeded', {
          dealId: targetDealId,
          dealLenderId: match.id,
          relationshipCreated: false,
          source: 'name_match',
        });
        return { dealLenderId: match.id, created: false };
      }

      // Create the deal_lenders row.
      const created = await addLenderToDeal(targetDealId, {
        name: lenderName,
        stage: 'reviewing-drl',
      } as any);
      if (!created?.id) throw new Error('addLenderToDeal returned no id');

      // Best-effort: stamp master_lender_id so the link is canonical.
      if (masterLenderId) {
        await supabase
          .from('deal_lenders')
          .update({ master_lender_id: masterLenderId })
          .eq('id', created.id);
      }

      logEvent('ai_suggested_update_autolink_succeeded', {
        dealId: targetDealId,
        dealLenderId: created.id,
        masterLenderId: masterLenderId || null,
        relationshipCreated: true,
        source: 'auto_created',
      });
      return { dealLenderId: created.id, created: true };
    } catch (err: any) {
      logEvent('ai_suggested_update_autolink_failed', {
        dealId: targetDealId,
        masterLenderId: masterLenderId || null,
        lenderName,
        error: err?.message || String(err),
      });
      console.error('[ensureLenderOnDeal] failed:', err);
      return null;
    }
  }, [addLenderToDeal]);

  /**
   * Final confirm action. Accepts user-edited overrides (status, detail,
   * note). Runs resolve → ensureLenderOnDeal → apply → log in sequence and
   * surfaces success/failure to the UI.
   */
  const confirmRecommendation = useCallback(async (overrides?: {
    reasonNote?: string;
    confirmedStatus?: string;
    confirmedDetail?: string;
  }) => {
    if (!analysis || !user) return false;
    const rec = analysis.recommended_update;
    if (!rec || rec.kind === 'none') return false;

    setCommitting(true);
    try {
      // ── Step 1: resolveDealAndLenderFromSuggestion ─────────────────
      const targetDealId = rec.deal_id || dealId || analysis.likely_deal.id;
      if (!targetDealId) {
        toast.error('No deal identified — please link a deal first.');
        return false;
      }

      const reason = overrides?.reasonNote ?? rec.reason_note ?? analysis.signal.label;
      const aiSuggestedStatus = (rec.new_stage || '').toLowerCase();
      const finalStatus = (overrides?.confirmedStatus || aiSuggestedStatus || 'passed').toLowerCase();
      const aiSuggestedDetail = (rec.suggested_detail || '').toLowerCase();
      const finalDetail = (overrides?.confirmedDetail ?? aiSuggestedDetail).toLowerCase();
      const userOverrodeSuggestion =
        (!!overrides?.confirmedStatus && overrides.confirmedStatus.toLowerCase() !== aiSuggestedStatus) ||
        (overrides?.confirmedDetail !== undefined && overrides.confirmedDetail.toLowerCase() !== aiSuggestedDetail);

      let resolvedLenderId: string | null = rec.lender_id || null;
      let relationshipCreated = false;

      // ── Step 2: ensureLenderOnDeal (auto-link if needed) ───────────
      if (rec.kind === 'lender_status') {
        const lenderName = rec.lender_name || analysis.likely_lender_firm.name || '';
        const ensured = await ensureLenderOnDeal(
          targetDealId,
          rec.lender_id,
          rec.master_lender_id,
          lenderName,
        );
        if (!ensured) {
          toast.error(`Could not link ${lenderName || 'lender'} to this deal. Please add them manually and retry.`);
          return false;
        }
        resolvedLenderId = ensured.dealLenderId;
        relationshipCreated = ensured.created;
      }

      // ── Step 3: apply confirmed disposition ────────────────────────
      if (rec.kind === 'lender_status' && resolvedLenderId) {
        const mapped = STATUS_STAGE_MAP[finalStatus] || STATUS_STAGE_MAP.passed;
        const detailLabel = finalDetail && PASS_REASON_LABELS[finalDetail as LenderPassReasonCategory]
          ? PASS_REASON_LABELS[finalDetail as LenderPassReasonCategory]
          : null;
        const passReasonText = mapped.closes
          ? [
              finalStatus === 'not_a_fit' ? 'Not a fit' : finalStatus === 'declined' ? 'Declined' : 'Passed',
              detailLabel ? `(${detailLabel})` : null,
              reason ? `— ${reason}` : null,
            ].filter(Boolean).join(' ')
          : undefined;

        await updateLender(resolvedLenderId, {
          stage: mapped.stage,
          trackingStatus: mapped.trackingStatus,
          passReason: passReasonText,
        } as any);

        // Step 3b: persist disqualification using the SHARED taxonomy from
        // useLenderDisqualifications, so reporting and the lenders modal
        // stay aligned.
        if (mapped.closes && finalDetail && PASS_REASON_LABELS[finalDetail as LenderPassReasonCategory]) {
          await supabase.from('lender_disqualifications').insert({
            deal_id: targetDealId,
            deal_lender_id: resolvedLenderId,
            lender_name: rec.lender_name || analysis.likely_lender_firm.name || 'Lender',
            master_lender_id: rec.master_lender_id || null,
            disqualified_by: user.id,
            reason_category: finalDetail,
            reason_details: reason || null,
          });
        }
      }

      // ── Step 4: write activity log entry ───────────────────────────
      const sourceMessageId =
        latestInbound?.gmail_message_id || latestInbound?.id || messageId || null;
      await supabase.from('activity_logs').insert({
        deal_id: targetDealId,
        activity_type: rec.kind === 'lender_status' ? 'lender_update' : 'status_update',
        description: userOverrodeSuggestion
          ? `${rec.lender_name || 'Lender'} marked as ${finalStatus.replace('_', ' ')} (user override)`
          : (rec.title || `Lender update`).replace(/\?$/, ''),
        user_id: user.id,
        metadata: {
          source: 'ai_thread_workflow',
          signal_type: analysis.signal.type,
          signal_label: analysis.signal.label,
          supporting_quote: analysis.signal.supporting_quote,
          nuance: analysis.signal.nuance,
          ai_suggested_status: aiSuggestedStatus,
          final_confirmed_status: finalStatus,
          ai_suggested_detail: aiSuggestedDetail || null,
          final_confirmed_detail: finalDetail || null,
          user_overrode_suggestion: userOverrodeSuggestion,
          relationship_created: relationshipCreated,
          lender_id: resolvedLenderId,
          lender_name: rec.lender_name || null,
          master_lender_id: rec.master_lender_id || null,
          reason_note: reason,
          confidence: rec.confidence,
          ambiguity_flags: rec.ambiguity_flags || [],
          source_thread_id: threadData?.threadId || null,
          source_message_id: sourceMessageId,
        },
      });

      logEvent('ai_suggested_update_confirmed', {
        dealId: targetDealId,
        lenderId: resolvedLenderId,
        relationshipCreated,
        aiSuggestedStatus,
        aiSuggestedDetail: aiSuggestedDetail || null,
        finalConfirmedStatus: finalStatus,
        finalConfirmedDetail: finalDetail || null,
        userOverrodeSuggestion,
      });

      const successMsg = userOverrodeSuggestion
        ? `${rec.lender_name || 'Lender'} marked as ${finalStatus.replace('_', ' ')}`
        : (rec.title || 'Update applied').replace(/\?$/, '');
      toast.success(relationshipCreated
        ? `${successMsg} — lender auto-linked to deal`
        : successMsg);
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
  }, [analysis, user, dealId, updateLender, ensureLenderOnDeal, refreshDeals, dismiss, latestInbound, messageId, threadData]);

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
