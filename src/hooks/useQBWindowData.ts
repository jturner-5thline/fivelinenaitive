import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type TimeWindow } from '@/components/widget-editor/widgetTypes';

/** Compute date range from a TimeWindow — same logic as useQBPreviewData */
function getDateRange(window: TimeWindow): { start: string; end: string } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (window) {
    case 'mtd':
      return { start: `${year}-${String(month + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
    case 'lastMonth': {
      const lm = month === 0 ? 11 : month - 1;
      const ly = month === 0 ? year - 1 : year;
      const lastDay = new Date(ly, lm + 1, 0).getDate();
      return { start: `${ly}-${String(lm + 1).padStart(2, '0')}-01`, end: `${ly}-${String(lm + 1).padStart(2, '0')}-${lastDay}` };
    }
    case 'qtd': {
      const qStart = Math.floor(month / 3) * 3;
      return { start: `${year}-${String(qStart + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
    }
    case 'lastQuarter': {
      const curQ = Math.floor(month / 3);
      const prevQ = curQ === 0 ? 3 : curQ - 1;
      const pqYear = curQ === 0 ? year - 1 : year;
      const pqStart = prevQ * 3;
      const pqEnd = new Date(pqYear, pqStart + 3, 0);
      return { start: `${pqYear}-${String(pqStart + 1).padStart(2, '0')}-01`, end: pqEnd.toISOString().slice(0, 10) };
    }
    case 'ytd':
      return { start: `${year}-01-01`, end: now.toISOString().slice(0, 10) };
    case 'lastYear':
      return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
    case 'ttm':
    case 'last12Months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 12);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last6Months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 6);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last3Months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 3);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'all':
    case 'custom':
    default:
      return null;
  }
}

export interface QBWindowDataPoint {
  period: string;
  amount: number;
}

/**
 * Query QuickBooks invoices (revenue) for a given time window and optional realmId,
 * aggregated by month. Uses same date range logic as the widget editor's useQBPreviewData.
 */
export function useQBRevenueByWindow(window: TimeWindow, realmId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-revenue-window', user?.id, window, realmId],
    queryFn: async () => {
      const dateRange = getDateRange(window);

      let query = supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .order('txn_date', { ascending: true });

      if (realmId) {
        query = query.eq('realm_id', realmId);
      }
      if (dateRange) {
        query = query.gte('txn_date', dateRange.start).lte('txn_date', dateRange.end);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Aggregate by month
      const periodMap = new Map<string, { label: string; amount: number }>();
      for (const row of rows ?? []) {
        if (!row.txn_date) continue;
        const d = new Date(row.txn_date + 'T00:00:00');
        const key = row.txn_date.slice(0, 7); // YYYY-MM
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const existing = periodMap.get(key);
        if (existing) {
          existing.amount += row.total_amt ?? 0;
        } else {
          periodMap.set(key, { label, amount: row.total_amt ?? 0 });
        }
      }

      const sorted = Array.from(periodMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({ period: v.label, amount: v.amount }));

      const total = sorted.reduce((s, r) => s + r.amount, 0);

      return { periods: sorted, total };
    },
    enabled: !!user,
    staleTime: 10_000,
  });
}

/**
 * Query QuickBooks invoices for an arbitrary [startDate, endDate] inclusive
 * range and optional realmId. Mirrors `useQBRevenueByWindow` so the
 * KPIDetailCard can drive its main + breakdown values from the dashboard's
 * selected quarter (or any custom period) and compute period-over-period
 * deltas against the immediately preceding period of the same length.
 */
export function useQBRevenueByDateRange(
  startDate: string | null,
  endDate: string | null,
  realmId?: string | null,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-revenue-range', user?.id, startDate, endDate, realmId],
    queryFn: async () => {
      let query = supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .order('txn_date', { ascending: true });

      if (realmId) query = query.eq('realm_id', realmId);
      if (startDate) query = query.gte('txn_date', startDate);
      if (endDate) query = query.lte('txn_date', endDate);

      const { data: rows, error } = await query;
      if (error) throw error;

      const periodMap = new Map<string, { label: string; amount: number }>();
      for (const row of rows ?? []) {
        if (!row.txn_date) continue;
        const d = new Date(row.txn_date + 'T00:00:00');
        const key = row.txn_date.slice(0, 7);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const existing = periodMap.get(key);
        if (existing) existing.amount += row.total_amt ?? 0;
        else periodMap.set(key, { label, amount: row.total_amt ?? 0 });
      }

      const sorted = Array.from(periodMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({ period: v.label, amount: v.amount }));

      const total = sorted.reduce((s, r) => s + r.amount, 0);
      return { periods: sorted, total };
    },
    enabled: !!user && !!startDate && !!endDate,
    staleTime: 10_000,
  });
}

/**
 * Given an inclusive date range, return the "previous comparable period".
 *
 * If the range exactly matches a full calendar quarter, returns the
 * preceding calendar quarter (Q2 2026 → Q1 2026, Q1 2026 → Q4 2025).
 * If the range exactly matches a full calendar month, returns the
 * preceding calendar month (Feb 2026 → Jan 2026, with correct day counts).
 * Otherwise falls back to the immediately preceding span of identical
 * length in days.
 */
export function getPriorDateRange(
  startDate: string,
  endDate: string,
): { start: string; end: string } {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const sy = start.getFullYear();
  const sm = start.getMonth();
  const sd = start.getDate();
  const ey = end.getFullYear();
  const em = end.getMonth();
  const ed = end.getDate();
  const lastDayOfEndMonth = new Date(ey, em + 1, 0).getDate();

  // Detect full calendar quarter: starts on month 0/3/6/9 day 1, ends on
  // last day of (startMonth + 2) in the same year.
  const isQuarterStart = sd === 1 && sm % 3 === 0;
  const isQuarterEnd = ey === sy && em === sm + 2 && ed === lastDayOfEndMonth;
  if (isQuarterStart && isQuarterEnd) {
    const priorStartMonth = sm - 3;
    const priorYear = priorStartMonth < 0 ? sy - 1 : sy;
    const priorMonth = (priorStartMonth + 12) % 12;
    const priorStart = new Date(priorYear, priorMonth, 1);
    const priorEnd = new Date(priorYear, priorMonth + 3, 0); // last day of priorMonth+2
    return { start: fmt(priorStart), end: fmt(priorEnd) };
  }

  // Detect full calendar month: starts day 1, ends last day of same month.
  const isMonthStart = sd === 1;
  const isMonthEnd = ey === sy && em === sm && ed === lastDayOfEndMonth;
  if (isMonthStart && isMonthEnd) {
    const priorMonthIdx = sm - 1;
    const priorYear = priorMonthIdx < 0 ? sy - 1 : sy;
    const priorMonth = (priorMonthIdx + 12) % 12;
    const priorStart = new Date(priorYear, priorMonth, 1);
    const priorEnd = new Date(priorYear, priorMonth + 1, 0);
    return { start: fmt(priorStart), end: fmt(priorEnd) };
  }

  // Fallback: previous N days of identical length, ending the day before start.
  const lengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const priorEnd = new Date(start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - (lengthDays - 1));
  return { start: fmt(priorStart), end: fmt(priorEnd) };
}
