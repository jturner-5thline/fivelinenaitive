import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { mergeMasterPlanRows } from '@/lib/dashboardTiles/salesModelPlan';

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
      let query = supabase
        .from('insights_metric_targets' as any)
        .select('metric_key, period_month, target_value')
        .or(
          'metric_key.like.plan:sales-dashboard-v2:%,metric_key.like.plan:consolidated-debt-pipeline:%',
        );
      query = company?.id ? query.eq('company_id', company.id) : query.is('company_id', null);
      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    staleTime: 30_000,
  });

  const values = useMemo(() => mergeMasterPlanRows(data ?? [], keySet), [data, keySet]);

  return { isLoaded: isSuccess, values };
}
