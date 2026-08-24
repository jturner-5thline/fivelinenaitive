import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { FINSERV_PIPELINE_ID, ACTIVE_CLIENT_STAGE } from '@/hooks/useFinServFinancialMetrics';

export interface NewMrrDeal {
  deal_id: string;
  company: string;
  mrr: number;
  entered_at: string;
}

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

      const { data: rows, error: err } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, to_stage, deals!inner(company, mrr, company_id, pipeline_id)')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', FINSERV_PIPELINE_ID)
        .in('to_stage', [ACTIVE_CLIENT_STAGE, 'Active Client'])
        .gte('changed_at', start)
        .lte('changed_at', end + 'T23:59:59.999Z')
        .order('changed_at', { ascending: true });
      if (err) throw err;

      const seen = new Map<string, NewMrrDeal>();
      for (const row of (rows ?? []) as any[]) {
        const deal = row.deals;
        if (!deal || deal.company_id !== company.id) continue;
        if (isExcludedDealName(deal.company)) continue;
        if (seen.has(row.deal_id)) continue;
        seen.set(row.deal_id, {
          deal_id: row.deal_id,
          company: deal.company ?? '—',
          mrr: Number(deal.mrr) || 0,
          entered_at: row.changed_at,
        });
      }

      const deals = Array.from(seen.values());
      return { total: deals.reduce((s, d) => s + d.mrr, 0), deals };
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
