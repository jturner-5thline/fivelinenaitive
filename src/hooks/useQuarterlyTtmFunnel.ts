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

export const FUNNEL_STAGE_ORDER: { key: FunnelStageKey; label: string }[] = [
  { key: 'proposalIssued',     label: 'Proposal Issued' },
  { key: 'finalCreditItems',   label: 'Final Credit Items' },
  { key: 'submittedToLenders', label: 'Submitted to Lenders' },
  { key: 'termsIssued',        label: 'Terms Issued' },
  { key: 'inDueDiligence',     label: 'Terms Signed' },
  { key: 'fundedInvoiced',     label: 'Funded / Invoiced' },
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
  /** Distinct-deal count per stage across the trailing 12 months to `endsAt`. */
  counts: Record<FunnelStageKey, number>;
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
    queryKey: ['quarterly-ttm-funnel', ACTIVE_PIPELINE_ID, queryStartIso.slice(0, 10)],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, to_stage, deals!inner(company)')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', allLabels)
        .gte('changed_at', queryStartIso)
        .lte('changed_at', queryEndIso)
        .order('changed_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        deal_id: string;
        changed_at: string;
        to_stage: string;
        deals: { company: string | null } | null;
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

  const bucketFor = (endsAt: Date): QuarterlyFunnelBucket['counts'] => {
    const windowStart = new Date(endsAt);
    windowStart.setUTCMonth(windowStart.getUTCMonth() - 12);
    // Distinct deal per stage per window (first entry wins).
    const seen: Record<FunnelStageKey, Set<string>> = {
      proposalIssued: new Set(),
      finalCreditItems: new Set(),
      submittedToLenders: new Set(),
      termsIssued: new Set(),
      inDueDiligence: new Set(),
      fundedInvoiced: new Set(),
    };
    for (const row of q.data ?? []) {
      if (isExcludedDealName(row.deals?.company ?? null)) continue;
      const ts = new Date(row.changed_at);
      if (ts <= windowStart || ts > endsAt) continue;
      const key = labelToKey.get(row.to_stage.toLowerCase())
        ?? (normalizeStageSlug(row.to_stage) ? slugToKey.get(normalizeStageSlug(row.to_stage)!) : undefined);
      if (!key) continue;
      seen[key].add(row.deal_id);
    }
    const counts = emptyCounts();
    (Object.keys(seen) as FunnelStageKey[]).forEach(k => { counts[k] = seen[k].size; });
    return counts;
  };

  const current: QuarterlyFunnelBucket = {
    label: 'Current (TTM)',
    endsAt: now,
    counts: bucketFor(now),
  };
  const quarters: QuarterlyFunnelBucket[] = quarterAnchors.map(a => ({
    label: a.label,
    endsAt: a.endsAt,
    counts: bucketFor(a.endsAt),
  }));

  return { current, quarters, isLoading: q.isLoading || q.isFetching };
}