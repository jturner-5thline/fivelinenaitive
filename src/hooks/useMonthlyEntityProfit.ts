import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DEBT_REALM_ID = '193514877331929';
const FINSERV_REALM_ID = '9341451968897660';

export const ENTITY_REALM_MAP: Record<string, string> = {
  '5th Line Capital Advisors, LLC': DEBT_REALM_ID,
  '5th Line Financial Services, LLC': FINSERV_REALM_ID,
};

export interface ProfitMonthBucket {
  label: string; // "Feb 26"
  key: string;   // "2026-02"
  revenue: number;
  expenses: number;
  profit: number;
}

export type MonthDef = { key: string; label: string; start: string; end: string };

// Walk a QBO ProfitAndLoss report tree and return the Summary value for
// a given group ("Income" | "Expenses" | "NetIncome").
function extractGroupValue(reportData: any, group: string): number | null {
  const visit = (row: any): number | null => {
    if (!row) return null;
    if (row.group === group) {
      const v = row?.Summary?.ColData?.[1]?.value;
      const n = v === '' || v == null ? 0 : Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    const children: any[] = row?.Rows?.Row ?? [];
    for (const c of children) {
      const r = visit(c);
      if (r !== null) return r;
    }
    return null;
  };
  const top: any[] = reportData?.Rows?.Row ?? [];
  for (const r of top) {
    const v = visit(r);
    if (v !== null) return v;
  }
  return null;
}

export function useMonthlyEntityProfit(entityName: string, quarterMonths: MonthDef[]) {
  const { user } = useAuth();
  const realmId = ENTITY_REALM_MAP[entityName];
  const buckets = useMemo(
    () => quarterMonths.map((m) => ({
      label: `${m.label} ${m.key.slice(2, 4)}`,
      key: m.key,
      start: m.start,
      end: m.end,
    })),
    [quarterMonths],
  );
  const startDate = buckets[0]?.start ?? '';
  const endDate = buckets[buckets.length - 1]?.end ?? '';

  // Single query per entity — fetch any cached monthly P&L reports overlapping
  // the requested quarter. Each report row already carries the parsed
  // accrual-basis P&L tree in `report_data`, so we don't need to sum raw
  // transactions.
  const { data: reports, isLoading, isFetching, error } = useQuery({
    queryKey: ['entity-profit-pnl-reports', realmId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_reports')
        .select('period_start, period_end, report_data')
        .eq('realm_id', realmId)
        .eq('report_type', 'profit_and_loss')
        .gte('period_start', startDate)
        .lte('period_end', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId && !!startDate && !!endDate,
  });

  const loading = isLoading || isFetching;

  return useMemo(() => {
    // Map each bucket to a matching monthly P&L report (exact period match
    // + accrual basis). If none exists, leave the bucket at 0 and let the
    // skeleton state communicate "no data yet" upstream.
    const reportByKey = new Map<string, any>();
    for (const r of reports ?? []) {
      const data: any = r.report_data;
      const basis = data?.Header?.ReportBasis;
      if (basis && basis !== 'Accrual') continue;
      const bucket = buckets.find(
        (b) => b.start === r.period_start && b.end === r.period_end,
      );
      if (bucket) reportByKey.set(bucket.key, data);
    }

    const months: ProfitMonthBucket[] = buckets.map((b) => {
      const report = reportByKey.get(b.key);
      if (!report) {
        return { label: b.label, key: b.key, revenue: 0, expenses: 0, profit: 0 };
      }
      const income = extractGroupValue(report, 'Income') ?? 0;
      const expenses = extractGroupValue(report, 'Expenses') ?? 0;
      const netIncome = extractGroupValue(report, 'NetIncome');
      return {
        label: b.label,
        key: b.key,
        revenue: income,
        expenses,
        profit: netIncome ?? income - expenses,
      };
    });

    const total = months.reduce((s, m) => s + m.profit, 0);

    return { months, total, isLoading: loading, error: error as Error | null };
  }, [reports, buckets, loading, error]);
}
