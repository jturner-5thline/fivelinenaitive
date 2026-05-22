import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from './useCompany';
import { type QuarterOption } from './useQBQuarterlyRevenue';

const FINSERV_REALM_ID = '9341451968897660';
const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';
const ACTIVE_CLIENT_STAGE = 'fs-active-client';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthRange(count: number) {
  const now = new Date();
  const buckets: { key: string; label: string; start: string; end: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const k = monthKey(d);
    buckets.push({
      key: k,
      label: monthLabel(d),
      start: `${k}-01`,
      end: `${k}-${endD.getDate()}`,
    });
  }
  return buckets;
}

function quarterKey(d: Date) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function buildQuarterRange(count: number) {
  const now = new Date();
  const quarters: { key: string; start: string; end: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3);
    const qYear = d.getFullYear();
    const qStart = new Date(qYear, q * 3, 1);
    const qEnd = new Date(qYear, q * 3 + 3, 0);
    const k = quarterKey(qStart);
    if (!quarters.find(qq => qq.key === k)) {
      quarters.push({
        key: k,
        start: `${qYear}-${String(q * 3 + 1).padStart(2, '0')}-01`,
        end: `${qYear}-${String(q * 3 + 3).padStart(2, '0')}-${qEnd.getDate()}`,
      });
    }
  }
  return quarters;
}

// ────────────────────────────────────────────────────────────
// 1. Total Revenue (monthly bars for selected quarter)
// ────────────────────────────────────────────────────────────

export interface MonthBar { month: string; monthKey: string; amount: number }

export function useFinServTotalRevenue(quarter: QuarterOption | null) {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['finserv-total-revenue', user?.id, quarter?.value],
    queryFn: async () => {
      if (!quarter) return null;
      const { data: rows, error: err } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', quarter.startDate)
        .lte('txn_date', quarter.endDate);
      if (err) throw err;

      const buckets = new Map<string, number>();
      for (const m of quarter.months) buckets.set(m.key, 0);
      for (const r of rows ?? []) {
        if (!r.txn_date) continue;
        const k = r.txn_date.slice(0, 7);
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + (Number(r.total_amt) || 0));
      }

      const months: MonthBar[] = quarter.months.map(m => ({
        month: m.label,
        monthKey: m.key,
        amount: buckets.get(m.key) ?? 0,
      }));
      return { months, total: months.reduce((s, m) => s + m.amount, 0) };
    },
    enabled: !!user && !!quarter,
    staleTime: 30_000,
  });

  return { months: data?.months ?? [], total: data?.total ?? 0, isLoading, error };
}

// ────────────────────────────────────────────────────────────
// 2 & 3. Gross Profit $ and Gross Profit Margin % (quarterly)
// 4 & 5. Operating Profit $ and Operating Margin % (quarterly)
// ────────────────────────────────────────────────────────────

export interface QuarterProfitBar {
  quarter: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  opex: number;
  operatingProfit: number;
  operatingMargin: number;
}

export function useFinServQuarterlyProfits(quartersBack = 4) {
  const { user } = useAuth();
  const quarters = useMemo(() => buildQuarterRange(quartersBack * 3), [quartersBack]);
  const startDate = quarters[0]?.start;
  const endDate = quarters[quarters.length - 1]?.end;

  const { data: invoices, isLoading: l1 } = useQuery({
    queryKey: ['finserv-q-invoices', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate!)
        .lte('txn_date', endDate!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!startDate,
    staleTime: 30_000,
  });

  const { data: expenses, isLoading: l2 } = useQuery({
    queryKey: ['finserv-q-expenses', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_expenses')
        .select('txn_date, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate!)
        .lte('txn_date', endDate!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!startDate,
    staleTime: 30_000,
  });

  const { data: bills, isLoading: l3 } = useQuery({
    queryKey: ['finserv-q-bills', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_bills')
        .select('txn_date, total_amt, line_items')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate!)
        .lte('txn_date', endDate!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!startDate,
    staleTime: 30_000,
  });

  // COGS account IDs for this realm — needed to compute true Gross Profit.
  // QuickBooks P&L for the FinServ realm does not return a GrossProfit/COGS
  // section (no inventory accounts), so we derive COGS from line items whose
  // account is classified as "Cost of Goods Sold".
  const { data: cogsAccountIds, isLoading: l4 } = useQuery({
    queryKey: ['finserv-cogs-accounts', FINSERV_REALM_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('qb_id')
        .eq('realm_id', FINSERV_REALM_ID)
        .eq('account_type', 'Cost of Goods Sold');
      if (error) throw error;
      return new Set((data ?? []).map(r => r.qb_id));
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Also pull line_items for expenses so we can split COGS vs opex.
  const { data: expenseLines, isLoading: l5 } = useQuery({
    queryKey: ['finserv-q-expense-lines', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_expenses')
        .select('txn_date, line_items')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate!)
        .lte('txn_date', endDate!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!startDate,
    staleTime: 30_000,
  });

  const isLoading = l1 || l2 || l3 || l4 || l5;

  return useMemo(() => {
    const qMap = new Map<string, { rev: number; exp: number; cogs: number }>();
    for (const q of quarters) qMap.set(q.key, { rev: 0, exp: 0, cogs: 0 });

    const assignToQuarter = (date: string) => {
      const d = new Date(date + 'T00:00:00');
      return quarterKey(d);
    };

    for (const r of invoices ?? []) {
      if (!r.txn_date) continue;
      const k = assignToQuarter(r.txn_date);
      const b = qMap.get(k);
      if (b) b.rev += Number(r.total_amt) || 0;
    }

    for (const r of [...(expenses ?? []), ...(bills ?? [])] as Array<{ txn_date: string | null; total_amt: number | null }>) {
      if (!r.txn_date) continue;
      const k = assignToQuarter(r.txn_date);
      const b = qMap.get(k);
      if (b) b.exp += Number(r.total_amt) || 0;
    }

    // Sum COGS from line items whose account is in the COGS set.
    const cogsSet = cogsAccountIds ?? new Set<string>();
    const sumCogs = (rows: Array<{ txn_date: string | null; line_items: unknown }> | undefined) => {
      for (const r of rows ?? []) {
        if (!r.txn_date || !Array.isArray(r.line_items)) continue;
        const k = assignToQuarter(r.txn_date);
        const bucket = qMap.get(k);
        if (!bucket) continue;
        for (const li of r.line_items as Array<Record<string, any>>) {
          const acct = li?.AccountBasedExpenseLineDetail?.AccountRef?.value
            ?? li?.ItemBasedExpenseLineDetail?.AccountRef?.value;
          if (acct && cogsSet.has(String(acct))) {
            bucket.cogs += Number(li.Amount) || 0;
          }
        }
      }
    };
    sumCogs(expenseLines as any);
    sumCogs(bills as any);

    const result: QuarterProfitBar[] = quarters.map(q => {
      const b = qMap.get(q.key)!;
      const gp = b.rev - b.cogs;
      const op = b.rev - b.exp;
      return {
        quarter: q.key,
        revenue: b.rev,
        cogs: b.cogs,
        grossProfit: gp,
        grossMargin: b.rev > 0 ? (gp / b.rev) * 100 : 0,
        opex: b.exp,
        operatingProfit: op,
        operatingMargin: b.rev > 0 ? (op / b.rev) * 100 : 0,
      };
    });

    return { quarters: result, isLoading };
  }, [invoices, expenses, bills, cogsAccountIds, expenseLines, quarters, isLoading]);
}

// ────────────────────────────────────────────────────────────
// 6. Revenue Change by Client (selected month vs prior month)
// ────────────────────────────────────────────────────────────

export interface ClientRevenueVariance {
  client: string;
  current: number;
  prior: number;
  variance: number;
}

export function useFinServRevenueByClient(quarter: QuarterOption | null, monthIndex = 0) {
  const { user } = useAuth();

  // Determine current month and prior month from the quarter
  const selectedMonth = quarter?.months[monthIndex];
  const priorMonthDate = selectedMonth
    ? new Date(Number(selectedMonth.key.split('-')[0]), Number(selectedMonth.key.split('-')[1]) - 2, 1)
    : null;
  const priorKey = priorMonthDate ? monthKey(priorMonthDate) : null;
  const priorEnd = priorMonthDate
    ? `${priorKey}-${new Date(priorMonthDate.getFullYear(), priorMonthDate.getMonth() + 1, 0).getDate()}`
    : null;
  const priorStart = priorKey ? `${priorKey}-01` : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['finserv-rev-by-client', user?.id, selectedMonth?.key, priorKey],
    queryFn: async () => {
      if (!selectedMonth || !priorStart || !priorEnd) return null;

      const { data: rows, error: err } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, customer_name, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', priorStart)
        .lte('txn_date', selectedMonth.end);
      if (err) throw err;

      const currentMap: Record<string, number> = {};
      const priorMap: Record<string, number> = {};

      for (const r of rows ?? []) {
        if (!r.txn_date || !r.customer_name) continue;
        const k = r.txn_date.slice(0, 7);
        const amt = Number(r.total_amt) || 0;
        if (k === selectedMonth.key) {
          currentMap[r.customer_name] = (currentMap[r.customer_name] ?? 0) + amt;
        } else if (k === priorKey) {
          priorMap[r.customer_name] = (priorMap[r.customer_name] ?? 0) + amt;
        }
      }

      const allClients = new Set([...Object.keys(currentMap), ...Object.keys(priorMap)]);
      const result: ClientRevenueVariance[] = Array.from(allClients).map(c => {
        const current = currentMap[c] ?? 0;
        const prior = priorMap[c] ?? 0;
        return { client: c, current, prior, variance: current - prior };
      }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

      return result;
    },
    enabled: !!user && !!selectedMonth,
    staleTime: 30_000,
  });

  return {
    clients: data ?? [],
    selectedMonthLabel: selectedMonth?.label ?? '',
    priorMonthLabel: priorMonthDate ? monthLabel(priorMonthDate) : '',
    isLoading,
    error,
  };
}

// ────────────────────────────────────────────────────────────
// 7. FinServ Cashflow (12-month line)
// ────────────────────────────────────────────────────────────

export interface CashflowPoint { month: string; monthKey: string; value: number }

export function useFinServCashflow() {
  const { user } = useAuth();
  const buckets = useMemo(() => buildMonthRange(12), []);
  const startDate = buckets[0].start;
  const endDate = buckets[buckets.length - 1].end;

  const { data: invoices, isLoading: l1 } = useQuery({
    queryKey: ['finserv-cf-invoices', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: expenses, isLoading: l2 } = useQuery({
    queryKey: ['finserv-cf-expenses', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_expenses')
        .select('txn_date, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: bills, isLoading: l3 } = useQuery({
    queryKey: ['finserv-cf-bills', FINSERV_REALM_ID, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_bills')
        .select('txn_date, total_amt')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const isLoading = l1 || l2 || l3;

  return useMemo(() => {
    const points: CashflowPoint[] = buckets.map(b => ({ month: b.label, monthKey: b.key, value: 0 }));
    const map = new Map(points.map(p => [p.monthKey, p]));

    for (const r of invoices ?? []) {
      if (!r.txn_date) continue;
      const p = map.get(r.txn_date.slice(0, 7));
      if (p) p.value += Number(r.total_amt) || 0;
    }

    for (const r of [...(expenses ?? []), ...(bills ?? [])]) {
      if (!r.txn_date) continue;
      const p = map.get(r.txn_date.slice(0, 7));
      if (p) p.value -= Number(r.total_amt) || 0;
    }

    return { points, isLoading };
  }, [invoices, expenses, bills, buckets, isLoading]);
}

// ────────────────────────────────────────────────────────────
// 8. Income by Product/Service (stacked bars, selected quarter)
// ────────────────────────────────────────────────────────────

export { useQBStackedFinServRevenue, FINSERV_STACKED_CATEGORIES } from './useQBStackedFinServRevenue';

// ────────────────────────────────────────────────────────────
// 9 & 10. Active Clients (count from deal pipeline)
// ────────────────────────────────────────────────────────────

export interface ActiveClientMonth {
  month: string;
  monthKey: string;
  count: number;
  variance: number;
}

export function useFinServActiveClients() {
  const { user } = useAuth();
  const { company } = useCompany();

  const { data, isLoading, error } = useQuery({
    queryKey: ['finserv-active-clients', user?.id, company?.id],
    queryFn: async () => {
      if (!company?.id) return null;

      // Get all deals ever in the FinServ pipeline with stage = active client
      // For simplicity, count current active clients and use created_at for trend
      const { data: deals, error: err } = await supabase
        .from('deals')
        .select('id, stage, created_at, updated_at')
        .eq('company_id', company.id)
        .eq('pipeline_id', FINSERV_PIPELINE_ID);
      if (err) throw err;

      // Current active count
      const activeDeals = (deals ?? []).filter(d => d.stage === ACTIVE_CLIENT_STAGE);
      const currentCount = activeDeals.length;

      // Build 6-month trend (approximate: count deals that were active by end of each month)
      const months = buildMonthRange(6);
      const monthBars: ActiveClientMonth[] = months.map((m, i) => {
        // Count deals that have stage = active-client and were created before end of month
        const endOfMonth = new Date(m.end + 'T23:59:59Z');
        const count = (deals ?? []).filter(d => {
          if (d.stage !== ACTIVE_CLIENT_STAGE) return false;
          const created = new Date(d.created_at);
          return created <= endOfMonth;
        }).length;
        return {
          month: m.label,
          monthKey: m.key,
          count,
          variance: 0,
        };
      });

      // Calculate MoM variance
      for (let i = 1; i < monthBars.length; i++) {
        monthBars[i].variance = monthBars[i].count - monthBars[i - 1].count;
      }

      const priorCount = monthBars.length >= 2 ? monthBars[monthBars.length - 2].count : 0;

      return {
        currentCount,
        priorCount,
        variance: currentCount - priorCount,
        trend: monthBars,
      };
    },
    enabled: !!user && !!company?.id,
    staleTime: 30_000,
  });

  return {
    currentCount: data?.currentCount ?? 0,
    priorCount: data?.priorCount ?? 0,
    variance: data?.variance ?? 0,
    trend: data?.trend ?? [],
    isLoading,
    error,
  };
}
