/**
 * Resolves the Master Plan target for a FinServ live KPI over a report period.
 * Reads `insights_metric_targets` rows keyed `plan:finserv-financial-metrics:{widget}`.
 * Dollar metrics sum the months in the period; ratio/average metrics average them.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { LiveMetricPeriod } from './useInsightsLiveMetricValue';

type PlanMap = { widget: string; agg: 'sum' | 'avg'; dashboards?: string[] };
const DA_DASH = ['consolidated-debt-pipeline', 'sales-dashboard-v2'];
export const FINSERV_SOURCE_TO_PLAN: Record<string, PlanMap> = {
  // Debt Advisory metrics → Master Plan (consolidated pipeline, falling back to Sales dashboard per month)
  'da-deals-on-board-count': { widget: 'deals-on-board', agg: 'sum', dashboards: DA_DASH },
  'da-deals-on-board-dollars': { widget: 'deals-on-board-value', agg: 'sum', dashboards: DA_DASH },
  'da-proposals-issued-count': { widget: 'proposals-issued', agg: 'sum', dashboards: DA_DASH },
  'da-proposals-issued-dollars': { widget: 'dollars-proposed', agg: 'sum', dashboards: DA_DASH },
  'da-debt-deals-signed-count': { widget: 'deals-signed', agg: 'sum', dashboards: DA_DASH },
  'da-debt-deals-signed-dollars': { widget: 'dollars-signed', agg: 'sum', dashboards: DA_DASH },
  'da-terms-issued-count': { widget: 'terms-issued', agg: 'sum', dashboards: DA_DASH },
  'da-terms-issued-dollars': { widget: 'dollars-terms-issued', agg: 'sum', dashboards: DA_DASH },
  'da-terms-signed-count': { widget: 'terms-signed', agg: 'sum', dashboards: DA_DASH },
  'da-terms-signed-dollars': { widget: 'volume-of-terms-signed', agg: 'sum', dashboards: DA_DASH },
  'da-deals-closed-count': { widget: 'deals-closed', agg: 'sum', dashboards: DA_DASH },
  'da-deals-closed-dollars': { widget: 'dollars-funded', agg: 'sum', dashboards: DA_DASH },
  'finserv-total-revenue': { widget: 'total-revenue', agg: 'sum' },
  'finserv-gross-profit': { widget: 'gross-profit', agg: 'sum' },
  'finserv-gross-margin': { widget: 'gross-margin', agg: 'avg' },
  'finserv-utilization': { widget: 'utilization', agg: 'avg' },
  'finserv-total-opex': { widget: 'total-opex', agg: 'sum' },
  'finserv-avg-revenue-per-client': { widget: 'avg-rev-per-client', agg: 'avg' },
};

/** Lower-is-better metrics (beating plan means coming in under it). */
export const FINSERV_LOWER_IS_BETTER = new Set(['finserv-total-opex']);

function monthsInPeriod(p: LiveMetricPeriod): string[] {
  const [sy, sm] = p.start.split('-').map(Number);
  const [ey, em] = p.end.split('-').map(Number);
  const out: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function useFinServPlanTarget(metricSourceId: string | null | undefined, period: LiveMetricPeriod | null) {
  const { company } = useCompany();
  const map = metricSourceId ? FINSERV_SOURCE_TO_PLAN[metricSourceId] : undefined;
  const months = period ? monthsInPeriod(period) : [];
  const q = useQuery({
    queryKey: ['finserv-plan-target', 'v2', company?.id ?? null, map?.widget ?? null, months.join(',')],
    enabled: !!map && months.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const dashes = map!.dashboards ?? ['finserv-financial-metrics'];
      const keys = dashes.map((d) => `plan:${d}:${map!.widget}`);
      let query = supabase
        .from('insights_metric_targets' as any)
        .select('metric_key, period_month, target_value')
        .in('metric_key', keys)
        .in('period_month', months);
      query = company?.id ? query.eq('company_id', company.id) : query.is('company_id', null);
      const { data, error } = await query;
      if (error) throw error;
      // Per month, take the first dashboard (in priority order) that has a value.
      const byMonth = new Map<string, number>();
      for (const k of keys) {
        for (const r of (data ?? []) as any[]) {
          if (r.metric_key !== k || byMonth.has(r.period_month)) continue;
          const n = Number(r.target_value);
          if (r.target_value != null && Number.isFinite(n)) byMonth.set(r.period_month, n);
        }
      }
      const vals = Array.from(byMonth.values());
      if (!vals.length) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return map!.agg === 'sum' ? sum : sum / vals.length;
    },
  });
  return { planTarget: q.data ?? null, mapped: !!map };
}
