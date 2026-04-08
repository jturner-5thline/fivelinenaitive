import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface ComputedKpi {
  id: string;
  company_id: string;
  metric_key: string;
  metric_value: number | null;
  numerator_value: number | null;
  denominator_value: number | null;
  period_start: string;
  period_end: string;
  status: string;
  error_message: string | null;
  last_refreshed_at: string;
}

export function useComputedKpi(metricKey: string) {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['computed-kpi', company?.id, metricKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('computed_kpis' as any)
        .select('*')
        .eq('company_id', company!.id)
        .eq('metric_key', metricKey)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as ComputedKpi | null;
    },
    enabled: !!company?.id,
    staleTime: 60_000, // 1 min client-side cache
    refetchInterval: 5 * 60_000, // refetch every 5 min
  });
}
