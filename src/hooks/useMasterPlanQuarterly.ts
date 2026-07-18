import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { PlanMetricKey, QuarterlyTargets } from '@/hooks/useNikiPerformancePlan';
import type { QuarterKey } from '@/hooks/useNikiPerformanceMetrics';

/**
 * Master Plan → Rep-Performance widget bridge.
 *
 * The Niki / rep performance scorecard historically read its Plan values from
 * per-user localStorage. Users edit plans in one place — the Master Plan
 * dialog (Insights → Master Plan), which persists monthly targets to
 * `insights_metric_targets` under two dashboard namespaces:
 *   - `plan:sales-dashboard-v2:*`         (preferred / newer)
 *   - `plan:consolidated-debt-pipeline:*` (fallback)
 *
 * This hook fetches those monthly targets, aggregates them into 2026 quarters,
 * and returns them keyed by the rep-performance `PlanMetricKey` so the
 * scorecard renders "Plan" straight from the Master Plan instead of a stale
 * localStorage snapshot.
 */

// Rep-performance widget key → Master Plan widget key (same for both namespaces).
const PLAN_WIDGET_KEY_BY_METRIC: Partial<Record<PlanMetricKey, string>> = {
  dealsOnBoard: 'deals-on-board',
  dollarsOnBoard: 'deals-on-board-value',
  proposalsIssued: 'proposals-issued',
  dollarsProposed: 'dollars-proposed',
  clientsSigned: 'deals-signed',
  dollarsSigned: 'dollars-signed',
  clientsReceivingTerms: 'clients-receiving-terms',
  termsSigned: 'terms-signed',
  volumeTermsSigned: 'volume-of-terms-signed',
  dealsClosed: 'deals-closed',
  dollarsFunded: 'dollars-funded',
  retainerRevenue: 'retainer-revenue',
  consultingMilestoneRevenue: 'consulting-milestone-revenue',
  feeRevenue: 'fee-revenue',
  totalRevenue: 'total-revenue',
};

const YEAR = 2026;
const QUARTER_MONTHS: Record<QuarterKey, string[]> = {
  Q1: [`${YEAR}-01`, `${YEAR}-02`, `${YEAR}-03`],
  Q2: [`${YEAR}-04`, `${YEAR}-05`, `${YEAR}-06`],
  Q3: [`${YEAR}-07`, `${YEAR}-08`, `${YEAR}-09`],
  Q4: [`${YEAR}-10`, `${YEAR}-11`, `${YEAR}-12`],
};

type Row = { metric_key: string; period_month: string | null; target_value: number };

export function useMasterPlanQuarterly(): {
  isLoaded: boolean;
  plan: Partial<Record<PlanMetricKey, QuarterlyTargets>>;
} {
  const { company } = useCompany();
  const { data, isSuccess } = useQuery({
    queryKey: ['master-plan-quarterly', YEAR, company?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights_metric_targets' as any)
        .select('metric_key, period_month, target_value')
        .or(
          'metric_key.like.plan:sales-dashboard-v2:%,metric_key.like.plan:consolidated-debt-pipeline:%',
        )
        .gte('period_month', `${YEAR}-01`)
        .lte('period_month', `${YEAR}-12`);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    staleTime: 30_000,
  });

  const plan = useMemo<Partial<Record<PlanMetricKey, QuarterlyTargets>>>(() => {
    if (!data) return {};
    // Build widgetKey → month → { salesV2?: number; consolidated?: number }
    const byWidgetMonth = new Map<string, Map<string, { v2?: number; cdp?: number }>>();
    for (const row of data) {
      if (!row.period_month) continue;
      const parts = row.metric_key.split(':');
      if (parts.length !== 3 || parts[0] !== 'plan') continue;
      const namespace = parts[1];
      const widgetKey = parts[2];
      const monthMap = byWidgetMonth.get(widgetKey) ?? new Map();
      const bucket = monthMap.get(row.period_month) ?? {};
      if (namespace === 'sales-dashboard-v2') bucket.v2 = Number(row.target_value) || 0;
      else if (namespace === 'consolidated-debt-pipeline') bucket.cdp = Number(row.target_value) || 0;
      monthMap.set(row.period_month, bucket);
      byWidgetMonth.set(widgetKey, monthMap);
    }

    const out: Partial<Record<PlanMetricKey, QuarterlyTargets>> = {};
    for (const [metricKey, widgetKey] of Object.entries(PLAN_WIDGET_KEY_BY_METRIC) as [
      PlanMetricKey,
      string,
    ][]) {
      const monthMap = byWidgetMonth.get(widgetKey);
      if (!monthMap) continue;
      const quarterly: QuarterlyTargets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      let anySet = false;
      for (const q of ['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[]) {
        for (const ym of QUARTER_MONTHS[q]) {
          const b = monthMap.get(ym);
          if (!b) continue;
          // Prefer sales-dashboard-v2 (newer surface); fall back to consolidated.
          const v = b.v2 ?? b.cdp;
          if (v !== undefined) {
            quarterly[q] += v;
            anySet = true;
          }
        }
      }
      if (anySet) out[metricKey] = quarterly;
    }
    return out;
  }, [data]);

  return { isLoaded: isSuccess, plan };
}
