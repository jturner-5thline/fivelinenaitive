import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

/**
 * Stages that count as having reached the "Final Credit Items" milestone in
 * the Active pipeline (Final Credit Items itself + every later stage).
 * Source: src/utils/reportGenerator.ts stage progression order +
 *   src/utils/dealStageUtils.ts POST_SUBMISSION_STAGES.
 */
export const REACHED_FINAL_CREDIT_SLUGS: ReadonlySet<string> = new Set([
  'final-credit-items',
  'client-strategy-review',
  'write-up-pending',
  'submitted-to-lenders',
  'lenders-in-review',
  'terms-issued',
  'in-due-diligence',
  'agreement-pending',
  'funded-invoiced',
  'closed-won',
]);

export function hasReachedFinalCreditStage(stage?: string | null): boolean {
  if (!stage) return false;
  return REACHED_FINAL_CREDIT_SLUGS.has(stage.toLowerCase().trim());
}

interface ActiveTtmDeal {
  id: string;
  stage: string | null;
  sourced_via: string | null;
  referred_by: string | null;
  created_at: string;
}

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, name, is_default')
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || [])
        .filter(p => p.is_default || p.name.toLowerCase().includes('active'))
        .map(p => p.id);
    },
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
/**
 * Anchor for rolling TTM: end of the selected header timeframe (YYYY-MM-DD,
 * end of day), capped at `now` so an in-progress period never looks ahead.
 */
export function ttmAnchorFromTimeframeEnd(end?: string | null, now = new Date()): Date {
  if (!end) return now;
  const d = new Date(`${end}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return now;
  return d.getTime() > now.getTime() ? now : d;
}

/** 12-month window ending at `anchor`. */
export function ttmWindow(anchor: Date): { since: Date; until: Date } {
  const since = new Date(anchor);
  since.setMonth(since.getMonth() - 12);
  return { since, until: anchor };
}

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, stage, sourced_via, referred_by, created_at')
        .eq('company_id', company!.id)
        .in('pipeline_id', activePipelineIds)
        .gte('created_at', since)
        .lte('created_at', until);
      if (error) throw error;
      return (data || []) as ActiveTtmDeal[];
    },
    staleTime: 60 * 1000,
  });

  return useMemo(() => {
    const partnerSet = new Set(
      (opts.partnerNames || []).map(n => n.toLowerCase().trim()),
    );
    const matchesFilter = (d: ActiveTtmDeal) => {
      if (opts.kind === 'referral') {
        return !!d.sourced_via && /^referral/i.test(d.sourced_via.trim());
      }
      const ref = (d.referred_by || '').toLowerCase().trim();
      return !!ref && partnerSet.has(ref);
    };
    const denom = deals.filter(matchesFilter);
    const numer = denom.filter(d => hasReachedFinalCreditStage(d.stage));
    const label =
      denom.length === 0
        ? '—'
        : `${((numer.length / denom.length) * 100).toFixed(1)}%`;
    return {
      numerator: numer.length,
      denominator: denom.length,
      label,
    };
  }, [deals, opts.kind, opts.partnerNames]);
}