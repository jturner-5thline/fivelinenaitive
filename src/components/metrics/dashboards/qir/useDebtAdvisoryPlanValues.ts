/**
 * Fetches Master Plan values for the Debt Advisory Metrics dashboard so KPI
 * tiles can render a "Performance to Plan" chip alongside the default
 * period-over-period variance chip.
 *
 * Plan values are entered in the Master Plan popup and live in
 * `insights_metric_targets` keyed by
 *   metric_key   = `plan:{dashboardKey}:{widgetKey}`
 *   period_month = `YYYY-MM`
 *
 * A quarter's plan value = sum of the plan values entered for the 3 months
 * that make up the quarter. Where a widget is "linked" between the
 * consolidated-debt-pipeline and sales-dashboard-v2 dashboards, we prefer the
 * consolidated-debt-pipeline entry and fall back to sales-dashboard-v2.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { QuarterOption } from '@/hooks/useQBQuarterlyRevenue';

/**
 * KPI card id → Master Plan widget keys.
 * `primary` maps the main tile value; `secondary` maps the tile's optional
 * secondary value (typically the $ counterpart of a # metric).
 */
export const DEBT_ADVISORY_KPI_TO_PLAN: Record<
  string,
  { primary?: string; secondary?: string }
> = {
  'deals-on-board': { primary: 'deals-on-board', secondary: 'deals-on-board-value' },
  'proposals-issued': { primary: 'proposals-issued', secondary: 'dollars-proposed' },
  'debt-deals-signed': { primary: 'deals-signed', secondary: 'dollars-signed' },
  'terms-issued': { primary: 'terms-issued' },
  'terms-signed': { primary: 'terms-signed', secondary: 'volume-of-terms-signed' },
  'deals-closed': { primary: 'deals-closed', secondary: 'dollars-funded' },
  'total-revenue-opportunity': { primary: 'total-revenue-opportunity' },
};

const ALL_WIDGET_KEYS = Array.from(
  new Set(
    Object.values(DEBT_ADVISORY_KPI_TO_PLAN)
      .flatMap((m) => [m.primary, m.secondary])
      .filter((k): k is string => !!k),
  ),
);

const DASHBOARD_KEYS = ['consolidated-debt-pipeline', 'sales-dashboard-v2'] as const;

function buildMetricKeys(): string[] {
  const keys: string[] = [];
  for (const dash of DASHBOARD_KEYS) {
    for (const w of ALL_WIDGET_KEYS) keys.push(`plan:${dash}:${w}`);
  }
  return keys;
}

export interface DebtAdvisoryPlanValues {
  /** Widget key → summed plan value for the resolved period. */
  values: Map<string, number>;
  /** Human label for the resolved period (e.g. "Q3 2026"). */
  periodLabel: string;
  isLoading: boolean;
}

export function useDebtAdvisoryPlanValues(
  selectedQuarter: QuarterOption | undefined,
): DebtAdvisoryPlanValues {
  const { company } = useCompany();

  const periodKeys = useMemo(
    () => (selectedQuarter?.months ?? []).map((m) => m.key),
    [selectedQuarter],
  );

  const query = useQuery({
    queryKey: [
      'debt-advisory-plan-values',
      company?.id ?? null,
      selectedQuarter?.value ?? null,
    ],
    enabled: !!selectedQuarter,
    staleTime: 30_000,
    queryFn: async () => {
      if (!selectedQuarter || periodKeys.length === 0) return new Map<string, number>();
      const metricKeys = buildMetricKeys();
      let q = supabase
        .from('insights_metric_targets' as any)
        .select('metric_key, period_month, target_value')
        .in('metric_key', metricKeys)
        .in('period_month', periodKeys);
      q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;

      // Sum by (dashboard, widget). Prefer consolidated-debt-pipeline if both
      // dashboards have entries for the same widget.
      type Row = { metric_key: string; period_month: string; target_value: number | null };
      const byDashWidget = new Map<string, number>();
      for (const raw of ((data ?? []) as unknown as Row[])) {
        const parts = raw.metric_key.split(':');
        if (parts.length < 3 || parts[0] !== 'plan') continue;
        const dash = parts[1];
        const widget = parts.slice(2).join(':');
        const key = `${dash}::${widget}`;
        const cur = byDashWidget.get(key) ?? 0;
        byDashWidget.set(key, cur + Number(raw.target_value ?? 0));
      }

      const result = new Map<string, number>();
      for (const widget of ALL_WIDGET_KEYS) {
        const primary = byDashWidget.get(`consolidated-debt-pipeline::${widget}`);
        const fallback = byDashWidget.get(`sales-dashboard-v2::${widget}`);
        const value = primary ?? fallback;
        if (value != null) result.set(widget, value);
      }
      return result;
    },
  });

  return {
    values: query.data ?? new Map<string, number>(),
    periodLabel: selectedQuarter?.label ?? '',
    isLoading: query.isLoading,
  };
}

/**
 * Fetches Master Plan values keyed by trend-chart bucket, so the debt advisory
 * bar charts can overlay a plan line in "Performance to Plan" mode.
 *
 * Bucket keys are either monthly (`YYYY-MM`) or quarterly (`YYYY-QN`). For
 * quarterly buckets the plan value is the sum of the 3 constituent months.
 */
export function useDebtAdvisoryPlanForBuckets(
  widgetKey: string | undefined,
  buckets: ReadonlyArray<{ key: string }>,
): { values: Map<string, number>; isLoading: boolean } {
  const { company } = useCompany();

  const { monthKeys, bucketMonths } = useMemo(() => {
    const bm = new Map<string, string[]>();
    const all = new Set<string>();
    for (const b of buckets) {
      const months = expandBucketKey(b.key);
      bm.set(b.key, months);
      months.forEach((m) => all.add(m));
    }
    return { monthKeys: Array.from(all), bucketMonths: bm };
  }, [buckets]);

  const query = useQuery({
    queryKey: [
      'debt-advisory-plan-buckets',
      company?.id ?? null,
      widgetKey ?? null,
      monthKeys.join(','),
    ],
    enabled: !!widgetKey && monthKeys.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (!widgetKey || monthKeys.length === 0) return new Map<string, number>();
      const metricKeys = DASHBOARD_KEYS.map((d) => `plan:${d}:${widgetKey}`);
      let q = supabase
        .from('insights_metric_targets' as any)
        .select('metric_key, period_month, target_value')
        .in('metric_key', metricKeys)
        .in('period_month', monthKeys);
      q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;

      // Prefer consolidated-debt-pipeline, fall back to sales-dashboard-v2.
      type Row = { metric_key: string; period_month: string; target_value: number | null };
      const byDashMonth = new Map<string, number>();
      for (const raw of ((data ?? []) as unknown as Row[])) {
        const parts = raw.metric_key.split(':');
        if (parts.length < 3) continue;
        const dash = parts[1];
        const key = `${dash}::${raw.period_month}`;
        byDashMonth.set(key, Number(raw.target_value ?? 0));
      }
      const monthValue = (m: string): number | null => {
        const primary = byDashMonth.get(`consolidated-debt-pipeline::${m}`);
        if (primary != null) return primary;
        const fallback = byDashMonth.get(`sales-dashboard-v2::${m}`);
        return fallback ?? null;
      };

      const out = new Map<string, number>();
      bucketMonths.forEach((months, bucketKey) => {
        let sum = 0;
        let any = false;
        for (const m of months) {
          const v = monthValue(m);
          if (v != null) {
            sum += v;
            any = true;
          }
        }
        if (any) out.set(bucketKey, sum);
      });
      return out;
    },
  });

  return {
    values: query.data ?? new Map<string, number>(),
    isLoading: query.isLoading,
  };
}

/** Expand a bucket key ("YYYY-MM" or "YYYY-QN") into its month keys. */
function expandBucketKey(key: string): string[] {
  const quarterMatch = key.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const q = Number(quarterMatch[2]);
    const startMonth = (q - 1) * 3 + 1;
    return [0, 1, 2].map(
      (i) => `${year}-${String(startMonth + i).padStart(2, '0')}`,
    );
  }
  if (/^\d{4}-\d{2}$/.test(key)) return [key];
  return [];
}
