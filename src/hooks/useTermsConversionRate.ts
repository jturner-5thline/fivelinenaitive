import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { expandStageLabels } from '@/hooks/usePipelineStageMetrics';

const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

/** Deal stages whose entry (in the trailing 12 months) qualifies a deal. */
const QUALIFYING_STAGES = ['submitted-to-lenders', 'lenders-in-review'];

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[_-]+/g, ' ').trim();

/**
 * Lender stages that mean "Terms Issued or later". Anything matching one of
 * these tokens (or a term-sheet variant) counts in the numerator.
 */
const TERMS_OR_LATER_TOKENS = [
  'terms issued',
  'term sheet',
  'term sheets',
  'draft terms',
  'approved',
  'due diligence',
  'diligence',
  'closing',
  'funded',
  'closed won',
];

export function isLenderTermsOrLater(stage?: string | null, trackingStatus?: string | null): boolean {
  const s = norm(stage);
  const ts = norm(trackingStatus);
  if (!s && !ts) return false;
  // A lender that passed never reached terms, regardless of stage text.
  if (ts === 'passed' || s === 'passed' || s === 'not a fit' || s === 'unresponsive') return false;
  return TERMS_OR_LATER_TOKENS.some(t => s.includes(t));
}

export interface TermsConversionDealRow {
  deal_id: string;
  company: string;
  value: number;
  manager: string | null;
  current_stage: string;
  entered_at: string;
  pipeline_id: string;
}

export interface TermsConversionRateResult {
  /** Lenders that reached Terms Issued or later. */
  numerator: number;
  /** Total funding sources added across qualifying deals. */
  denominator: number;
  /** numerator / denominator, or null when there is no denominator. */
  rate: number | null;
  /** Formatted percentage, or '—'. */
  value: string;
  dealCount: number;
  /** One row per funding source that reached Terms Issued or later. */
  numeratorDeals: TermsConversionDealRow[];
  /** One row per funding source on qualifying deals. */
  denominatorDeals: TermsConversionDealRow[];
  isLoading: boolean;
}


/**
 * Terms Conversion Rate (TTM).
 *
 * For every Active Pipeline deal that entered "Submitted to Lenders" or
 * "Lenders in Review" in the trailing 12 months, divide the number of funding
 * sources on those deals that reached "Terms Issued" or later by the total
 * number of funding sources added to those deals.
 */
export function useTermsConversionRate(): TermsConversionRateResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['terms-conversion-rate-ttm', ACTIVE_PIPELINE_ID],
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 12);
      const startIso = start.toISOString();

      const empty = {
        numerator: 0,
        denominator: 0,
        dealCount: 0,
        numeratorDeals: [] as TermsConversionDealRow[],
        denominatorDeals: [] as TermsConversionDealRow[],
      };

      const { data: histRows, error: histErr } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', expandStageLabels(QUALIFYING_STAGES))
        .gte('changed_at', startIso);
      if (histErr) throw histErr;

      const enteredAt = new Map<string, string>();
      for (const r of (histRows ?? []) as any[]) {
        if (!r.deal_id) continue;
        const prev = enteredAt.get(r.deal_id);
        if (!prev || (r.changed_at && r.changed_at < prev)) enteredAt.set(r.deal_id, r.changed_at);
      }
      const dealIds = Array.from(enteredAt.keys());
      if (dealIds.length === 0) return empty;

      // Drop globally-excluded demo/test deals.
      const { data: dealRows, error: dealErr } = await supabase
        .from('deals')
        .select('id, company, amount, manager, stage, pipeline_id')
        .in('id', dealIds);
      if (dealErr) throw dealErr;
      const kept = (dealRows ?? []).filter((d: any) => !isExcludedDealName(d.company));
      const keptIds = kept.map((d: any) => d.id);
      if (keptIds.length === 0) return empty;
      const dealById = new Map(kept.map((d: any) => [d.id, d]));

      const { data: lenderRows, error: lenderErr } = await supabase
        .from('deal_lenders')
        .select('id, deal_id, name, stage, tracking_status')
        .in('deal_id', keptIds);
      if (lenderErr) throw lenderErr;

      const rows = lenderRows ?? [];
      const toRow = (r: any): TermsConversionDealRow => {
        const d = dealById.get(r.deal_id) ?? {};
        return {
          deal_id: r.deal_id,
          company: `${d.company ?? 'Unknown deal'} · ${r.name ?? 'Funding source'}`,
          value: Number(d.amount) || 0,
          manager: d.manager ?? null,
          current_stage: r.stage ?? '—',
          entered_at: enteredAt.get(r.deal_id) ?? '',
          pipeline_id: d.pipeline_id ?? ACTIVE_PIPELINE_ID,
        };
      };

      const denominatorDeals = rows.map(toRow);
      const numeratorDeals = rows
        .filter((r: any) => isLenderTermsOrLater(r.stage, r.tracking_status))
        .map(toRow);

      return {
        numerator: numeratorDeals.length,
        denominator: rows.length,
        dealCount: keptIds.length,
        numeratorDeals,
        denominatorDeals,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    const numerator = data?.numerator ?? 0;
    const denominator = data?.denominator ?? 0;
    const rate = denominator > 0 ? numerator / denominator : null;
    return {
      numerator,
      denominator,
      rate,
      value: rate === null ? '—' : `${(rate * 100).toFixed(1)}%`,
      dealCount: data?.dealCount ?? 0,
      numeratorDeals: data?.numeratorDeals ?? [],
      denominatorDeals: data?.denominatorDeals ?? [],
      isLoading: loading,
    };
  }, [data, isLoading, isFetching]);
}
