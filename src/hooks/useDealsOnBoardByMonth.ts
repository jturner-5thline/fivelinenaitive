import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * "Deals on Board" — mirrors the Consolidated Debt Pipeline Board logic
 * (usePipelineDealsInPeriod) but returns the deals bucketed by the
 * calendar month of `created_at`, scoped to the Active Pipeline and
 * excluding closed-won / closed-lost / on-hold / archived deals plus
 * globally-excluded test deals.
 *
 * Range: full calendar year [year, year+1) in UTC.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

export interface DealOnBoardEntry {
  id: string;
  company: string;
  value: number;
  manager: string | null;
  stage: string | null;
  created_at: string;
  month_index: number; // 0..11 in UTC
}

export interface DealsOnBoardByMonthResult {
  deals: DealOnBoardEntry[];
  byMonth: DealOnBoardEntry[][]; // length 12
  countsByMonth: number[];       // length 12
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useDealsOnBoardByMonth(year: number): DealsOnBoardByMonthResult {
  const { user } = useAuth();

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['deals-on-board-by-month', ACTIVE_PIPELINE_ID, year],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deals')
        .select('id, company, value, manager, stage, pipeline_id, created_at, status')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const excludedStatuses = new Set(['closed-won', 'closed-lost', 'on-hold', 'archived']);
  const excludedStages = new Set(['closed-won', 'closed-lost']);

  const deals: DealOnBoardEntry[] = (data ?? [])
    .filter((d: any) => {
      const status = (d.status || '').toLowerCase();
      const stage = (d.stage || '').toLowerCase();
      return (
        !excludedStatuses.has(status) &&
        !excludedStages.has(stage) &&
        !isExcludedDealName(d.company)
      );
    })
    .map((d: any) => {
      const created = new Date(d.created_at);
      return {
        id: d.id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager ?? null,
        stage: d.stage ?? null,
        created_at: d.created_at,
        month_index: created.getUTCMonth(),
      };
    });

  const byMonth: DealOnBoardEntry[][] = Array.from({ length: 12 }, () => []);
  for (const d of deals) {
    if (d.month_index >= 0 && d.month_index < 12) byMonth[d.month_index].push(d);
  }
  const countsByMonth = byMonth.map((arr) => arr.length);

  return {
    deals,
    byMonth,
    countsByMonth,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}