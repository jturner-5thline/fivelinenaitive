import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface QuarterOption {
  label: string;
  value: string; // e.g. "2026-Q2"
  startDate: string; // YYYY-MM-DD
  endDate: string;
  months: { key: string; label: string; start: string; end: string }[];
}

/** Build a list of recent quarters for selection */
export function buildQuarterOptions(count = 8): QuarterOption[] {
  const now = new Date();
  const options: QuarterOption[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3);
    const qYear = d.getFullYear();
    const qStartMonth = q * 3;

    const months: QuarterOption['months'] = [];
    for (let m = 0; m < 3; m++) {
      const mDate = new Date(qYear, qStartMonth + m, 1);
      const mEnd = new Date(qYear, qStartMonth + m + 1, 0);
      months.push({
        key: `${qYear}-${String(qStartMonth + m + 1).padStart(2, '0')}`,
        label: mDate.toLocaleDateString('en-US', { month: 'short' }),
        start: `${qYear}-${String(qStartMonth + m + 1).padStart(2, '0')}-01`,
        end: `${qYear}-${String(qStartMonth + m + 1).padStart(2, '0')}-${mEnd.getDate()}`,
      });
    }

    const startDate = months[0].start;
    const endDate = months[2].end;

    options.push({
      label: `Q${q + 1} ${qYear}`,
      value: `${qYear}-Q${q + 1}`,
      startDate,
      endDate,
      months,
    });
  }

  return options;
}

/** Get the current quarter option */
export function getCurrentQuarter(): QuarterOption {
  return buildQuarterOptions(1)[0];
}

/**
 * Build a QuarterOption-shaped period from an arbitrary date range.
 * Months array spans every calendar month touched by [start, end] so that
 * downstream charts (which group by stage-entry month via `quarter.months`)
 * keep working unchanged.
 */
export function buildCustomPeriod(startDate: Date, endDate: Date): QuarterOption {
  // Normalize to first/last of month bounds for clean monthly buckets
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

  const months: QuarterOption['months'] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const mEnd = new Date(y, m + 1, 0);
    months.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${mEnd.getDate()}`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    label: `${fmt(startDate)} – ${fmt(endDate)}`,
    value: `custom-${months[0]?.start ?? ''}_${months[months.length - 1]?.end ?? ''}`,
    startDate: months[0]?.start ?? '',
    endDate: months[months.length - 1]?.end ?? '',
    months,
  };
}

export interface MonthlyRevenue {
  month: string; // "Jan", "Feb", etc.
  monthKey: string; // "2026-04"
  amount: number;
}

export interface QuarterlyRevenueResult {
  months: MonthlyRevenue[];
  total: number;
  isLoading: boolean;
}

/**
 * Fetch QuickBooks invoice revenue for a specific entity (realm_id)
 * within a quarter, grouped by month.
 * Uses accrual-basis (invoice txn_date).
 */
export function useQBQuarterlyRevenue(
  realmId: string | null,
  quarter: QuarterOption | null,
): QuarterlyRevenueResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qb-quarterly-revenue', user?.id, realmId, quarter?.value],
    queryFn: async () => {
      if (!quarter) return null;

      let query = supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .gte('txn_date', quarter.startDate)
        .lte('txn_date', quarter.endDate)
        .order('txn_date', { ascending: true });

      if (realmId) {
        query = query.eq('realm_id', realmId);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Aggregate by month
      const monthTotals = new Map<string, number>();
      for (const row of rows ?? []) {
        if (!row.txn_date) continue;
        const key = row.txn_date.slice(0, 7); // YYYY-MM
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + (row.total_amt ?? 0));
      }

      // Build result with all months in quarter (zero-fill)
      const months: MonthlyRevenue[] = quarter.months.map(m => ({
        month: m.label,
        monthKey: m.key,
        amount: monthTotals.get(m.key) ?? 0,
      }));

      const total = months.reduce((s, m) => s + m.amount, 0);
      return { months, total };
    },
    enabled: !!user && !!quarter,
    staleTime: 30_000,
  });

  return {
    months: data?.months ?? [],
    total: data?.total ?? 0,
    isLoading: isLoading || isFetching,
  };
}

/**
 * Fetch combined revenue for multiple entities within a quarter.
 * Used for Total Revenue (Debt + FinServ).
 */
export function useQBCombinedQuarterlyRevenue(
  realmIds: string[],
  quarter: QuarterOption | null,
): QuarterlyRevenueResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qb-combined-quarterly-revenue', user?.id, realmIds.join(','), quarter?.value],
    queryFn: async () => {
      if (!quarter || realmIds.length === 0) return null;

      const { data: rows, error } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .in('realm_id', realmIds)
        .gte('txn_date', quarter.startDate)
        .lte('txn_date', quarter.endDate)
        .order('txn_date', { ascending: true });

      if (error) throw error;

      const monthTotals = new Map<string, number>();
      for (const row of rows ?? []) {
        if (!row.txn_date) continue;
        const key = row.txn_date.slice(0, 7);
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + (row.total_amt ?? 0));
      }

      const months: MonthlyRevenue[] = quarter.months.map(m => ({
        month: m.label,
        monthKey: m.key,
        amount: monthTotals.get(m.key) ?? 0,
      }));

      const total = months.reduce((s, m) => s + m.amount, 0);
      return { months, total };
    },
    enabled: !!user && !!quarter && realmIds.length > 0,
    staleTime: 30_000,
  });

  return {
    months: data?.months ?? [],
    total: data?.total ?? 0,
    isLoading: isLoading || isFetching,
  };
}
