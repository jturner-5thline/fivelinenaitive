import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns true when the `ff_pilot_kpi_tracking` feature flag status is
 * either 'staging' or 'deployed'. Cached for 5 minutes.
 */
export function usePilotKpiFlag(): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['feature-flag', 'ff_pilot_kpi_tracking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('status')
        .eq('name', 'ff_pilot_kpi_tracking')
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 5 * 60_000,
  });
  const status = (data as any)?.status as string | undefined;
  return { enabled: status === 'deployed' || status === 'staging', isLoading };
}