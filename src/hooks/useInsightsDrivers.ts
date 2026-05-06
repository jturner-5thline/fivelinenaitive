import { useMemo } from 'react';
import { useQuickBooksExpanded } from '@/hooks/useQuickBooksExpanded';
import { useQuickBooksInvoices, useQuickBooksPayments } from '@/hooks/useQuickBooks';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { differenceInCalendarMonths, parseISO, startOfMonth, subMonths } from 'date-fns';

export interface DriverContribution {
  name: string;
  current: number;
  previous: number;
  delta: number;
  pctOfDelta: number; // share of total period delta
}

export interface MetricDriverBreakdown {
  metricKey: string;
  totalDelta: number;
  contributors: DriverContribution[];
}

/** Top-N driver attribution for the most analytically useful metrics:
 * - qb-expenses: by category (account_ref_name)
 * - qb-revenue: by customer
 * - qb-payments: by customer
 * Returns max 5 drivers per metric ordered by absolute contribution to the MoM delta.
 */
export function useInsightsDrivers(): {
  drivers: Record<string, MetricDriverBreakdown>;
  isLoading: boolean;
} {
  const { data: invoices = [], isLoading: il } = useQuickBooksInvoices();
  const { data: payments = [], isLoading: pl } = useQuickBooksPayments();
  const { expenses, isLoading: el } = useQuickBooksExpanded();
  const tf = useInsightsTimeframeOptional();

  const result = useMemo(() => {
    const now = new Date();
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : now;
    const monthsBack = Math.max(0, Math.min(11, differenceInCalendarMonths(now, anchor)));
    const curMonthStart = startOfMonth(subMonths(now, monthsBack));
    const prevMonthStart = startOfMonth(subMonths(now, monthsBack + 1));
    const nextMonthStart = startOfMonth(subMonths(now, monthsBack - 1));

    const inMonth = (date: string | null, start: Date, end: Date) => {
      if (!date) return false;
      const d = new Date(date);
      return d >= start && d < end;
    };

    const buildBreakdown = <T,>(
      items: T[],
      getDate: (i: T) => string | null,
      getKey: (i: T) => string,
      getAmt: (i: T) => number,
    ): MetricDriverBreakdown => {
      const cur = new Map<string, number>();
      const prev = new Map<string, number>();
      for (const it of items) {
        const d = getDate(it);
        const k = getKey(it) || 'Unknown';
        const v = getAmt(it) || 0;
        if (inMonth(d, curMonthStart, nextMonthStart)) cur.set(k, (cur.get(k) || 0) + v);
        else if (inMonth(d, prevMonthStart, curMonthStart)) prev.set(k, (prev.get(k) || 0) + v);
      }
      const keys = new Set<string>([...cur.keys(), ...prev.keys()]);
      const totalDelta = [...keys].reduce((s, k) => s + ((cur.get(k) || 0) - (prev.get(k) || 0)), 0);
      const denom = Math.abs(totalDelta) || 1;
      const contributors: DriverContribution[] = [...keys]
        .map(k => {
          const c = cur.get(k) || 0;
          const p = prev.get(k) || 0;
          const delta = c - p;
          return { name: k, current: c, previous: p, delta, pctOfDelta: (delta / denom) * 100 };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5);
      return { metricKey: '', totalDelta, contributors };
    };

    const drivers: Record<string, MetricDriverBreakdown> = {
      'qb-expenses': {
        ...buildBreakdown(expenses, e => e.txn_date, e => (e as any).account_ref_name || 'Uncategorized', e => e.total_amt || 0),
        metricKey: 'qb-expenses',
      },
      'qb-revenue': {
        ...buildBreakdown(invoices, i => i.txn_date, i => i.customer_name || 'Unknown', i => i.total_amt || 0),
        metricKey: 'qb-revenue',
      },
      'qb-payments': {
        ...buildBreakdown(payments, p => p.txn_date, p => p.customer_name || 'Unknown', p => p.total_amt || 0),
        metricKey: 'qb-payments',
      },
    };
    return drivers;
  }, [invoices, payments, expenses, tf?.timeframe.end]);

  return { drivers: result, isLoading: il || pl || el };
}
