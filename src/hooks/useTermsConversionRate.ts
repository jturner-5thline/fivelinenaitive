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

      const { data: histRows, error: histErr } = await supabase
        .from('deal_stage_history')
        .select('deal_id')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', expandStageLabels(QUALIFYING_STAGES))
        .gte('changed_at', startIso);
      if (histErr) throw histErr;

      const dealIds = Array.from(new Set((histRows ?? []).map((r: any) => r.deal_id).filter(Boolean)));
      if (dealIds.length === 0) return { numerator: 0, denominator: 0, dealCount: 0 };

      // Drop globally-excluded demo/test deals.
      const { data: dealRows, error: dealErr } = await supabase
        .from('deals')
        .select('id, company')
        .in('id', dealIds);
      if (dealErr) throw dealErr;
      const keptIds = (dealRows ?? [])
        .filter((d: any) => !isExcludedDealName(d.company))
        .map((d: any) => d.id);
      if (keptIds.length === 0) return { numerator: 0, denominator: 0, dealCount: 0 };

      const { data: lenderRows, error: lenderErr } = await supabase
        .from('deal_lenders')
        .select('id, deal_id, stage, tracking_status')
        .in('deal_id', keptIds);
      if (lenderErr) throw lenderErr;

      const rows = lenderRows ?? [];
      const numerator = rows.filter((r: any) => isLenderTermsOrLater(r.stage, r.tracking_status)).length;

      return { numerator, denominator: rows.length, dealCount: keptIds.length };
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
      isLoading: loading,
    };
  }, [data, isLoading, isFetching]);
}
