import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

/**
 * Master Plan monthly values, keyed as `${YYYY}-${MM}` (month is 1-12,
 * zero-padded to match the storage format used by the Master Plan writer).
 *
 * Merges targets from both `plan:sales-dashboard-v2:*` (preferred / newer)
 * and `plan:consolidated-debt-pipeline:*` (fallback), so a widget key
 * authored on either tab of the Master Plan popup surfaces here.
 */
type Row = { metric_key: string; period_month: string | null; target_value: number };

export function useMasterPlanMonthly(widgetKeys: string[]): {
  isLoaded: boolean;
  values: Record<string, Record<string, number>>; // widgetKey -> YYYY-MM -> value
} {
  const { company } = useCompany();
  const keySet = useMemo(() => new Set(widgetKeys), [widgetKeys]);

  const { data, isSuccess } = useQuery({
    queryKey: ['master-plan-monthly', company?.id ?? null, ...[...widgetKeys].sort()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights_metric_targets' as any)
        .select('metric_key, period_month, target_value')
        .or(
          'metric_key.like.plan:sales-dashboard-v2:%,metric_key.like.plan:consolidated-debt-pipeline:%',
        );
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    staleTime: 30_000,
  });

  const values = useMemo(() => {
    const out: Record<string, Record<string, { v2?: number; cdp?: number }>> = {};
    for (const row of data ?? []) {
      if (!row.period_month) continue;
      const parts = row.metric_key.split(':');
      if (parts.length !== 3 || parts[0] !== 'plan') continue;
      const namespace = parts[1];
      const widgetKey = parts[2];
      if (!keySet.has(widgetKey)) continue;
      const monthMap = out[widgetKey] ?? (out[widgetKey] = {});
      const bucket = monthMap[row.period_month] ?? (monthMap[row.period_month] = {});
      if (namespace === 'sales-dashboard-v2') bucket.v2 = Number(row.target_value) || 0;
      else if (namespace === 'consolidated-debt-pipeline') bucket.cdp = Number(row.target_value) || 0;
    }
    const flat: Record<string, Record<string, number>> = {};
    for (const [wk, months] of Object.entries(out)) {
      const m: Record<string, number> = {};
      for (const [ym, b] of Object.entries(months)) {
        const v = b.v2 ?? b.cdp;
        if (v !== undefined) m[ym] = v;
      }
      flat[wk] = m;
    }
    return flat;
  }, [data, keySet]);

  return { isLoaded: isSuccess, values };
}
