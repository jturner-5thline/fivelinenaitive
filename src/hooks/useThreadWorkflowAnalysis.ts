import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hasAuthSession } from '@/lib/ai/requireSession';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { type LenderPassReasonCategory } from '@/hooks/useLenderDisqualifications';
import {
  isNewsletterSender,
  hasListUnsubscribe,
  type HeaderMap,
} from '@/lib/newsletterSenderDetection';

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
  /**
   * Optional next-action task suggestions detected from the inbound email
   * (e.g. "send the due diligence list", "schedule a call"). Rendered as
   * confirm-first cards in the Suggested Updates list. Backend defaults
   * to [] when no clear next action is present.
   */
  suggested_tasks?: Array<{
    title: string;
    why: string;
    /**
     * Optional richer task body. Populated for call-commitment tasks with
     * the call context plus contact details (Cell / Office / Email)
     * extracted from the counterparty's signature. Falls back to `why`
     * when empty.
     */
    description?: string;
    task_type: 'follow_up' | 'call' | 'email' | 'review' | 'send_doc' | 'meeting' | 'general';
    /** Either an ISO date 'YYYY-MM-DD' or the literal 'next_business_day'. */
    due_date_hint: string;
    /** 'deal_manager' or a verbatim person name from the email. */
    assignee_hint: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    confidence: WorkflowConfidence;
  }>;
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
const CACHE_KEY = 'naitive.threadWorkflow.cache.v1';
const CACHE_MAX_ENTRIES = 200;

type CacheState = Record<string, { analysis: WorkflowAnalysis; savedAt: number }>;
const workflowAnalysisInflight = new Map<string, Promise<WorkflowAnalysis | null>>();

function readCache(): CacheState {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeCache(state: CacheState) {
  try {
    // Trim to most-recent N entries to keep localStorage small.
    const entries = Object.entries(state).sort(
      (a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0),
    );
    const trimmed: CacheState = {};
    for (const [k, v] of entries.slice(0, CACHE_MAX_ENTRIES)) trimmed[k] = v;
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function getThreadWorkflowCacheKey(threadData?: any, dealId?: string | null) {
  const latestInbound =
    threadData?.emails?.find?.((e: any) => e.from_name !== 'You') || threadData?.latestEmail;
  const messageId: string | undefined = latestInbound?.gmail_message_id || latestInbound?.id;
  if (!threadData?.threadId || !messageId) return null;
  return `${threadData.threadId}::${messageId}::${dealId || 'no-deal'}`;
}

export function getCachedThreadWorkflowAnalysis(threadData?: any, dealId?: string | null) {
  const key = getThreadWorkflowCacheKey(threadData, dealId);
  return key ? readCache()[key]?.analysis || null : null;
}

export async function preloadThreadWorkflowAnalysis({
  dealId,
  threadData,
  deals,
}: {
  dealId?: string | null;
  threadData?: any;
  deals?: any[];
}) {
  const latestInbound =
    threadData?.emails?.find?.((e: any) => e.from_name !== 'You') || threadData?.latestEmail;
  const messageId: string | undefined = latestInbound?.gmail_message_id || latestInbound?.id;
  const key = getThreadWorkflowCacheKey(threadData, dealId);
  if (!threadData || !latestInbound || !messageId || !key) return null;

  const cached = readCache()[key];
  if (cached?.analysis) return cached.analysis;
  const cachePrefix = `${threadData.threadId}::${messageId}::`;
  const cachedVariant = Object.entries(readCache()).find(
    ([variantKey, value]) => variantKey.startsWith(cachePrefix) && value?.analysis,
  )?.[1]?.analysis;
  if (cachedVariant) return cachedVariant;
  const existing = workflowAnalysisInflight.get(key);
  if (existing) return existing;
  const existingVariant = Array.from(workflowAnalysisInflight.entries()).find(([variantKey]) =>
    variantKey.startsWith(cachePrefix),
  )?.[1];
  if (existingVariant) return existingVariant;

  const promise = (async () => {
    try {
      if (!(await hasAuthSession())) return null;
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
      if (error || data?.error) return null;
      const result = data?.result as WorkflowAnalysis | { raw?: string } | undefined;
      if (!result || (result as any).raw) return null;
      const normalized = result as WorkflowAnalysis;
      try {
        const subject = (latestInbound?.subject || threadData?.subject || '').toLowerCase();
        let canonical: { id: string; name: string } | null = null;
        if (dealId) {
          const matched = (deals || []).find((d: any) => d.id === dealId);
          if (matched) canonical = { id: matched.id, name: matched.name };
        }
        if (!canonical && subject) {
          const candidates = (deals || [])
            .filter((d: any) => d?.name && subject.includes(String(d.name).toLowerCase()))
            .sort((a: any, b: any) => (b.name?.length || 0) - (a.name?.length || 0));
          if (candidates.length > 0) canonical = { id: candidates[0].id, name: candidates[0].name };
        }
        if (canonical && canonical.id !== normalized.likely_deal?.id) {
          const previousAiDealName =
            normalized.recommended_update?.deal_name || normalized.likely_deal?.name || '';
          normalized.likely_deal = {
            id: canonical.id,
            name: canonical.name,
            confidence: 'high',
            reasoning: dealId
              ? 'Thread is already linked to this deal.'
              : `Deal name appears in the email subject ("${latestInbound?.subject || ''}").`,
          };
          if (normalized.recommended_update && normalized.recommended_update.kind !== 'none') {
            normalized.recommended_update.deal_id = canonical.id;
            normalized.recommended_update.deal_name = canonical.name;
            normalized.recommended_update.lender_id = '';
            if (normalized.recommended_update.title && previousAiDealName) {
              const escaped = previousAiDealName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              normalized.recommended_update.title = normalized.recommended_update.title
                .replace(new RegExp(escaped, 'gi'), canonical.name);
            }
            if (
              normalized.recommended_update.title &&
              !normalized.recommended_update.title.toLowerCase().includes(canonical.name.toLowerCase())
            ) {
              const lender = normalized.recommended_update.lender_name || 'lender';
              const stage = normalized.recommended_update.new_stage || 'updated';
              normalized.recommended_update.title = `Update ${lender} stage on ${canonical.name} → ${stage}`;
            }
          }
        }
      } catch {
        /* non-fatal */
      }
      try {
        const isInternal = (n?: string | null) => {
          const s = (n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          return (
            s === '5th line' ||
            s === '5th line capital' ||
            s === 'fifth line' ||
            s === 'fifth line capital' ||
            s.startsWith('5th line ') ||
            s.startsWith('fifth line ')
          );
        };
        if (isInternal(normalized.likely_lender_firm?.name)) {
          normalized.likely_lender_firm = {
            id: '',
            name: '',
            confidence: 'low',
            reasoning: '5th Line is the internal firm and is excluded from lender tags.',
          };
        }
        if (
          normalized.recommended_update?.kind === 'lender_status' &&
          isInternal(normalized.recommended_update.lender_name)
        ) {
          normalized.recommended_update = { ...normalized.recommended_update, kind: 'none' };
        }

        const senderEmail = latestInbound?.from_email as string | undefined;
        const headers = (latestInbound?.headers || latestInbound?.gmail_headers) as HeaderMap;
        const newsletter = isNewsletterSender(senderEmail);
        const listMail = hasListUnsubscribe(headers);
        const lowConfNoLender =
          normalized.likely_lender_firm?.confidence === 'low' &&
          !normalized.recommended_update?.lender_id;
        const refuseReason = newsletter
          ? 'newsletter_sender'
          : listMail
            ? 'list_unsubscribe_header'
            : lowConfNoLender
              ? 'low_confidence'
              : null;
        if (refuseReason) {
          normalized.likely_lender_firm = {
            id: '',
            name: '',
            confidence: 'low',
            reasoning: refuseReason,
          };
          if (normalized.recommended_update?.kind === 'lender_status') {
            normalized.recommended_update = { ...normalized.recommended_update, kind: 'none' };
          }
        }
      } catch {
        /* non-fatal */
      }
      const cache = readCache();
      cache[key] = { analysis: normalized, savedAt: Date.now() };
      if (normalized.likely_deal?.id) {
        cache[`${threadData.threadId}::${messageId}::${normalized.likely_deal.id}`] = {
          analysis: normalized,
          savedAt: Date.now(),
        };
      }
      cache[`${threadData.threadId}::${messageId}::no-deal`] = {
        analysis: normalized,
        savedAt: Date.now(),
      };
      writeCache(cache);
      return normalized;
    } catch {
      return null;
    } finally {
      workflowAnalysisInflight.delete(key);
    }
  })();

  workflowAnalysisInflight.set(key, promise);
  return promise;
}

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
  const { refreshDeals, deals } = useDealsContext();
  const queryClient = useQueryClient();
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    // Hard timeout — if the AI/edge-function hangs we surface a clear
    // error state instead of leaving the AI Assist header stuck on
    // "Analyzing thread…" indefinitely (Niki bug, Asana #1215178140447221).
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setError('Analysis timed out — tap retry');
      setLoading(false);
    }, 25_000);
    try {
      const result = await preloadThreadWorkflowAnalysis({ dealId, threadData, deals });
      if (!result) throw new Error('Invalid workflow analysis response');

      // ─── Canonical deal override ────────────────────────────────────
      // The AI sometimes nominates the wrong deal (e.g. picks "Back Bar
      // Project" for a thread whose subject + linked deal both say
      // "Censys Technologies"). The AI Assist panel must use a SINGLE
      // source of truth across the header, the chip row, and the
      // SuggestedUpdate card. Resolution priority:
      //   1. The parent-passed dealId (canonical link from deal_emails).
      //   2. The deal whose name appears literally in the subject line.
      //      (Strongest semantic signal — outranks any AI heuristic.)
      // If either fires we overwrite the AI's `likely_deal` AND
      // `recommended_update.{deal_id, deal_name}` so every consumer
      // agrees. We do NOT touch lender/signal fields — only the deal.
      try {
        const subject = (latestInbound?.subject || threadData?.subject || '').toLowerCase();
        // Pre-pass: parent dealId always wins.
        let canonical: { id: string; name: string } | null = null;
        if (dealId) {
          const matched = (deals || []).find((d: any) => d.id === dealId);
          if (matched) canonical = { id: matched.id, name: matched.name };
        }
        // Subject-line literal match (longest wins so "Censys Technologies"
        // beats a substring match on a single word).
        if (!canonical && subject) {
          const candidates = (deals || [])
            .filter((d: any) => d?.name && subject.includes(String(d.name).toLowerCase()))
            .sort((a: any, b: any) => (b.name?.length || 0) - (a.name?.length || 0));
          if (candidates.length > 0) {
            canonical = { id: candidates[0].id, name: candidates[0].name };
          }
        }
        if (canonical && canonical.id !== result.likely_deal?.id) {
          // eslint-disable-next-line no-console
          console.info('[useThreadWorkflowAnalysis] overriding AI deal pick with canonical match', {
            aiPicked: result.likely_deal,
            canonical,
            reason: dealId ? 'parent_linked_deal' : 'subject_literal_match',
          });
          // Capture the AI's previously nominated deal name BEFORE we
          // overwrite likely_deal so we can rewrite any title that still
          // references it (e.g. "Update SG Credit on Back Bar Project").
          const previousAiDealName =
            result.recommended_update?.deal_name || result.likely_deal?.name || '';
          result.likely_deal = {
            id: canonical.id,
            name: canonical.name,
            confidence: 'high',
            reasoning: dealId
              ? 'Thread is already linked to this deal.'
              : `Deal name appears in the email subject ("${latestInbound?.subject || ''}").`,
          };
          if (result.recommended_update && result.recommended_update.kind !== 'none') {
            result.recommended_update.deal_id = canonical.id;
            result.recommended_update.deal_name = canonical.name;
            // Rewrite the title so the rendered card matches the real
            // deal name instead of the AI's misidentified one.
            if (result.recommended_update.title && previousAiDealName) {
              const escaped = previousAiDealName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              result.recommended_update.title = result.recommended_update.title
                .replace(new RegExp(escaped, 'gi'), canonical.name);
            }
            // The AI's lender_id was resolved against the WRONG deal —
            // discard it so the downstream resolver re-matches the lender
            // by name against the canonical deal's deal_lenders rows.
            // Keep lender_name + master_lender_id (directory-level, deal-
            // agnostic) so the resolver still has something to match on.
            result.recommended_update.lender_id = '';
            // Ensure the title always carries the canonical deal name,
            // even if the AI never mentioned the AI-picked name verbatim
            // (e.g. it used a nickname). Append when missing.
            if (
              result.recommended_update.title &&
              !result.recommended_update.title.toLowerCase().includes(canonical.name.toLowerCase())
            ) {
              const lender = result.recommended_update.lender_name || 'lender';
              const stage = result.recommended_update.new_stage || 'updated';
              result.recommended_update.title = `Update ${lender} stage on ${canonical.name} → ${stage}`;
            }
          }
        }
      } catch (overrideErr) {
        // Non-fatal — fall back to AI's pick if our heuristic blows up.
        console.warn('[useThreadWorkflowAnalysis] canonical-deal override failed', overrideErr);
      }

      // Data-layer suppression: 5th Line is our own firm, never a lender.
      // Strip it from `likely_lender_firm` and any recommended lender update
      // before downstream consumers see it.
      try {
        const isInternal = (n?: string | null) => {
          const s = (n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          return (
            s === '5th line' ||
            s === '5th line capital' ||
            s === 'fifth line' ||
            s === 'fifth line capital' ||
            s.startsWith('5th line ') ||
            s.startsWith('fifth line ')
          );
        };
        if (isInternal(result.likely_lender_firm?.name)) {
          result.likely_lender_firm = {
            id: '',
            name: '',
            confidence: 'low',
            reasoning: '5th Line is the internal firm and is excluded from lender tags.',
          };
        }
        if (
          result.recommended_update?.kind === 'lender_status' &&
          isInternal(result.recommended_update.lender_name)
        ) {
          result.recommended_update = {
            ...result.recommended_update,
            kind: 'none',
          };
        }
      } catch {
        // non-fatal
      }

      // ─── Newsletter / low-confidence lender suppression ──────────────
      // Newsletter and mailing-list senders (Substack, LinkedIn, etc.) are
      // not lenders. Also refuse to assign a Lender pill when the AI's
      // own confidence is low and no concrete deal_lender id matched —
      // surface "No lender match" instead of a junk pill. Additive: same
      // suppression shape as the 5th Line internal-firm block above.
      try {
        const senderEmail = latestInbound?.from_email as string | undefined;
        const headers = (latestInbound?.headers || latestInbound?.gmail_headers) as HeaderMap;
        const newsletter = isNewsletterSender(senderEmail);
        const listMail = hasListUnsubscribe(headers);
        const lowConfNoLender =
          result.likely_lender_firm?.confidence === 'low' &&
          !result.recommended_update?.lender_id;
        const refuseReason = newsletter
          ? 'newsletter_sender'
          : listMail
            ? 'list_unsubscribe_header'
            : lowConfNoLender
              ? 'low_confidence'
              : null;
        if (refuseReason) {
          result.likely_lender_firm = {
            id: '',
            name: '',
            confidence: 'low',
            reasoning: refuseReason,
          };
          if (result.recommended_update?.kind === 'lender_status') {
            result.recommended_update = {
              ...result.recommended_update,
              kind: 'none',
            };
          }
        }
      } catch {
        // non-fatal
      }

      setAnalysis(result);

      // Persist to localStorage so reopening the same thread renders
      // the analysis instantly without re-invoking the edge function.
      if (cacheKey) {
        const cache = readCache();
        cache[`${cacheKey}::${dealId || 'no-deal'}`] = {
          analysis: result,
          savedAt: Date.now(),
        };
        writeCache(cache);
      }

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
      if (!timedOut) setError(err?.message || 'Couldn’t analyze thread');
    } finally {
      clearTimeout(timeoutId);
      if (timedOut) return;
      setLoading(false);
    }
  }, [dealId, threadData, latestInbound, messageId, deals]);

  // Auto-run on mount + when key inputs change.
  useEffect(() => {
    if (!autoRun) return;
    if (!cacheKey) return;
    const key = `${cacheKey}::${dealId || 'no-deal'}`;
    if (lastRunKey.current === key) return;
    lastRunKey.current = key;
    // Hydrate instantly from localStorage if we've analyzed this exact
    // (thread message + linked deal) combination before. The same key
    // shape is written in `run()` on success, so a cache hit avoids the
    // edge-function round-trip entirely on refresh / thread re-open.
    const cached = readCache()[key];
    if (cached?.analysis) {
      setAnalysis(cached.analysis);
      setError(null);
      setLoading(false);
      return;
    }
    // Clear stale analysis from the previously open thread immediately so
    // the AI Assist header doesn't keep showing "Likely: <prev deal>"
    // while the new thread is being re-analyzed.
    setAnalysis(null);
    setError(null);
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

  const resolveCanonicalDealId = useCallback(async () => {
    const explicitThreadDealId = threadData?.deal_id || threadData?.dealId || threadData?.linkedDealId || null;
    if (explicitThreadDealId) return explicitThreadDealId as string;
    if (dealId) return dealId;

    const threadMessageIds: string[] = (threadData?.emails || [])
      .map((e: any) => e?.gmail_message_id || e?.id)
      .filter(Boolean);
    if (threadMessageIds.length === 0) return null;

    const { data, error } = await supabase
      .from('deal_emails')
      .select('deal_id, gmail_message_id')
      .in('gmail_message_id', threadMessageIds);
    if (error) throw error;

    const uniqueDealIds = Array.from(new Set((data || []).map((row: any) => row.deal_id).filter(Boolean)));
    if (uniqueDealIds.length === 0) return null;
    if (uniqueDealIds.length > 1) {
      console.warn('[useThreadWorkflowAnalysis] multiple thread deal links; using first', {
        threadId: threadData?.threadId || null,
        uniqueDealIds,
        matchedRows: data,
      });
    }
    return uniqueDealIds[0] as string;
  }, [dealId, threadData]);

  const resolveLenderCompany = useCallback(async (lenderName: string, senderEmail?: string | null) => {
    const name = lenderName.trim();
    const senderDomain = getEmailDomain(senderEmail);
    const nameNorm = normalizeFirmName(name);
    const aliases = Array.from(new Set([
      name,
      name.replace(/\bCapital\b/gi, 'Cap').trim(),
      name.replace(/\bCap\b/gi, 'Capital').trim(),
    ].filter(Boolean)));

    let candidates: any[] = [];
    if (aliases.length > 0) {
      const { data: crmMatches, error: crmError } = await supabase
        .from('crm_companies')
        .select('id, name, domain, additional_domains')
        .or(aliases.map((alias) => `name.ilike.${alias}`).join(','));
      if (crmError) throw crmError;
      candidates = crmMatches || [];
    }
    if (senderDomain) {
      const { data: domainMatches, error: domainError } = await supabase
        .from('crm_companies')
        .select('id, name, domain, additional_domains')
        .or(`domain.eq.${senderDomain},website_url.ilike.%${senderDomain}%`);
      if (domainError) throw domainError;
      candidates = [...candidates, ...(domainMatches || [])];
    }

    if (candidates.length === 0 && nameNorm) {
      const { data: fuzzy, error: fuzzyError } = await supabase
        .from('crm_companies')
        .select('id, name, domain, additional_domains')
        .ilike('name', `%${name.split(/\s+/)[0]}%`)
        .limit(25);
      if (fuzzyError) throw fuzzyError;
      candidates = fuzzy || [];
    }

    const deduped = Array.from(new Map(candidates.map((c: any) => [c.id, c])).values());
    const exactDomain = senderDomain
      ? deduped.find((c: any) => c.domain === senderDomain || (c.additional_domains || []).includes(senderDomain))
      : null;
    const exactName = deduped.find((c: any) => normalizeFirmName(c.name) === nameNorm);
    const aliasName = deduped.find((c: any) => {
      const candidate = normalizeFirmName(c.name);
      return candidate && nameNorm && (candidate === nameNorm || candidate.startsWith(nameNorm) || nameNorm.startsWith(candidate));
    });
    const resolved = exactDomain || exactName || aliasName || null;

    debugStep('resolveLenderCompany', {
      lenderName: name,
      senderEmail: senderEmail || null,
      senderDomain,
      aliases,
      companyId: resolved?.id || null,
      companyName: resolved?.name || null,
      candidateCount: deduped.length,
    });

    return resolved ? { id: resolved.id as string, name: resolved.name as string } : null;
  }, []);

  const resolveDealLenderRow = useCallback(async (canonicalDealId: string, companyName: string, companyId: string) => {
    const { data, error } = await supabase
      .from('deal_lenders')
      .select('id, deal_id, name, stage, tracking_status, pass_reason, notes')
      .eq('deal_id', canonicalDealId);
    if (error) throw error;

    const targetNorm = normalizeFirmName(companyName);
    const rows = (data || []).filter((row: any) => {
      const rowNorm = normalizeFirmName(row.name);
      return rowNorm === targetNorm || rowNorm.startsWith(targetNorm) || targetNorm.startsWith(rowNorm);
    });

    if (rows.length === 0) return null;
    if (rows.length > 1) {
      console.warn('[useThreadWorkflowAnalysis] multiple lender rows matched resolved company; using canonical deal row', {
        canonicalDealId,
        companyId,
        companyName,
        rows,
      });
    }
    return rows[0] as any;
  }, []);

  /**
   * Final confirm action. Deterministic path: persisted thread→deal link,
   * resolved CRM company/domain identity, then the existing deal_lenders row
   * scoped to that deal. No auto-linking in this path.
   */
  const confirmRecommendation = useCallback(async (overrides?: {
    reasonNote?: string;
    /**
     * Configured Lender Stage **id** selected by the user (sourced from
     * Settings → Lender Stages). Persisted directly into
     * `deal_lenders.stage`. When omitted we fall back to whatever the AI
     * recommended (`rec.new_stage`).
     */
    confirmedStatus?: string;
    /**
     * Tracking status group of the selected stage (e.g. 'passed',
     * 'active', 'on-deck', 'on-hold'). Derived in the card from the
     * stage's `group`. Used to keep `deal_lenders.tracking_status`
     * aligned with the selected stage.
     */
    confirmedTrackingStatus?: string;
    confirmedDetail?: string;
    confirmedDetailLabels?: string[];
  }) => {
    if (!analysis || !user) return false;
    const rec = analysis.recommended_update;
    if (!rec || rec.kind === 'none') return false;

    setCommitting(true);
    let currentStep = 'resolveCanonicalDealAndLender';
    let debugContext: Record<string, unknown> = {
      threadId: threadData?.threadId || null,
      thread_id: threadData?.id || null,
    };

    try {
      const canonicalDealId = await resolveCanonicalDealId();
      debugContext = { ...debugContext, canonicalDealId };
      if (!canonicalDealId) {
        toast.error('No deal linked to this thread');
        return false;
      }

      const lenderName = rec.lender_name || analysis.likely_lender_firm.name || '';
      const senderEmail = latestInbound?.from_email || null;
      // Fast path: try matching directly against deal_lenders on this deal
      // by name. This avoids requiring a CRM company record for lenders
      // that already exist on the deal (the most common case for the
      // Confirm flow).
      let targetRow = await resolveDealLenderRow(canonicalDealId, lenderName, '');
      let company: { id: string; name: string } | null = targetRow
        ? { id: targetRow.id, name: targetRow.name }
        : null;

      if (!targetRow?.id) {
        // Fall back to CRM company resolution + retry.
        const resolvedCompany = await resolveLenderCompany(lenderName, senderEmail);
        debugContext = {
          ...debugContext,
          companyId: resolvedCompany?.id || null,
          companyName: resolvedCompany?.name || null,
        };
        if (resolvedCompany?.id) {
          company = resolvedCompany;
          targetRow = await resolveDealLenderRow(canonicalDealId, resolvedCompany.name, resolvedCompany.id);
        }
      }
      debugContext = { ...debugContext, dealLenderId: targetRow?.id || null };
      if (!targetRow?.id) {
        throw new Error(`Lender "${lenderName || 'Unknown'}" is not on this deal yet. Add it from the Lenders tab and try again.`);
      }

      const finalDetailLabels: string[] = (overrides?.confirmedDetailLabels && overrides.confirmedDetailLabels.length > 0)
        ? overrides.confirmedDetailLabels
        : (overrides?.confirmedDetail
            ? overrides.confirmedDetail.split(',').map((part) => part.trim()).filter(Boolean)
            : []);
      const passReasonText = finalDetailLabels.join(', ') || overrides?.confirmedDetail || 'Passed';
      const reason = overrides?.reasonNote ?? rec.reason_note ?? analysis.signal.label ?? '';
      // The card now passes a configured Lender Stage **id** directly.
      // Fall back to the AI's suggested stage only if the card didn't
      // pass anything (legacy callers).
      const finalStageId = (overrides?.confirmedStatus || rec.new_stage || 'passed');
      const finalTrackingStatus = overrides?.confirmedTrackingStatus
        || (finalStageId === 'passed' ? 'passed' : 'active');
      const isClosingStage = finalTrackingStatus === 'passed';
      const sourceMessageId = latestInbound?.gmail_message_id || latestInbound?.id || messageId || null;

      currentStep = 'updateDealLender';
      const lenderUpdatePayload: DealLenderUpdate = {
        stage: finalStageId,
        substage: null,
        tracking_status: finalTrackingStatus,
        pass_reason: isClosingStage ? passReasonText : null,
        notes: reason || targetRow.notes || null,
        updated_at: new Date().toISOString(),
      };

      debugStep('confirmMutation:attempt', {
        ...debugContext,
        targetDealLendersId: targetRow.id,
        updatePayload: lenderUpdatePayload,
      });

      const { data: updatedRows, error: updateError } = await supabase
        .from('deal_lenders')
        .update(lenderUpdatePayload)
        .eq('id', targetRow.id)
        .eq('deal_id', canonicalDealId)
        .select('id, deal_id, name, stage, tracking_status, pass_reason, notes, updated_at');

      debugStep('confirmMutation:update-response', {
        ...debugContext,
        targetDealLendersId: targetRow.id,
        data: updatedRows,
        error: updateError?.message || null,
      });
      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length !== 1) {
        throw new Error(`Expected 1 updated lender row but got ${updatedRows?.length || 0}. ids=${JSON.stringify(debugContext)}`);
      }

      currentStep = 'readBackVerification';
      const { data: verifyRow, error: verifyError } = await supabase
        .from('deal_lenders')
        .select('id, deal_id, name, stage, substage, tracking_status, pass_reason, notes, updated_at')
        .eq('id', targetRow.id)
        .eq('deal_id', canonicalDealId)
        .maybeSingle();

      debugStep('confirmMutation:read-back', {
        ...debugContext,
        targetDealLendersId: targetRow.id,
        readBackStatus: verifyRow?.stage || null,
        readBackTrackingStatus: verifyRow?.tracking_status || null,
        readBackPassReason: verifyRow?.pass_reason || null,
        verifyRow,
        verifyError: verifyError?.message || null,
      });
      if (verifyError) throw verifyError;
      if (!verifyRow || verifyRow.stage !== finalStageId || verifyRow.tracking_status !== finalTrackingStatus) {
        throw new Error(`Read-back mismatch for ids=${JSON.stringify(debugContext)} stage=${verifyRow?.stage || 'missing'} expected=${finalStageId}`);
      }

      if (isClosingStage && finalDetailLabels.length > 0) {
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
          deal_id: canonicalDealId,
          deal_lender_id: targetRow.id,
          lender_name: verifyRow.name,
          master_lender_id: rec.master_lender_id || null,
          disqualified_by: user.id,
          reason_category: labelToCategory(label),
          reason_details: [label, reason].filter(Boolean).join(' — ') || null,
        }));
        const { error: disqualificationError } = await supabase
          .from('lender_disqualifications')
          .insert(rows);
        if (disqualificationError) throw disqualificationError;
      }

      currentStep = 'writeActivityLog';
      const activityPayload = {
        deal_id: canonicalDealId,
        activity_type: 'lender_stage_change',
        description: `${verifyRow.name} stage → ${finalStageId}${isClosingStage && passReasonText ? ` — ${passReasonText}` : ''}`,
        user_id: user.id,
        metadata: {
          source: 'ai_thread_workflow',
          lender_id: targetRow.id,
          lender_name: verifyRow.name,
          company_id: company.id,
          from: targetRow.stage,
          to: finalStageId,
          final_confirmed_stage_id: finalStageId,
          final_confirmed_tracking_status: finalTrackingStatus,
          final_confirmed_detail_labels: finalDetailLabels,
          reason_note: reason,
          source_thread_id: threadData?.threadId || null,
          source_message_id: sourceMessageId,
        },
      };
      const { data: activityRow, error: activityError } = await supabase
        .from('activity_logs')
        .insert(activityPayload)
        .select('id')
        .single();
      if (activityError) throw activityError;

      currentStep = 'refreshCaches';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['deal', canonicalDealId] }),
        queryClient.invalidateQueries({ queryKey: ['deal-detail', canonicalDealId] }),
        queryClient.invalidateQueries({ queryKey: ['deal-lenders', canonicalDealId] }),
        queryClient.invalidateQueries({ queryKey: ['activity_logs', canonicalDealId] }),
        queryClient.invalidateQueries({ queryKey: ['deal-activity', canonicalDealId] }),
        refreshDeals(),
      ]);

      window.dispatchEvent(new CustomEvent('deal:lender-updated', {
        detail: { dealId: canonicalDealId, dealLenderId: targetRow.id, source: 'ai_thread_workflow' },
      }));
      window.dispatchEvent(new CustomEvent('deal:activity-updated', {
        detail: { dealId: canonicalDealId, activityLogId: activityRow.id, source: 'ai_thread_workflow' },
      }));

      debugStep('confirmMutation:success', {
        ...debugContext,
        targetDealLendersId: targetRow.id,
        activityLogId: activityRow.id,
        readBackStatus: verifyRow.stage,
        readBackTrackingStatus: verifyRow.tracking_status,
      });

      toast.success(`${verifyRow.name} stage updated → ${finalStageId}`);
      dismiss();
      return true;
    } catch (err: any) {
      console.error(`confirmRecommendation error during ${currentStep}:`, { error: err, debugContext });
      debugStep(`${currentStep}:error`, { ...debugContext, error: err?.message || String(err) });
      toast.error(err?.message ? `Confirm failed at ${currentStep}: ${err.message}` : `Confirm failed at ${currentStep}`);
      return false;
    } finally {
      setCommitting(false);
    }
  }, [analysis, user, threadData, dealId, latestInbound, messageId, resolveCanonicalDealId, resolveLenderCompany, resolveDealLenderRow, queryClient, refreshDeals, dismiss]);

  return {
    analysis,
    loading,
    error,
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
