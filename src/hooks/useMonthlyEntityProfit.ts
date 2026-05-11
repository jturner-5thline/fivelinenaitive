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

  // Primary source: cached monthly P&L reports.
  const { data: reports, isLoading: lR, isFetching: fR } = useQuery({
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

  // Fallback ingredients (only used for buckets without a P&L report).
  const { data: invoices, isLoading: lI, isFetching: fI } = useQuery({
    queryKey: ['entity-profit-invoices', realmId, startDate, endDate],
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
    enabled: !!user && !!realmId && !!startDate && !!endDate,
  });

  const { data: expenses, isLoading: lE, isFetching: fE } = useQuery({
    queryKey: ['entity-profit-expenses', realmId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_expenses')
        .select('txn_date, total_amt, account_ref_id, line_items')
        .eq('realm_id', realmId)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId && !!startDate && !!endDate,
  });

  const { data: bills, isLoading: lB, isFetching: fB } = useQuery({
    queryKey: ['entity-profit-bills', realmId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_bills')
        .select('txn_date, total_amt, line_items')
        .eq('realm_id', realmId)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId && !!startDate && !!endDate,
  });

  // All accounts for this realm so we can filter expense lines to
  // classification='Expense' (exclude intercompany "Due to ..." liability postings, etc.).
  const { data: accounts, isLoading: lA, isFetching: fA } = useQuery({
    queryKey: ['entity-profit-accounts', realmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('qb_id, classification')
        .eq('realm_id', realmId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!realmId,
  });

  const isLoading = lR || fR || lI || fI || lE || fE || lB || fB || lA || fA;

  return useMemo(() => {
    // Profit must always represent THAT month's standalone result —
    // never a YTD or rolling sum. We therefore compute every bucket
    // directly from its month's transactions and intentionally ignore
    // any cached P&L reports (which can be YTD/quarterly and would
    // otherwise leak prior-month totals into a single bar).
    void reports; // kept queried so cache stays warm; not used for math

    // Build classification map: accountId -> classification.
    const classificationById = new Map<string, string>();
    for (const a of accounts ?? []) {
      if (a.qb_id) classificationById.set(String(a.qb_id), String(a.classification ?? ''));
    }

    // Per-month transaction sums used by the chart.
    const txnRevenue = new Map<string, number>();
    const txnExpenses = new Map<string, number>();
    for (const row of invoices ?? []) {
      if (!row.txn_date) continue;
      const k = String(row.txn_date).slice(0, 7);
      txnRevenue.set(k, (txnRevenue.get(k) ?? 0) + (Number(row.total_amt) || 0));
    }
    for (const row of [...(expenses ?? []), ...(bills ?? [])]) {
      if (!row.txn_date) continue;
      const k = String(row.txn_date).slice(0, 7);
      const refs = lineAccountRefs(row);
      let bucketTotal = 0;
      for (const { accountId, amount } of refs) {
        if (classificationById.get(accountId) === 'Expense') bucketTotal += amount;
      }
      if (bucketTotal !== 0) {
        txnExpenses.set(k, (txnExpenses.get(k) ?? 0) + bucketTotal);
      }
    }

    const monthsFromGroupedKeys: ProfitMonthBucket[] = buckets.map((b) => {
      const revenue = txnRevenue.get(b.key) ?? 0;
      const exp = txnExpenses.get(b.key) ?? 0;
      return { label: b.label, key: b.key, revenue, expenses: exp, profit: revenue - exp };
    });

    // Internal safeguard: independently recompute each displayed month from the
    // raw rows using the bucket's exact month boundaries. If grouped-key math is
    // ever changed in a way that reintroduces running totals, fall back to the
    // direct standalone-month recompute immediately.
    const monthsValidated: ProfitMonthBucket[] = buckets.map((b) => {
      const revenue = sumStandaloneBucketRevenue(invoices ?? [], b.start, b.end);
      const exp = sumStandaloneBucketExpenses(
        [...(expenses ?? []), ...(bills ?? [])],
        b.start,
        b.end,
        classificationById,
      );
      return { label: b.label, key: b.key, revenue, expenses: exp, profit: revenue - exp };
    });

    const hasStandaloneMismatch = monthsFromGroupedKeys.some((month, index) => {
      const validated = monthsValidated[index];
      return (
        month.key !== validated.key ||
        Math.abs(month.revenue - validated.revenue) > 0.005 ||
        Math.abs(month.expenses - validated.expenses) > 0.005 ||
        Math.abs(month.profit - validated.profit) > 0.005
      );
    });

    if (hasStandaloneMismatch) {
      console.warn('[useMonthlyEntityProfit] Standalone month validation failed; using direct bucket totals.', {
        entityName,
        grouped: monthsFromGroupedKeys,
        validated: monthsValidated,
      });
    }

    const months = hasStandaloneMismatch ? monthsValidated : monthsFromGroupedKeys;

    const total = months.reduce((s, m) => s + m.profit, 0);
    return { months, total, isLoading };
  }, [reports, invoices, expenses, bills, accounts, buckets, isLoading]);
}
