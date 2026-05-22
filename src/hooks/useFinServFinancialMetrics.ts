import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from './useCompany';
import { type QuarterOption } from './useQBQuarterlyRevenue';
import { endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter, subQuarters } from 'date-fns';

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

type SnapshotPeriod = {
  start_date: string;
  end_date: string;
};

type SnapshotPeriodWithMeta = SnapshotPeriod & {
  key: string;
  label: string;
};

type FinServSnapshotRow = {
  period_start: string;
  period_end: string;
  income_total: number;
  cogs_total: number;
  gross_profit: number;
};

function periodKey(period: SnapshotPeriod) {
  return `${period.start_date}_${period.end_date}`;
}

function dedupePeriods<T extends SnapshotPeriod>(periods: T[]) {
  const map = new Map<string, T>();
  periods.forEach((period) => map.set(periodKey(period), period));
  return Array.from(map.values());
}

function toYmd(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function buildMonthlySnapshotPeriods(start: string, end: string): SnapshotPeriodWithMeta[] {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const periods: SnapshotPeriodWithMeta[] = [];

  while (cursor <= endDate) {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const boundedStart = cursor.getMonth() === startDate.getMonth() && cursor.getFullYear() === startDate.getFullYear()
      ? startDate
      : monthStart;
    const boundedEnd = cursor.getMonth() === endDate.getMonth() && cursor.getFullYear() === endDate.getFullYear()
      ? endDate
      : monthEnd;
    periods.push({
      start_date: toYmd(boundedStart),
      end_date: toYmd(boundedEnd),
      key: format(monthStart, 'yyyy-MM'),
      label: format(monthStart, 'MMM'),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return periods;
}

function buildQuarterlySnapshotPeriods(end: string, count: number): SnapshotPeriodWithMeta[] {
  const endDate = new Date(`${end}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const quarterDate = subQuarters(endDate, count - index - 1);
    const quarterStart = startOfQuarter(quarterDate);
    const quarterEnd = endOfQuarter(quarterDate);
    const isCurrentQuarter =
      quarterStart.getFullYear() === startOfQuarter(endDate).getFullYear() &&
      quarterStart.getMonth() === startOfQuarter(endDate).getMonth();
    const boundedEnd = isCurrentQuarter && endDate < quarterEnd ? endDate : quarterEnd;

    return {
      start_date: toYmd(quarterStart),
      end_date: toYmd(boundedEnd),
      key: `${quarterStart.getFullYear()}-Q${Math.floor(quarterStart.getMonth() / 3) + 1}`,
      label: `Q${Math.floor(quarterStart.getMonth() / 3) + 1} ${quarterStart.getFullYear()}`,
    };
  });
}

async function fetchFinServPnlSnapshots(companyId: string, periods: SnapshotPeriod[]) {
  if (periods.length === 0) return [];

  const startDates = periods.map((period) => period.start_date).sort();
  const endDates = periods.map((period) => period.end_date).sort();
  const requestedKeys = new Set(periods.map((period) => `${period.start_date}_${period.end_date}`));

  const { data, error } = await supabase
    .from('qbo_pnl_snapshots')
    .select('period_start, period_end, income_total, cogs_total, gross_profit')
    .eq('company_id', companyId)
    .eq('realm_id', FINSERV_REALM_ID)
    .eq('accounting_method', 'Accrual')
    .gte('period_start', startDates[0])
    .lte('period_start', startDates[startDates.length - 1])
    .gte('period_end', endDates[0])
    .lte('period_end', endDates[endDates.length - 1])
    .order('period_start', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as FinServSnapshotRow[]).filter((row) => requestedKeys.has(`${row.period_start}_${row.period_end}`));
}

async function syncFinServPnlSnapshots(periods: SnapshotPeriod[]) {
  if (periods.length === 0) return;

  const { error } = await supabase.functions.invoke('quickbooks-sync', {
    body: {
      syncType: 'profit_and_loss',
      realmId: FINSERV_REALM_ID,
      periods,
    },
  });

  if (error) throw error;
}

async function ensureFinServPnlSnapshots(companyId: string, periods: SnapshotPeriod[]) {
  const requested = dedupePeriods(periods);
  let rows = await fetchFinServPnlSnapshots(companyId, requested);
  const found = new Set(rows.map((row) => `${row.period_start}_${row.period_end}`));
  const missing = requested.filter((period) => !found.has(periodKey(period)));

  if (missing.length > 0) {
    await syncFinServPnlSnapshots(missing);
    rows = await fetchFinServPnlSnapshots(companyId, requested);
  }

  return rows;
}

// ────────────────────────────────────────────────────────────
// 1. Total Revenue (monthly bars for selected quarter)
// ────────────────────────────────────────────────────────────

export interface MonthBar { month: string; monthKey: string; amount: number }

export function useFinServTotalRevenue(period: SnapshotPeriod & { label: string } | null) {
  const { user } = useAuth();
  const { company } = useCompany();

  const { data, isLoading, error } = useQuery({
    queryKey: ['finserv-total-revenue', user?.id, company?.id, period?.start_date, period?.end_date],
    queryFn: async () => {
      if (!period || !company?.id) return null;

      const requestedPeriods = dedupePeriods([
        { start_date: period.start_date, end_date: period.end_date },
        ...buildMonthlySnapshotPeriods(period.start_date, period.end_date),
      ]);
      const rows = await ensureFinServPnlSnapshots(company.id, requestedPeriods);
      const rowsByKey = new Map(rows.map((row) => [`${row.period_start}_${row.period_end}`, row]));
      const periodRow = rowsByKey.get(periodKey(period));
      const monthPeriods = buildMonthlySnapshotPeriods(period.start_date, period.end_date);

      const months: MonthBar[] = monthPeriods.map((month) => ({
        month: month.label,
        monthKey: month.key,
        amount: Number(rowsByKey.get(periodKey(month))?.income_total ?? 0),
      }));

      return {
        months,
        total: Number(periodRow?.income_total ?? 0),
        grossProfit: Number(periodRow?.gross_profit ?? 0),
        grossMargin: Number(periodRow?.income_total)
          ? (Number(periodRow?.gross_profit ?? 0) / Number(periodRow?.income_total ?? 0)) * 100
          : null,
      };
    },
    enabled: !!user && !!period && !!company?.id,
    staleTime: 30_000,
  });

  return {
    months: data?.months ?? [],
    total: data?.total ?? 0,
    grossProfit: data?.grossProfit ?? 0,
    grossMargin: data?.grossMargin ?? null,
    isLoading,
    error,
  };
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

export function useFinServQuarterlyProfits(period: SnapshotPeriod | null, quartersBack = 4) {
  const { user } = useAuth();
  const { company } = useCompany();
  const quarterPeriods = useMemo(
    () => (period ? buildQuarterlySnapshotPeriods(period.end_date, quartersBack) : []),
    [period, quartersBack],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['finserv-quarterly-profits', user?.id, company?.id, period?.end_date, quartersBack],
    queryFn: async () => {
      if (!period || !company?.id) return [];
      const rows = await ensureFinServPnlSnapshots(company.id, quarterPeriods);
      const rowsByKey = new Map(rows.map((row) => [`${row.period_start}_${row.period_end}`, row]));

      return quarterPeriods.map((quarter): QuarterProfitBar => {
        const row = rowsByKey.get(periodKey(quarter));
        const revenue = Number(row?.income_total ?? 0);
        const cogs = Number(row?.cogs_total ?? 0);
        const grossProfit = Number(row?.gross_profit ?? 0);
        return {
          quarter: quarter.label,
          revenue,
          cogs,
          grossProfit,
          grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
          opex: 0,
          operatingProfit: 0,
          operatingMargin: 0,
        };
      });
    },
    enabled: !!user && !!company?.id && !!period,
    staleTime: 30_000,
  });

  return {
    quarters: data ?? [],
    isLoading,
    error,
  };
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
