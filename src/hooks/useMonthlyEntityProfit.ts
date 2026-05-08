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

function toMonthBuckets(months: MonthDef[]): { label: string; key: string; start: string; end: string }[] {
  return months.map(m => ({
    label: m.label + ' ' + m.key.slice(2, 4),
    key: m.key,
    start: m.start,
    end: m.end,
  }));
}

// Walk QBO ProfitAndLoss report tree and return the Summary value for a given group.
function extractGroupValue(reportData: any, group: string): number | null {
  const rows: any[] = reportData?.Rows?.Row ?? [];
  const visit = (row: any): number | null => {
    if (row?.group === group) {
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
  for (const r of rows) {
    const v = visit(r);
    if (v !== null) return v;
  }
  return null;
}

export function useMonthlyEntityProfit(entityName: string, quarterMonths: MonthDef[]) {
  const { user } = useAuth();
  const realmId = ENTITY_REALM_MAP[entityName];
  const buckets = useMemo(() => toMonthBuckets(quarterMonths), [quarterMonths]);
  const startDate = buckets[0]?.start ?? '';
  const endDate = buckets[buckets.length - 1]?.end ?? '';

  // Preferred source of truth: cached QBO ProfitAndLoss reports per month.
  const { data: reports, isLoading: loadingReports, isFetching: fetchingReports } = useQuery({
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

  // Fetch revenue (invoices)
  const { data: invoices, isLoading: loadingRev, isFetching: fetchingRev } = useQuery({
    queryKey: ['entity-profit-revenue', realmId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .eq('realm_id', realmId)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId,
  });

  // Fetch expenses
  const { data: expenses, isLoading: loadingExp, isFetching: fetchingExp } = useQuery({
    queryKey: ['entity-profit-expenses', realmId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_expenses')
        .select('txn_date, total_amt')
        .eq('realm_id', realmId)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId,
  });

  // Fetch bills
  const { data: bills, isLoading: loadingBills, isFetching: fetchingBills } = useQuery({
    queryKey: ['entity-profit-bills', realmId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_bills')
        .select('txn_date, total_amt')
        .eq('realm_id', realmId)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId,
  });

  // isLoading is true on initial load only; isFetching covers refetches
  // triggered by quarter changes so the UI shows a skeleton on every switch.
  const isLoading =
    loadingRev || loadingExp || loadingBills ||
    fetchingRev || fetchingExp || fetchingBills ||
    loadingReports || fetchingReports;

  return useMemo(() => {
    const result: ProfitMonthBucket[] = buckets.map(b => ({
      label: b.label, key: b.key, revenue: 0, expenses: 0, profit: 0,
    }));
    const map = new Map(result.map(r => [r.key, r]));

    // Build a per-bucket index of available P&L reports that exactly match
    // the bucket boundaries (avoids mixing quarter/YTD reports into a month).
    const reportByKey = new Map<string, any>();
    for (const r of reports ?? []) {
      const bucket = buckets.find(
        b => b.start === r.period_start && b.end === r.period_end,
      );
      if (bucket) reportByKey.set(bucket.key, r.report_data);
    }

    // Fallback: per-transaction sums (used only when no matching P&L report).
    const txnRevenue = new Map<string, number>();
    const txnExpenses = new Map<string, number>();
    for (const row of invoices ?? []) {
      if (!row.txn_date) continue;
      const k = row.txn_date.slice(0, 7);
      txnRevenue.set(k, (txnRevenue.get(k) ?? 0) + (Number(row.total_amt) || 0));
    }
    for (const row of [...(expenses ?? []), ...(bills ?? [])]) {
      if (!row.txn_date) continue;
      const k = row.txn_date.slice(0, 7);
      txnExpenses.set(k, (txnExpenses.get(k) ?? 0) + (Number(row.total_amt) || 0));
    }

    for (const b of result) {
      const report = reportByKey.get(b.key);
      if (report) {
        const income = extractGroupValue(report, 'Income') ?? 0;
        const expensesTotal = extractGroupValue(report, 'Expenses') ?? 0;
        const netIncome = extractGroupValue(report, 'NetIncome');
        b.revenue = income;
        b.expenses = expensesTotal;
        b.profit = netIncome ?? income - expensesTotal;
      } else {
        b.revenue = txnRevenue.get(b.key) ?? 0;
        b.expenses = txnExpenses.get(b.key) ?? 0;
        b.profit = b.revenue - b.expenses;
      }
    }

    const total = result.reduce((s, b) => s + b.profit, 0);

    return { months: result, total, isLoading };
  }, [invoices, expenses, bills, reports, isLoading, buckets]);
}
