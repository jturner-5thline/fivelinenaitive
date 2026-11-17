import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

import {
  REACHED_FINAL_CREDIT_SLUGS,
  hasReachedFinalCreditStage,
  fetchActivePipelineIds,
  fetchTtmActiveDeals,
  computeTtmConversion,
  ttmAnchorFromTimeframeEnd,
  ttmWindow,
} from '@/lib/dashboardTiles/referralDeals';

export { REACHED_FINAL_CREDIT_SLUGS, hasReachedFinalCreditStage, ttmAnchorFromTimeframeEnd, ttmWindow };

/**
 * Returns ids of pipelines treated as "active pipeline" for the current
 * company: the default pipeline plus any pipeline whose name contains
 * "active". Mirrors the logic in useDealReferralSources.
 */
export function useActivePipelineIds() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['sales_bd_active_pipeline_ids', company?.id],
    enabled: !!company?.id,
    queryFn: () => fetchActivePipelineIds(supabase, company!.id),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Trailing-12-month conversion rate for the Sales & BD overview tiles.
 *
 * Denominator: deals added to an active pipeline in the last 12 months that
 *   match the per-tile sourced filter.
 * Numerator:  subset of that denominator whose stage has reached
 *   "Final Credit Items" (or any later stage).
 *
 * Independent of the shared header date range by design.
 */
export function useTtmActivePipelineConversion(opts: {
  /** 'referral' → sourced_via ILIKE 'referral%';
   *  'partner'  → referred_by matches one of `partnerNames` (case-insensitive). */
  kind: 'referral' | 'partner';
  partnerNames?: string[];
  enabled?: boolean;
  /** Rolling TTM ends here (defaults to now). */
  asOf?: Date;
}) {
  const { company } = useCompany();
  const { data: activePipelineIds = [] } = useActivePipelineIds();

  const asOfMs = opts.asOf?.getTime();
  const { since, until } = useMemo(() => {
    const w = ttmWindow(asOfMs != null ? new Date(asOfMs) : new Date());
    return { since: w.since.toISOString(), until: w.until.toISOString() };
  }, [asOfMs]);

  const enabled =
    (opts.enabled ?? true) && !!company?.id && activePipelineIds.length > 0;

  const { data: deals = [] } = useQuery({
    queryKey: ['ttm_active_pipeline_deals', company?.id, activePipelineIds, since, until],
    enabled,
    queryFn: () => fetchTtmActiveDeals(supabase, company!.id, activePipelineIds, since, until),
    staleTime: 60 * 1000,
  });

  return useMemo(() => {
    const r = computeTtmConversion(deals, opts.kind, opts.partnerNames);
    return { numerator: r.numerator, denominator: r.denominator, label: r.label };
  }, [deals, opts.kind, opts.partnerNames]);
}
