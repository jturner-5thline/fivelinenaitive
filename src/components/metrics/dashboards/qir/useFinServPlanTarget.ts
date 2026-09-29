/**
 * Resolves the Master Plan target for a FinServ live KPI over a report period.
 * Reads `insights_metric_targets` rows keyed `plan:finserv-financial-metrics:{widget}`.
 * Dollar metrics sum the months in the period; ratio/average metrics average them.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { LiveMetricPeriod } from './useInsightsLiveMetricValue';

export const FINSERV_SOURCE_TO_PLAN: Record<string, { widget: string; agg: 'sum' | 'avg' }> = {
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
    queryKey: ['finserv-plan-target', company?.id ?? null, map?.widget ?? null, months.join(',')],
    enabled: !!map && months.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      let query = supabase
        .from('insights_metric_targets' as any)
        .select('period_month, target_value')
        .eq('metric_key', `plan:finserv-financial-metrics:${map!.widget}`)
        .in('period_month', months);
      query = company?.id ? query.eq('company_id', company.id) : query.is('company_id', null);
      const { data, error } = await query;
      if (error) throw error;
      const vals = ((data ?? []) as any[])
        .map((r) => Number(r.target_value))
        .filter((n) => Number.isFinite(n));
      if (!vals.length) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return map!.agg === 'sum' ? sum : sum / vals.length;
    },
  });
  return { planTarget: q.data ?? null, mapped: !!map };
}
