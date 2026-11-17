import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { loadFinServNewMrrAdded, type NewMrrDeal } from '@/lib/dashboardTiles/finservTiles';

export type { NewMrrDeal };

/**
 * "New MRR Added" — sum of the MRR value on FinServ deals that entered the
 * Active Client stage inside the selected timeframe.
 */
export function useFinServNewMrrAdded(period?: { start_date: string; end_date: string } | null) {
  const { user } = useAuth();
  const { company } = useCompany();

  const start = period?.start_date;
  const end = period?.end_date;

  const { data, isLoading, error } = useQuery({
    queryKey: ['finserv-new-mrr-added', company?.id, start, end],
    queryFn: async () => {
      if (!company?.id || !start || !end) return { total: 0, deals: [] as NewMrrDeal[] };

      return loadFinServNewMrrAdded(supabase, company.id, start, end);
    },
    enabled: !!user && !!company?.id && !!start && !!end,
    staleTime: 30_000,
  });

  return {
    total: data?.total ?? 0,
    deals: data?.deals ?? [],
    isLoading,
    error: (error as Error) ?? null,
  };
}
