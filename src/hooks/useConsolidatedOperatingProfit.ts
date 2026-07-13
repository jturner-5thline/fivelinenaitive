import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { QBO_ENTITIES } from '@/config/qboEntities';
import { ensureFinServPnlSnapshots } from '@/hooks/useFinServFinancialMetrics';

/**
 * Live consolidated Operating Profit (a.k.a. Net Operating Income) across
 * every connected QuickBooks entity, bucketed by calendar quarter for the
 * requested year. Powers the "Actuals" row on the Insights Key Status
 * widget's Consolidated / YTD / Debt Advisory Operating Profit tiles.
 *
 * Values are summed from `qbo_pnl_snapshots.net_operating_income` on the
 * Accrual basis. Missing snapshots are backfilled through
 * `ensureFinServPnlSnapshots` (reused for each realm), which matches the
 * source of truth for the FinServ Financial Metrics dashboard.
 */
export interface QuarterlyOpProfit {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  total: number;
}

function quarterPeriods(year: number) {
  return [1, 2, 3, 4].map((q) => {
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return {
      q,
      start_date: fmt(start),
      end_date: fmt(end),
      label: `Q${q} ${year}`,
      key: `${year}-Q${q}`,
    };
  });
}

export function useConsolidatedOperatingProfit(
  year: number,
  options: { realmIds?: string[] } = {},
) {
  const { user } = useAuth();
  const { company } = useCompany();
  const realmIds = useMemo(
    () => options.realmIds ?? QBO_ENTITIES.map((e) => e.realmId),
    [options.realmIds],
  );
  const periods = useMemo(() => quarterPeriods(year), [year]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'consolidated-op-profit',
      user?.id,
      company?.id,
      year,
      realmIds.join(','),
    ],
    enabled: !!user && !!company?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<QuarterlyOpProfit> => {
      if (!company?.id) return { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };

      // Ensure every (realm × quarter) snapshot exists / is fresh.
      const snapPeriods = periods.map((p) => ({
        start_date: p.start_date,
        end_date: p.end_date,
      }));
      await Promise.all(
        realmIds.map((rid) =>
          ensureFinServPnlSnapshots(company.id, snapPeriods, rid).catch(
            (err) => {
              console.warn(
                '[useConsolidatedOperatingProfit] ensure snapshots failed',
                { realmId: rid, err },
              );
            },
          ),
        ),
      );

      // Read them back for aggregation.
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const { data: rows, error } = await supabase
        .from('qbo_pnl_snapshots')
        .select('realm_id, period_start, period_end, net_operating_income')
        .eq('company_id', company.id)
        .in('realm_id', realmIds)
        .eq('accounting_method', 'Accrual')
        .gte('period_start', yearStart)
        .lte('period_end', yearEnd);
      if (error) throw error;

      const byKey = new Map<string, number>();
      for (const r of rows ?? []) {
        byKey.set(
          `${r.realm_id}_${r.period_start}_${r.period_end}`,
          Number(r.net_operating_income ?? 0),
        );
      }

      const q: number[] = [0, 0, 0, 0];
      for (const p of periods) {
        for (const rid of realmIds) {
          q[p.q - 1] += byKey.get(`${rid}_${p.start_date}_${p.end_date}`) ?? 0;
        }
      }

      return {
        q1: q[0],
        q2: q[1],
        q3: q[2],
        q4: q[3],
        total: q[0] + q[1] + q[2] + q[3],
      };
    },
  });

  return {
    q1: data?.q1 ?? 0,
    q2: data?.q2 ?? 0,
    q3: data?.q3 ?? 0,
    q4: data?.q4 ?? 0,
    total: data?.total ?? 0,
    isLoading: isLoading || isFetching,
  };
}
