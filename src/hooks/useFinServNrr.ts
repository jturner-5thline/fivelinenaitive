import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QBO_ENTITY_BY_KEY } from '@/config/qboEntities';

const FINSERV_REALM_ID = QBO_ENTITY_BY_KEY.finserv.realmId;

export interface NrrCustomerRow {
  customer: string;
  priorRevenue: number;
  currentRevenue: number;
  retention: number | null;
}

export interface FinServNrrResult {
  nrr: number | null;
  priorTotal: number;
  currentTotal: number;
  customers: NrrCustomerRow[];
  priorLabel: string;
  isLoading: boolean;
}

/** Immediately-preceding window of the same length (inclusive dates, ymd strings). */
export function priorWindow(start: string, end: string): { start: string; end: string } {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(s.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { start: ymd(prevStart), end: ymd(prevEnd) };
}

async function fetchRevenueByCustomer(start: string, end: string) {
  const { data, error } = await supabase
    .from('quickbooks_invoices')
    .select('customer_name, txn_date, total_amt')
    .eq('realm_id', FINSERV_REALM_ID)
    .gte('txn_date', start)
    .lte('txn_date', end);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const name = (row.customer_name ?? '').trim();
    if (!name) continue;
    const amt = Number(row.total_amt ?? 0);
    if (!Number.isFinite(amt)) continue;
    map.set(name, (map.get(name) ?? 0) + amt);
  }
  return map;
}

/**
 * Net Revenue Retention for the FinServ QBO entity.
 * Cohort = customers billed in the prior period. NRR = their revenue this
 * period ÷ their revenue last period. Customers first billed this period
 * are excluded entirely.
 */
export function useFinServNrr(start: string | undefined, end: string | undefined): FinServNrrResult {
  const prior = start && end ? priorWindow(start, end) : null;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['finserv-nrr', start, end],
    enabled: !!start && !!end,
    staleTime: 60_000,
    queryFn: async () => {
      const [currentMap, priorMap] = await Promise.all([
        fetchRevenueByCustomer(start!, end!),
        fetchRevenueByCustomer(prior!.start, prior!.end),
      ]);

      const customers: NrrCustomerRow[] = [];
      let priorTotal = 0;
      let currentTotal = 0;
      for (const [name, priorRevenue] of priorMap) {
        if (priorRevenue <= 0) continue;
        const currentRevenue = currentMap.get(name) ?? 0;
        priorTotal += priorRevenue;
        currentTotal += currentRevenue;
        customers.push({
          customer: name,
          priorRevenue,
          currentRevenue,
          retention: priorRevenue > 0 ? (currentRevenue / priorRevenue) * 100 : null,
        });
      }
      customers.sort((a, b) => b.priorRevenue - a.priorRevenue);

      return {
        customers,
        priorTotal,
        currentTotal,
        nrr: priorTotal > 0 ? (currentTotal / priorTotal) * 100 : null,
      };
    },
  });

  return {
    nrr: data?.nrr ?? null,
    priorTotal: data?.priorTotal ?? 0,
    currentTotal: data?.currentTotal ?? 0,
    customers: data?.customers ?? [],
    priorLabel: prior ? `${prior.start} → ${prior.end}` : '',
    isLoading: isLoading || isFetching,
  };
}
