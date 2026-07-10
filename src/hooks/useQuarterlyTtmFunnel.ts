import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expandStageLabels, normalizeStageSlug } from '@/hooks/usePipelineStageMetrics';
import { isExcludedDealName } from '@/utils/excludedDeals';

const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

export type FunnelStageKey =
  | 'proposalIssued'
  | 'finalCreditItems'
  | 'submittedToLenders'
  | 'termsIssued'
  | 'inDueDiligence'
  | 'fundedInvoiced';

export type FunnelStepKey = `${FunnelStageKey}__${FunnelStageKey}`;

export const FUNNEL_STAGE_ORDER: { key: FunnelStageKey; label: string }[] = [
  { key: 'proposalIssued',     label: 'Proposal Issued' },
  { key: 'finalCreditItems',   label: 'Signed' },
  { key: 'submittedToLenders', label: 'Submitted' },
  { key: 'termsIssued',        label: 'Terms Issued' },
  { key: 'inDueDiligence',     label: 'Terms Signed' },
  { key: 'fundedInvoiced',     label: 'Closed' },
];

const STAGE_SLUG_GROUPS: Record<FunnelStageKey, string[]> = {
  proposalIssued: ['proposal-issued'],
  finalCreditItems: ['final-credit-items'],
  submittedToLenders: ['submitted-to-lenders', 'lenders-in-review'],
  termsIssued: ['terms-issued'],
  inDueDiligence: ['in-due-diligence'],
  fundedInvoiced: ['funded-invoiced'],
};

export interface QuarterlyFunnelBucket {
  /** Short label, e.g. "Q2 2026" or "Current (TTM)". */
  label: string;
  /** Anchor date this TTM window ends on (inclusive). */
  endsAt: Date;
  /** Distinct-deal count per stage for the proposal-issued cohort. */
  counts: Record<FunnelStageKey, number>;
  /** Sum of deal `value` per stage for the proposal-issued cohort. */
  dollars: Record<FunnelStageKey, number>;
  /** Widget-style denominator cohort counts for each consecutive conversion step. */
  stepConversions: Partial<Record<FunnelStepKey, {
    fromCount: number;
    toCount: number;
    fromDollars: number;
    toDollars: number;
  }>>;
}

export interface QuarterlyTtmFunnelResult {
  current: QuarterlyFunnelBucket;
  quarters: QuarterlyFunnelBucket[]; // past 4 completed quarters, newest first
  isLoading: boolean;
}

function endOfQuarterUTC(year: number, q: 1 | 2 | 3 | 4): Date {
  // last day of Mar/Jun/Sep/Dec, 23:59:59.999 UTC
  const monthIdx = q * 3 - 1; // 2, 5, 8, 11
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0));
  lastDay.setUTCHours(23, 59, 59, 999);
  return lastDay;
}

function priorQuarter(y: number, q: 1 | 2 | 3 | 4): { y: number; q: 1 | 2 | 3 | 4 } {
  return q === 1 ? { y: y - 1, q: 4 } : { y, q: (q - 1) as 1 | 2 | 3 | 4 };
}

function pastFourCompletedQuarters(now: Date): { label: string; endsAt: Date }[] {
  const y = now.getUTCFullYear();
  const currentQ = (Math.floor(now.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  let cursor = priorQuarter(y, currentQ);
  const out: { label: string; endsAt: Date }[] = [];
  for (let i = 0; i < 4; i++) {
    out.push({ label: `Q${cursor.q} ${cursor.y}`, endsAt: endOfQuarterUTC(cursor.y, cursor.q) });
    cursor = priorQuarter(cursor.y, cursor.q);
  }
  return out; // newest first
}

/**
 * Trailing-12-month conversion funnel counts on the Active Pipeline, computed
 * for the current window and each of the past 4 completed quarter-ends.
 * One query, bucketed client-side by TTM window.
 */
export function useQuarterlyTtmFunnel(): QuarterlyTtmFunnelResult {
  const { user } = useAuth();

  // Build slug → stage-key lookup and the full label list for the SQL filter.
  const slugToKey = new Map<string, FunnelStageKey>();
  const labelToKey = new Map<string, FunnelStageKey>();
  const allLabels: string[] = [];
  for (const [key, slugs] of Object.entries(STAGE_SLUG_GROUPS) as [FunnelStageKey, string[]][]) {
    for (const s of slugs) slugToKey.set(s, key);
    for (const v of expandStageLabels(slugs)) {
      labelToKey.set(v.toLowerCase(), key);
      allLabels.push(v);
    }
  }

  const now = new Date();
  const quarterAnchors = pastFourCompletedQuarters(now);
  // Earliest window start = 12 months before the oldest anchor.
  const earliestAnchor = quarterAnchors[quarterAnchors.length - 1].endsAt;
  const queryStart = new Date(earliestAnchor);
  queryStart.setUTCMonth(queryStart.getUTCMonth() - 12);
  const queryStartIso = queryStart.toISOString();
  const queryEndIso = now.toISOString();

  const q = useQuery({
    queryKey: ['quarterly-ttm-funnel-cohort', ACTIVE_PIPELINE_ID, queryStartIso.slice(0, 10)],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      // Cohort tracking needs ALL stage_enter events for these deals across
      // time (not just within a TTM window), so we can ask: "did this deal
      // EVER reach stage X?" independently of when it entered Proposal Issued.
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, to_stage, deals!inner(company, pipeline_id, value)')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', allLabels)
        .order('changed_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        deal_id: string;
        changed_at: string;
        to_stage: string;
        deals: { company: string | null; pipeline_id: string | null; value: number | null } | null;
      }>;
    },
  });

  const emptyCounts = (): Record<FunnelStageKey, number> => ({
    proposalIssued: 0,
    finalCreditItems: 0,
    submittedToLenders: 0,
    termsIssued: 0,
    inDueDiligence: 0,
    fundedInvoiced: 0,
  });
  const emptyDollars = emptyCounts;

  // Pre-index: for each deal, which stages did it EVER enter (lifetime), plus
  // every stage-entry timestamp by stage (a deal can re-enter a stage).
  const dealEverReached: Map<string, Set<FunnelStageKey>> = new Map();
  const dealValue: Map<string, number> = new Map();
  const dealStageEntries: Map<FunnelStageKey, Map<string, Date[]>> = new Map<FunnelStageKey, Map<string, Date[]>>(
    FUNNEL_STAGE_ORDER.map(s => [s.key, new Map<string, Date[]>()] as const),
  );
  for (const row of q.data ?? []) {
    if (row.deals?.pipeline_id !== ACTIVE_PIPELINE_ID || isExcludedDealName(row.deals?.company ?? null)) continue;
    const key = labelToKey.get(row.to_stage.toLowerCase())
      ?? (normalizeStageSlug(row.to_stage) ? slugToKey.get(normalizeStageSlug(row.to_stage)!) : undefined);
    if (!key) continue;
    if (!dealValue.has(row.deal_id)) dealValue.set(row.deal_id, row.deals?.value ?? 0);
    let reached = dealEverReached.get(row.deal_id);
    if (!reached) { reached = new Set(); dealEverReached.set(row.deal_id, reached); }
    reached.add(key);
    const entriesByDeal = dealStageEntries.get(key);
    const arr = entriesByDeal?.get(row.deal_id) ?? [];
    arr.push(new Date(row.changed_at));
    entriesByDeal?.set(row.deal_id, arr);
  }

  const bucketFor = (endsAt: Date): Pick<QuarterlyFunnelBucket, 'counts' | 'dollars' | 'stepConversions'> => {
    const windowStart = new Date(endsAt);
    windowStart.setUTCMonth(windowStart.getUTCMonth() - 12);

    // Cohort = deals with ANY entry into the anchor stage inside the TTM window
    // (matches the widget's stage-entry semantics; deduped by deal_id).
    const cohortFor = (stage: FunnelStageKey): string[] => {
      const cohort: string[] = [];
      for (const [dealId, entries] of dealStageEntries.get(stage) ?? []) {
        if (entries.some(ts => ts > windowStart && ts <= endsAt)) cohort.push(dealId);
      }
      return cohort;
    };

    const proposalCohort = cohortFor('proposalIssued');
    const countReached = (cohort: string[], stage: FunnelStageKey) => {
      let n = 0;
      for (const dealId of cohort) {
        if (dealEverReached.get(dealId)?.has(stage)) n++;
      }
      return n;
    };
    const sumDollars = (dealIds: string[]) =>
      dealIds.reduce((s, id) => s + (dealValue.get(id) ?? 0), 0);
    const dollarsReached = (cohort: string[], stage: FunnelStageKey) => {
      let s = 0;
      for (const dealId of cohort) {
        if (dealEverReached.get(dealId)?.has(stage)) s += dealValue.get(dealId) ?? 0;
      }
      return s;
    };

    const stepConversions: QuarterlyFunnelBucket['stepConversions'] = {};
    for (let i = 0; i < FUNNEL_STAGE_ORDER.length - 1; i++) {
      const from = FUNNEL_STAGE_ORDER[i].key;
      const to = FUNNEL_STAGE_ORDER[i + 1].key;
      const fromCohort = cohortFor(from);
      const toReachedIds = fromCohort.filter(id => dealEverReached.get(id)?.has(to));
      stepConversions[`${from}__${to}` as FunnelStepKey] = {
        fromCount: fromCohort.length,
        toCount: countReached(fromCohort, to),
        fromDollars: sumDollars(fromCohort),
        toDollars: sumDollars(toReachedIds),
      };
    }

    const counts = emptyCounts();
    const dollars = emptyDollars();
    counts.proposalIssued = proposalCohort.length;
    dollars.proposalIssued = sumDollars(proposalCohort);
    // Funnel view remains proposal-cohort based: how many Proposal Issued deals
    // ever reached each downstream stage.
    (Object.keys(counts) as FunnelStageKey[]).forEach(k => {
      if (k === 'proposalIssued') return;
      counts[k] = countReached(proposalCohort, k);
      dollars[k] = dollarsReached(proposalCohort, k);
    });
    return { counts, dollars, stepConversions };
  };

  const currentBucket = bucketFor(now);

  const current: QuarterlyFunnelBucket = {
    label: 'Current (TTM)',
    endsAt: now,
    counts: currentBucket.counts,
    dollars: currentBucket.dollars,
    stepConversions: currentBucket.stepConversions,
  };
  const quarters: QuarterlyFunnelBucket[] = quarterAnchors.map(a => {
    const bucket = bucketFor(a.endsAt);
    return {
      label: a.label,
      endsAt: a.endsAt,
      counts: bucket.counts,
      dollars: bucket.dollars,
      stepConversions: bucket.stepConversions,
    };
  });

  return { current, quarters, isLoading: q.isLoading || q.isFetching };
}