import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Time-in-transit metrics between two `stage_enter` events.
 *
 * Pairs each deal's earliest `from` stage_enter with the nearest subsequent
 * `to` stage_enter (any intermediate stages allowed), buckets results by the
 * destination event month, and returns avg/median months + deal count per
 * bucket over a trailing window anchored on today.
 *
 * Read-only: queries the `get_stage_transit_monthly` RPC. Inverted pairs
 * (fci_at < pi_at) are excluded from metrics and logged to
 * `data_quality_issues` via `log_inverted_pi_fci_pairs`.
 *
 * Stage matching uses the same case-/whitespace-insensitive text-label
 * resolver as usePipelineStageMetrics (the `to_stage_id` column is
 * intentionally ignored — it's overloaded in the In Development pipeline).
 */

export interface StageTransitBucket {
  /** YYYY-MM key, e.g. "2026-04". */
  key: string;
  /** Display label, e.g. "Apr 26". */
  label: string;
  /** First day of the bucket month (ISO). */
  monthStart: string;
  avgMonths: number;
  medianMonths: number;
  dealCount: number;
}

export interface UseStageTransitMetricsArgs {
  fromVariants: string[];
  toVariants: string[];
  /** Trailing window in months. Defaults to 12. */
  windowMonths?: number;
  /** Anchor date for the window. Defaults to "now". */
  anchorDate?: Date;
  /** Log inverted (DQ) pairs as a side-effect. Defaults to true. */
  logInverted?: boolean;
}

export interface StageTransitMetricsResult {
  buckets: StageTransitBucket[];
  totalDeals: number;
  isLoading: boolean;
  error: Error | null;
  lastRefresh: Date | null;
}

const MONTH_LABEL_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  // "Apr 26" — matches Stage Movement chart label format.
  return MONTH_LABEL_FMT.format(d).replace(',', '');
}

/** Build a complete trailing-N-month skeleton anchored to `anchor` (UTC). */
function buildMonthSkeleton(anchor: Date, windowMonths: number): StageTransitBucket[] {
  const out: StageTransitBucket[] = [];
  // Start at the first day of (anchor month - (windowMonths - 1)).
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (windowMonths - 1), 1));
  for (let i = 0; i < windowMonths; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    out.push({
      key: monthKey(d),
      label: monthLabel(d),
      monthStart: d.toISOString(),
      avgMonths: 0,
      medianMonths: 0,
      dealCount: 0,
    });
  }
  return out;
}

export function useStageTransitMetrics({
  fromVariants,
  toVariants,
  windowMonths = 12,
  anchorDate,
  logInverted = true,
}: UseStageTransitMetricsArgs): StageTransitMetricsResult {
  // CRITICAL: anchor must be stable across renders. `new Date()` on every
  // render mutates the React Query key, which triggers an infinite
  // refetch loop (each refetch flips isLoading back to true, so the
  // card never escapes its skeleton state).
  const stableAnchorRef = useRef<Date | null>(null);
  if (stableAnchorRef.current === null) {
    stableAnchorRef.current = anchorDate ?? new Date();
  } else if (anchorDate && anchorDate.getTime() !== stableAnchorRef.current.getTime()) {
    stableAnchorRef.current = anchorDate;
  }
  const anchor = stableAnchorRef.current;
  const anchorIso = useMemo(() => anchor.toISOString(), [anchor]);

  // Stabilize variant arrays so callers can pass inline literals without
  // tripping the same key-drift loop.
  const fromKey = useMemo(() => fromVariants.join('|'), [fromVariants]);
  const toKey = useMemo(() => toVariants.join('|'), [toVariants]);

  const query = useQuery({
    queryKey: ['stage-transit-monthly', fromKey, toKey, windowMonths, anchorIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_stage_transit_monthly', {
        p_from_variants: fromVariants,
        p_to_variants: toVariants,
        p_window_months: windowMonths,
        p_anchor: anchorIso,
      });
      if (error) throw error;

      // Side-effect: log inverted PI→FCI pairs to data_quality_issues.
      // Fire-and-forget; failure here must not break the chart.
      if (logInverted) {
        supabase
          .rpc('log_inverted_pi_fci_pairs', {
            p_from_variants: fromVariants,
            p_to_variants: toVariants,
          })
          .then(({ error: e }) => {
            if (e) console.warn('[stage-transit-PI-FCI] DQ log failed', e);
          });
      }

      const rows = (data ?? []) as Array<{
        bucket_month: string;
        avg_months: string | number | null;
        median_months: string | number | null;
        deal_count: number | string;
      }>;

      if (rows.length === 0) {
        console.warn('[stage-transit-PI-FCI] 0 rows', {
          fromVariants,
          toVariants,
          windowMonths,
          anchor: anchorIso,
        });
      }

      const skeleton = buildMonthSkeleton(anchor, windowMonths);
      const byKey = new Map(skeleton.map((b) => [b.key, b]));
      for (const row of rows) {
        const d = new Date(row.bucket_month);
        const k = monthKey(d);
        const bucket = byKey.get(k);
        if (!bucket) continue;
        bucket.avgMonths = Number(row.avg_months ?? 0);
        bucket.medianMonths = Number(row.median_months ?? 0);
        bucket.dealCount = Number(row.deal_count ?? 0);
      }
      return skeleton;
    },
    staleTime: 60_000,
  });

  const buckets = query.data ?? [];
  const totalDeals = buckets.reduce((s, b) => s + b.dealCount, 0);

  return {
    buckets,
    totalDeals,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    lastRefresh: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}
