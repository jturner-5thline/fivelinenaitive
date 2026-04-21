import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
  console.info(`[useThreadWorkflowAnalysis] ${step}`, payload);
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

type DealLenderInsert = Database['public']['Tables']['deal_lenders']['Insert'];
type DealLenderUpdate = Database['public']['Tables']['deal_lenders']['Update'];
type LenderDisqualificationInsert = Database['public']['Tables']['lender_disqualifications']['Insert'];

const normalizeFirmName = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/\.[a-z]{2,}(\/.*)?$/i, '')
    .replace(/&/g, 'and')
    .replace(/\b(cap|capital|partners|partner|management|mgmt|llc|inc|corp|corporation|co|company|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const getEmailDomain = (value: string | null | undefined) => {
  const email = (value || '').toLowerCase();
  const domain = email.includes('@') ? email.split('@').pop() : email;
  return (domain || '').replace(/^www\./, '').trim() || null;
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
  const queryClient = useQueryClient();
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<DismissalState>(() => readDismissed());
  const lastRunKey = useRef<string | null>(null);
  // Resolved associations from the actual database — these are the source
  // of truth for the "thread linked?" and "lender on deal?" warnings.
  // We cannot rely on the parent prop `dealId` because the inbox dialog
  // passes an empty string, even when the thread is in fact linked
  // (linkage lives in the `deal_emails` join table, keyed by
  // gmail_message_id). Likewise, the AI's `rec.lender_id` is sometimes
  // null even when the lender is already on the deal.
  const [isThreadLinkedToDeal, setIsThreadLinkedToDeal] = useState<boolean | null>(null);
  const [resolvedDealLenderId, setResolvedDealLenderId] = useState<string | null>(null);
  const [isLenderOnDeal, setIsLenderOnDeal] = useState<boolean | null>(null);

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

  // Source-of-truth association resolver. Runs whenever the analysis or
  // thread changes. Reads from the same persisted tables that power the
  // inbox "linked deal" chip and the deal-detail Lenders tab so both
  // surfaces agree on what's already linked.
  useEffect(() => {
    let cancelled = false;
    const rec = analysis?.recommended_update;
    const targetDealId = rec?.deal_id || analysis?.likely_deal?.id || dealId || null;
    const lenderName = (rec?.lender_name || analysis?.likely_lender_firm?.name || '').trim();
    const threadId = threadData?.threadId || null;
    const threadMessageIds: string[] = (threadData?.emails || [])
      .map((e: any) => e?.gmail_message_id || e?.id)
      .filter(Boolean);

    if (!targetDealId) {
      setIsThreadLinkedToDeal(null);
      setIsLenderOnDeal(null);
      setResolvedDealLenderId(null);
      return;
    }

    (async () => {
      // 1. Thread→deal link: any message in this thread (or the parent-passed
      //    dealId already matching) counts as a persisted association.
      let threadLinked = !!dealId && dealId === targetDealId;
      if (!threadLinked && threadMessageIds.length > 0) {
        const { data: linkedRows } = await supabase
          .from('deal_emails')
          .select('id, deal_id, gmail_message_id')
          .eq('deal_id', targetDealId)
          .in('gmail_message_id', threadMessageIds)
          .limit(1);
        threadLinked = !!(linkedRows && linkedRows.length > 0);
      }

      // 2. Lender on deal: prefer master_lender_id match (canonical), fall
      //    back to case-insensitive name match. Both mirror how the
      //    deal-detail Lenders tab dedupes.
      let dealLenderId: string | null = rec?.lender_id || null;
      if (!dealLenderId && lenderName) {
        const { data: nameMatches } = await supabase
          .from('deal_lenders')
          .select('id, name')
          .eq('deal_id', targetDealId)
          .ilike('name', lenderName);
        const exact = (nameMatches || []).find(
          (l: any) => (l.name || '').trim().toLowerCase() === lenderName.toLowerCase(),
        );
        // If no exact match, try a fuzzier prefix match ("Advantage" ↔ "Advantage Capital").
        const fuzzy = exact
          || (nameMatches || []).find((l: any) => {
            const ln = (l.name || '').trim().toLowerCase();
            const target = lenderName.toLowerCase();
            return ln.startsWith(target) || target.startsWith(ln);
          });
        dealLenderId = fuzzy?.id || null;
      }

      if (cancelled) return;
      setIsThreadLinkedToDeal(threadLinked);
      setIsLenderOnDeal(!!dealLenderId);
      setResolvedDealLenderId(dealLenderId);

      // Temporary diagnostic logging — remove after verification on the
      // SoLo Funds / Advantage Capital thread.
      // eslint-disable-next-line no-console
      console.debug('[useThreadWorkflowAnalysis] association resolution', {
        threadId,
        parentDealIdProp: dealId || null,
        recDealId: rec?.deal_id || null,
        likelyDealId: analysis?.likely_deal?.id || null,
        targetDealId,
        recLenderId: rec?.lender_id || null,
        lenderNameLookup: lenderName || null,
        resolvedDealLenderId: dealLenderId,
        isThreadLinkedToDeal: threadLinked,
        isLenderOnDeal: !!dealLenderId,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [analysis, dealId, threadData]);

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
    debugStep('ensureLenderOnDeal:start', {
      targetDealId,
      suggestedLenderId: suggestedLenderId || null,
      masterLenderId: masterLenderId || null,
      lenderName: lenderName || null,
    });

    if (suggestedLenderId) {
      const { data: existingLinked, error: existingLinkedError } = await supabase
        .from('deal_lenders')
        .select('id, deal_id, name')
        .eq('id', suggestedLenderId)
        .eq('deal_id', targetDealId)
        .maybeSingle();

      if (existingLinkedError) {
        debugStep('ensureLenderOnDeal:existing-linked-error', {
          targetDealId,
          suggestedLenderId,
          error: existingLinkedError.message,
        });
      }

      if (existingLinked?.id) {
        debugStep('ensureLenderOnDeal:existing-linked-success', {
          targetDealId,
          dealLenderId: existingLinked.id,
          lenderName: existingLinked.name,
        });
        return { dealLenderId: existingLinked.id, created: false };
      }
    }

    let resolvedLenderName = lenderName?.trim() || '';
    if (!resolvedLenderName && masterLenderId) {
      const { data: masterLender, error: masterLenderError } = await supabase
        .from('master_lenders')
        .select('id, name')
        .eq('id', masterLenderId)
        .maybeSingle();

      if (masterLenderError) {
        debugStep('ensureLenderOnDeal:master-lender-lookup-error', {
          masterLenderId,
          error: masterLenderError.message,
        });
      }

      resolvedLenderName = masterLender?.name?.trim() || resolvedLenderName;
    }

    if (!resolvedLenderName) return null;

    logEvent('ai_suggested_update_autolink_started', {
      dealId: targetDealId,
      masterLenderId: masterLenderId || null,
      lenderName: resolvedLenderName,
    });

    try {
      const { data: existing, error: existingError } = await supabase
        .from('deal_lenders')
        .select('id, name, deal_id')
        .eq('deal_id', targetDealId)
        .ilike('name', resolvedLenderName);

      if (existingError) throw existingError;

      const match = (existing || []).find((l: any) =>
        (l.name || '').trim().toLowerCase() === resolvedLenderName.toLowerCase()
      );

      if (match?.id) {
        debugStep('ensureLenderOnDeal:name-match-success', {
          targetDealId,
          dealLenderId: match.id,
          lenderName: match.name,
        });
        logEvent('ai_suggested_update_autolink_succeeded', {
          dealId: targetDealId,
          dealLenderId: match.id,
          relationshipCreated: false,
          source: 'name_match',
        });
        return { dealLenderId: match.id, created: false };
      }

      const insertPayload: DealLenderInsert = {
        deal_id: targetDealId,
        name: resolvedLenderName,
        stage: 'reviewing-drl',
        tracking_status: 'active',
        notes: null,
      };
      debugStep('ensureLenderOnDeal:create-attempt', { insertPayload, masterLenderId: masterLenderId || null });

      const { data: created, error: createError } = await supabase
        .from('deal_lenders')
        .insert(insertPayload)
        .select('id, deal_id, name')
        .single();

      if (createError) throw createError;
      if (!created?.id) throw new Error('Failed to create lender relationship');

      debugStep('ensureLenderOnDeal:create-success', {
        targetDealId,
        dealLenderId: created.id,
        lenderName: created.name,
        relationshipCreated: true,
      });

      logEvent('ai_suggested_update_autolink_succeeded', {
        dealId: targetDealId,
        dealLenderId: created.id,
        masterLenderId: masterLenderId || null,
        relationshipCreated: true,
        source: 'auto_created',
      });
      return { dealLenderId: created.id, created: true };
    } catch (err: any) {
      debugStep('ensureLenderOnDeal:error', {
        targetDealId,
        masterLenderId: masterLenderId || null,
        lenderName: resolvedLenderName || null,
        error: err?.message || String(err),
      });
      logEvent('ai_suggested_update_autolink_failed', {
        dealId: targetDealId,
        masterLenderId: masterLenderId || null,
        lenderName: resolvedLenderName,
        error: err?.message || String(err),
      });
      console.error('[ensureLenderOnDeal] failed:', err);
      return null;
    }
  }, []);

  /**
   * Final confirm action. Accepts user-edited overrides (status, detail,
   * note). Runs resolve → ensureLenderOnDeal → apply → log in sequence and
   * surfaces success/failure to the UI.
   */
  const confirmRecommendation = useCallback(async (overrides?: {
    reasonNote?: string;
    confirmedStatus?: string;
    /** Comma-joined label string saved into deal_lenders.pass_reason. */
    confirmedDetail?: string;
    /** Multi-select array of label strings — one disqualification row per label. */
    confirmedDetailLabels?: string[];
  }) => {
    if (!analysis || !user) return false;
    const rec = analysis.recommended_update;
    if (!rec || rec.kind === 'none') return false;

    setCommitting(true);
    let currentStep = 'resolveDealAndLenderFromSuggestion';
    try {
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
      // Multi-select labels (preferred). Falls back to splitting confirmedDetail
      // by commas for back-compat with the legacy single-value path.
      const finalDetailLabels: string[] = (overrides?.confirmedDetailLabels && overrides.confirmedDetailLabels.length > 0)
        ? overrides.confirmedDetailLabels
        : (overrides?.confirmedDetail
            ? overrides.confirmedDetail.split(',').map((s) => s.trim()).filter(Boolean)
            : []);
      const userOverrodeSuggestion =
        (!!overrides?.confirmedStatus && overrides.confirmedStatus.toLowerCase() !== aiSuggestedStatus) ||
        (overrides?.confirmedDetail !== undefined && overrides.confirmedDetail.toLowerCase() !== aiSuggestedDetail);

      debugStep('resolveDealAndLenderFromSuggestion:success', {
        targetDealId,
        suggestedDealId: rec.deal_id || null,
        suggestedLenderId: rec.lender_id || null,
        suggestedMasterLenderId: rec.master_lender_id || null,
        lenderName: rec.lender_name || analysis.likely_lender_firm.name || null,
        aiSuggestedStatus,
        aiSuggestedDetail: aiSuggestedDetail || null,
        finalStatus,
        finalDetail: finalDetail || null,
      });

      let resolvedLenderId: string | null = rec.lender_id || null;
      let relationshipCreated = false;

      if (rec.kind === 'lender_status') {
        currentStep = 'ensureLenderOnDeal';
        const lenderName = rec.lender_name || analysis.likely_lender_firm.name || '';
        // CRITICAL: ignore the AI's `rec.lender_id` if it does NOT belong to
        // the resolved target deal. The AI sometimes returns a deal_lenders
        // id from a different deal that has the same lender (e.g. "Advantage
        // Capital" appears on 18 different deals). Passing that id through
        // would either no-op or, worse, flip the wrong row.
        let safeSuggestedLenderId: string | undefined = rec.lender_id || undefined;
        if (safeSuggestedLenderId) {
          const { data: belongs } = await supabase
            .from('deal_lenders')
            .select('id, deal_id')
            .eq('id', safeSuggestedLenderId)
            .maybeSingle();
          if (!belongs || belongs.deal_id !== targetDealId) {
            debugStep('confirmRecommendation:rejecting-cross-deal-lender-id', {
              suggestedLenderId: safeSuggestedLenderId,
              suggestedLenderActualDealId: belongs?.deal_id || null,
              targetDealId,
            });
            safeSuggestedLenderId = undefined;
          }
        }
        // Prefer the DB-backed resolver result (already scoped to the right
        // deal by the useEffect above). Fallback to ensureLenderOnDeal which
        // re-runs the same name lookup as a safety net.
        if (!safeSuggestedLenderId && resolvedDealLenderId) {
          // Verify the resolver-cached id is still pointed at THIS deal
          // (analysis can change between auto-runs).
          const { data: cached } = await supabase
            .from('deal_lenders')
            .select('id, deal_id, name')
            .eq('id', resolvedDealLenderId)
            .eq('deal_id', targetDealId)
            .maybeSingle();
          if (cached?.id) safeSuggestedLenderId = cached.id;
        }
        const ensured = await ensureLenderOnDeal(
          targetDealId,
          safeSuggestedLenderId,
          rec.master_lender_id,
          lenderName,
        );
        if (!ensured) {
          toast.error(`Could not link ${lenderName || 'lender'} to this deal. Please add them manually and retry.`);
          return false;
        }
        resolvedLenderId = ensured.dealLenderId;
        relationshipCreated = ensured.created;
        debugStep('ensureLenderOnDeal:resolved', {
          targetDealId,
          dealLenderId: resolvedLenderId,
          relationshipCreated,
          masterLenderId: rec.master_lender_id || null,
        });
      }

      if (rec.kind === 'lender_status' && resolvedLenderId) {
        currentStep = 'applyDisposition';
        const mapped = STATUS_STAGE_MAP[finalStatus] || STATUS_STAGE_MAP.passed;
        // Mirror the deal-detail "Confirm Pass" dialog: store the joined
        // human labels directly into deal_lenders.pass_reason. This keeps
        // both surfaces interoperable.
        const joinedLabels = finalDetailLabels.join(', ');
        const passReasonText = mapped.closes
          ? (joinedLabels
              || (finalDetail && PASS_REASON_LABELS[finalDetail as LenderPassReasonCategory]
                ? PASS_REASON_LABELS[finalDetail as LenderPassReasonCategory]
                : null)
              || (finalStatus === 'not_a_fit' ? 'Not a fit' : finalStatus === 'declined' ? 'Declined' : 'Passed'))
          : undefined;

        const lenderUpdatePayload: DealLenderUpdate = {
          stage: mapped.stage,
          tracking_status: mapped.trackingStatus,
          pass_reason: passReasonText ?? null,
          updated_at: new Date().toISOString(),
        };
        debugStep('applyDisposition:update-attempt', {
          dealLenderId: resolvedLenderId,
          lenderUpdatePayload,
        });

        const { data: updatedLender, error: updateError } = await supabase
          .from('deal_lenders')
          .update(lenderUpdatePayload)
          .eq('id', resolvedLenderId)
          .eq('deal_id', targetDealId)
          .select('id, deal_id, name, stage, tracking_status, pass_reason')
          .maybeSingle();

        if (updateError) throw updateError;
        if (!updatedLender?.id) throw new Error('Disposition update did not persist');

        debugStep('applyDisposition:update-success', {
          dealLenderId: updatedLender.id,
          dealId: updatedLender.deal_id,
          lenderName: updatedLender.name,
          stage: updatedLender.stage,
          trackingStatus: updatedLender.tracking_status,
          passReason: updatedLender.pass_reason,
        });

        // READ-BACK VERIFICATION: re-query the row independently and assert
        // the new state actually persisted. Catches RLS-silenced updates
        // and any race where the update returned a stale projection.
        const { data: verifyRow, error: verifyError } = await supabase
          .from('deal_lenders')
          .select('id, deal_id, stage, tracking_status, pass_reason')
          .eq('id', resolvedLenderId)
          .eq('deal_id', targetDealId)
          .maybeSingle();
        debugStep('applyDisposition:read-back', {
          dealLenderId: resolvedLenderId,
          targetDealId,
          verifyError: verifyError?.message || null,
          verifyRow,
          expectedStage: mapped.stage,
          expectedTrackingStatus: mapped.trackingStatus,
        });
        if (verifyError) throw verifyError;
        if (!verifyRow) {
          throw new Error(
            `Read-back failed — could not find deal_lenders row id=${resolvedLenderId} on deal_id=${targetDealId}. ` +
            `The update may have been blocked by RLS or the row was deleted.`,
          );
        }
        if (verifyRow.stage !== mapped.stage || verifyRow.tracking_status !== mapped.trackingStatus) {
          throw new Error(
            `Read-back mismatch on deal_lenders ${resolvedLenderId}: expected stage="${mapped.stage}"/tracking="${mapped.trackingStatus}" ` +
            `but found stage="${verifyRow.stage}"/tracking="${verifyRow.tracking_status}". Update did not apply.`,
          );
        }

        // Insert one lender_disqualifications row per selected reason label.
        // We map labels back to the LenderPassReasonCategory enum (best-effort
        // keyword match); unmapped labels fall back to 'other' with the label
        // preserved in reason_details so reporting still works.
        if (mapped.closes && finalDetailLabels.length > 0) {
          const labelToCategory = (label: string): LenderPassReasonCategory => {
            const l = label.toLowerCase();
            if (/(deal\s*size|size|too\s*small|too\s*big|check\s*size)/.test(l)) return 'deal_size_mismatch';
            if (/(industry|sector|vertical)/.test(l)) return 'industry_exclusion';
            if (/(geograph|location|region|state|country)/.test(l)) return 'geographic_restriction';
            if (/(risk|credit|leverage|burn|profitab|concentration)/.test(l)) return 'risk_profile_concerns';
            if (/(timing|capacity|year[- ]end|paused)/.test(l)) return 'timing_issues';
            if (/(relationship|conflict)/.test(l)) return 'relationship_issues';
            if (/(terms|pricing|structure|rate|covenant)/.test(l)) return 'terms_mismatch';
            return 'other';
          };

          const rows: LenderDisqualificationInsert[] = finalDetailLabels.map((label) => ({
            deal_id: targetDealId,
            deal_lender_id: resolvedLenderId,
            lender_name: rec.lender_name || analysis.likely_lender_firm.name || 'Lender',
            master_lender_id: rec.master_lender_id || null,
            disqualified_by: user.id,
            reason_category: labelToCategory(label),
            reason_details: [label, reason].filter(Boolean).join(' — ') || null,
          }));

          debugStep('applyDisposition:disqualification-attempt', { rowCount: rows.length, rows });

          const { error: disqualificationError } = await supabase
            .from('lender_disqualifications')
            .insert(rows);

          if (disqualificationError) throw disqualificationError;
          debugStep('applyDisposition:disqualification-success', {
            dealId: targetDealId,
            dealLenderId: resolvedLenderId,
            labels: finalDetailLabels,
          });
        }
      }

      currentStep = 'writeActivityLog';
      const sourceMessageId =
        latestInbound?.gmail_message_id || latestInbound?.id || messageId || null;
      const activityPayload = {
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
      };
      debugStep('writeActivityLog:attempt', activityPayload);

      const { data: activityRow, error: activityError } = await supabase
        .from('activity_logs')
        .insert(activityPayload)
        .select('id')
        .single();

      if (activityError) throw activityError;
      debugStep('writeActivityLog:success', {
        activityLogId: activityRow.id,
        dealId: targetDealId,
        dealLenderId: resolvedLenderId,
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
      currentStep = 'finalUIRefresh';
      await refreshDeals();
      // Broadcast a deal-scoped refresh event so any open DealDetail page or
      // Lenders tab can re-fetch its local state without a full reload.
      try {
        window.dispatchEvent(
          new CustomEvent('deal:lender-updated', {
            detail: {
              dealId: targetDealId,
              dealLenderId: resolvedLenderId,
              source: 'ai_thread_workflow',
            },
          }),
        );
      } catch { /* ignore */ }
      debugStep('finalUIRefresh:success', {
        dealId: targetDealId,
        dealLenderId: resolvedLenderId,
      });
      return true;
    } catch (err: any) {
      console.error(`confirmRecommendation error during ${currentStep}:`, err);
      debugStep(`${currentStep}:error`, { error: err?.message || String(err) });
      toast.error(err?.message ? `Confirm failed at ${currentStep}: ${err.message}` : `Confirm failed at ${currentStep}`);
      return false;
    } finally {
      setCommitting(false);
    }
  }, [analysis, user, dealId, ensureLenderOnDeal, refreshDeals, dismiss, latestInbound, messageId, threadData, resolvedDealLenderId]);

  return {
    analysis,
    loading,
    committing,
    isDismissed,
    run,
    dismiss,
    confirmRecommendation,
    // Persisted association state — UI uses these to gate warnings.
    isThreadLinkedToDeal,
    isLenderOnDeal,
    resolvedDealLenderId,
  };
}
