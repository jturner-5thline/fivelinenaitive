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

function buildMonthBuckets(n: number): { label: string; key: string; start: string; end: string }[] {
  const now = new Date();
  const buckets: { label: string; key: string; start: string; end: string }[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2);
    buckets.push({ label, key, start: `${key}-01`, end: `${key}-${endDate.getDate()}` });
  }
  return buckets;
}

export function useMonthlyEntityProfit(entityName: string, monthsBack = 3) {
  const { user } = useAuth();
  const realmId = ENTITY_REALM_MAP[entityName];
  const buckets = useMemo(() => buildMonthBuckets(monthsBack), [monthsBack]);
  const startDate = buckets[0].start;
  const endDate = buckets[buckets.length - 1].end;

  // Fetch revenue (invoices)
  const { data: invoices, isLoading: loadingRev } = useQuery({
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
  const { data: expenses, isLoading: loadingExp } = useQuery({
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
  const { data: bills, isLoading: loadingBills } = useQuery({
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

  const isLoading = loadingRev || loadingExp || loadingBills;

  return useMemo(() => {
    const result: ProfitMonthBucket[] = buckets.map(b => ({
      label: b.label, key: b.key, revenue: 0, expenses: 0, profit: 0,
    }));
    const map = new Map(result.map(r => [r.key, r]));

    for (const row of invoices ?? []) {
      if (!row.txn_date) continue;
      const k = row.txn_date.slice(0, 7);
      const b = map.get(k);
      if (b) b.revenue += Number(row.total_amt) || 0;
    }

    for (const row of [...(expenses ?? []), ...(bills ?? [])]) {
      if (!row.txn_date) continue;
      const k = row.txn_date.slice(0, 7);
      const b = map.get(k);
      if (b) b.expenses += Number(row.total_amt) || 0;
    }

    for (const b of result) {
      b.profit = b.revenue - b.expenses;
    }

    const total = result.reduce((s, b) => s + b.profit, 0);

    return { months: result, total, isLoading };
  }, [invoices, expenses, bills, isLoading, buckets]);
}
