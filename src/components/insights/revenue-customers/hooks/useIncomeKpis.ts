import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRevenueFilters } from '../filterContext';

/**
 * Aggregates QuickBooks invoice income across the currently-selected entities
 * and date range, plus the comparison range. All values come from QuickBooks;
 * nothing is hardcoded.
 */
export function useIncomeKpis() {
  const { user } = useAuth();
  const { filters, comparisonRange } = useRevenueFilters();

  const realmIds = filters.entities;
  const enabled = !!user && realmIds.length > 0;

  const current = useQuery({
    queryKey: ['rc-income', 'current', realmIds, filters.range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('realm_id, txn_date, total_amt, customer_ref_name')
        .in('realm_id', realmIds)
        .gte('txn_date', filters.range.start.slice(0, 10))
        .lte('txn_date', filters.range.end.slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  const prior = useQuery({
    queryKey: ['rc-income', 'prior', realmIds, comparisonRange],
    queryFn: async () => {
      if (!comparisonRange) return [];
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('realm_id, txn_date, total_amt, customer_ref_name')
        .in('realm_id', realmIds)
        .gte('txn_date', comparisonRange.start.slice(0, 10))
        .lte('txn_date', comparisonRange.end.slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!comparisonRange,
    staleTime: 5 * 60_000,
  });

  const currTotal = (current.data ?? []).reduce((s, r: any) => s + (Number(r.total_amt) || 0), 0);
  const priorTotal = (prior.data ?? []).reduce((s, r: any) => s + (Number(r.total_amt) || 0), 0);
  const delta = priorTotal > 0 ? (currTotal - priorTotal) / priorTotal : null;

  const customers = new Set((current.data ?? []).map((r: any) => r.customer_ref_name).filter(Boolean));
  const priorCustomers = new Set((prior.data ?? []).map((r: any) => r.customer_ref_name).filter(Boolean));

  // sparkline: month buckets
  const buckets = new Map<string, number>();
  for (const r of current.data ?? []) {
    const d = (r as any).txn_date as string | null;
    if (!d) continue;
    const key = d.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + (Number((r as any).total_amt) || 0));
  }
  const sparkline = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ v }));

  return {
    isLoading: current.isLoading || prior.isLoading,
    currTotal,
    priorTotal,
    delta,
    customerCount: customers.size,
    priorCustomerCount: priorCustomers.size,
    customerDelta: priorCustomers.size > 0 ? (customers.size - priorCustomers.size) / priorCustomers.size : null,
    newCustomers: [...customers].filter(c => !priorCustomers.has(c)).length,
    churnedCustomers: [...priorCustomers].filter(c => !customers.has(c)).length,
    arpu: customers.size > 0 ? currTotal / customers.size : 0,
    priorArpu: priorCustomers.size > 0 ? priorTotal / priorCustomers.size : 0,
    sparkline,
    rows: current.data ?? [],
  };
}