import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

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

// Pull all AccountRef ids referenced by an expense/bill row, falling back to
// the row-level account_ref_id when no line-level detail is present.
function lineAccountRefs(row: any): { accountId: string; amount: number }[] {
  const out: { accountId: string; amount: number }[] = [];
  const lines: any[] = Array.isArray(row?.line_items) ? row.line_items : [];
  for (const l of lines) {
    const det = l?.AccountBasedExpenseLineDetail;
    const accountId = det?.AccountRef?.value;
    const amount = Number(l?.Amount ?? 0);
    if (accountId && Number.isFinite(amount)) {
      out.push({ accountId: String(accountId), amount });
    }
  }
  if (out.length === 0 && row?.account_ref_id) {
    const amount = Number(row?.total_amt ?? 0);
    out.push({ accountId: String(row.account_ref_id), amount: Number.isFinite(amount) ? amount : 0 });
  }
  return out;
}

function isWithinBucket(txnDate: string | null | undefined, start: string, end: string) {
  if (!txnDate) return false;
  return txnDate >= start && txnDate <= end;
}

function sumStandaloneBucketRevenue(rows: Array<{ txn_date: string | null; total_amt: number | null | undefined }>, start: string, end: string) {
  return rows.reduce((sum, row) => {
    if (!isWithinBucket(row.txn_date, start, end)) return sum;
    return sum + (Number(row.total_amt) || 0);
  }, 0);
}

function sumStandaloneBucketExpenses(
  rows: Array<{ txn_date: string | null; total_amt?: number | null; account_ref_id?: string | null; line_items?: any }>,
  start: string,
  end: string,
  classificationById: Map<string, string>,
) {
  return rows.reduce((sum, row) => {
    if (!isWithinBucket(row.txn_date, start, end)) return sum;
    const refs = lineAccountRefs(row);
    let rowExpense = 0;
    for (const { accountId, amount } of refs) {
      if (classificationById.get(accountId) === 'Expense') rowExpense += amount;
    }
    return sum + rowExpense;
  }, 0);
}

export function useMonthlyEntityProfit(entityName: string, quarterMonths: MonthDef[]) {
  const { user } = useAuth();
  const { company } = useCompany();
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

  // Pull the authoritative QBO P&L snapshots (accrual). This is the same
  // source powering the FinServ Financial Metrics dashboard — the
  // `net_operating_income` column is the QuickBooks "Net Operating Income"
  // (a.k.a. Operating Profit) line for the requested period.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['entity-monthly-operating-profit', company?.id, realmId, startDate, endDate, buckets.map(b => b.key).join(',')],
    queryFn: async () => {
      if (!company?.id || !realmId || buckets.length === 0) return null;

      // 1) Ensure snapshots exist for each month bucket. Reuses the same
      //    fetch/sync pipeline as the FinServ dashboard so numbers match.
      const periods = buckets.map((b) => ({ start_date: b.start, end_date: b.end }));
      try {
        const { ensureFinServPnlSnapshots } = await import('@/hooks/useFinServFinancialMetrics');
        await ensureFinServPnlSnapshots(company.id, periods, realmId);
      } catch (err) {
        console.warn('[useMonthlyEntityProfit] ensurePnlSnapshots failed; falling back to whatever is cached', err);
      }

      // 2) Read the snapshots directly for this realm/company.
      const { data: rows, error } = await supabase
        .from('qbo_pnl_snapshots')
        .select('period_start, period_end, income_total, gross_profit, operating_expenses, net_operating_income')
        .eq('company_id', company.id)
        .eq('realm_id', realmId)
        .eq('accounting_method', 'Accrual')
        .gte('period_start', startDate)
        .lte('period_end', endDate);
      if (error) throw error;

      const byKey = new Map<string, typeof rows[number]>();
      for (const r of rows ?? []) byKey.set(`${r.period_start}_${r.period_end}`, r);

      const months: ProfitMonthBucket[] = buckets.map((b) => {
        const row = byKey.get(`${b.start}_${b.end}`);
        const revenue = Number(row?.income_total ?? 0);
        const grossProfit = Number(row?.gross_profit ?? 0);
        const operatingExpenses = Number(row?.operating_expenses ?? 0);
        const profit = row?.net_operating_income != null
          ? Number(row.net_operating_income)
          : grossProfit - operatingExpenses;
        // "expenses" here == total cost to reach operating profit
        // (COGS + OpEx) so the drilldown table's "Revenue − Expenses = OP" identity holds.
        const expenses = revenue - profit;
        return { label: b.label, key: b.key, revenue, expenses, profit };
      });

      const total = months.reduce((s, m) => s + m.profit, 0);
      return { months, total };
    },
    enabled: !!user && !!company?.id && !!realmId && !!startDate && !!endDate,
    staleTime: 30_000,
  });

  return {
    months: data?.months ?? [],
    total: data?.total ?? 0,
    isLoading: isLoading || isFetching,
  };
}
