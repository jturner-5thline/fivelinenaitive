import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';

export interface MonthlyPnlPoint {
  monthKey: string;              // YYYY-MM
  month: string;                 // display label
  income: number;
  grossProfit: number;
  operatingProfit: number;       // net_operating_income (income - COGS - opex)
}

/**
 * Per-month P&L snapshot for a QuickBooks realm across the given quarter.
 * For each month we pick the qbo_pnl_snapshots row whose period_start = first
 * of month, taking the row with the latest period_end (fullest month view).
 */
export function useQBMonthlyPnl(realmId: string, quarter: QuarterOption | null) {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qb-monthly-pnl', realmId, user?.id, quarter?.value],
    enabled: !!user && !!quarter,
    staleTime: 30_000,
    queryFn: async (): Promise<MonthlyPnlPoint[]> => {
      if (!quarter) return [];

      // Grab all snapshots overlapping the quarter, then filter to monthly rows client-side.
      const { data: rows, error } = await supabase
        .from('qbo_pnl_snapshots')
        .select('period_start, period_end, income_total, gross_profit, net_operating_income, fetched_at')
        .eq('realm_id', realmId)
        .gte('period_start', quarter.startDate)
        .lte('period_start', quarter.endDate)
        .order('period_end', { ascending: false });

      if (error) throw error;

      // Group by month, pick the row with the latest period_end for each monthKey
      // where period_start = firstOfMonth (i.e., single-month snapshot).
      const byMonth = new Map<string, typeof rows[number]>();
      for (const r of rows ?? []) {
        if (!r.period_start) continue;
        const monthKey = r.period_start.slice(0, 7); // YYYY-MM
        // Confirm this is a single-month snapshot (period_start = 1st of same month).
        if (!r.period_start.endsWith('-01')) continue;
        if (!r.period_end || !r.period_end.startsWith(monthKey)) continue;
        if (!byMonth.has(monthKey)) byMonth.set(monthKey, r);
      }

      return quarter.months.map((m) => {
        const r = byMonth.get(m.key);
        return {
          monthKey: m.key,
          month: m.label,
          income: Number(r?.income_total ?? 0),
          grossProfit: Number(r?.gross_profit ?? 0),
          operatingProfit: Number(r?.net_operating_income ?? 0),
        };
      });
    },
  });

  return {
    months: data ?? [],
    isLoading: isLoading || isFetching,
  };
}

export type PnlMetric = 'revenue' | 'grossProfit' | 'operatingProfit';

export const PNL_METRIC_OPTIONS: { key: PnlMetric; label: string }[] = [
  { key: 'revenue',         label: 'Revenue' },
  { key: 'grossProfit',     label: 'Gross Profit' },
  { key: 'operatingProfit', label: 'Operating Profit' },
];