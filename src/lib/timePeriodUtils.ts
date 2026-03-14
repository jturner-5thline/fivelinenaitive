import { startOfWeek, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths, endOfDay } from 'date-fns';
import type { TimePeriod } from '@/contexts/MetricsWidgetsContext';

/**
 * Returns a { start, end } date range for the given time period.
 * Returns null for 'all-time' (no filtering).
 */
export function getTimePeriodRange(period?: TimePeriod): { start: Date; end: Date } | null {
  if (!period || period === 'all-time') return null;

  const now = new Date();
  const end = endOfDay(now);

  switch (period) {
    case 'this-week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end };
    case 'this-month':
      return { start: startOfMonth(now), end };
    case 'this-quarter':
      return { start: startOfQuarter(now), end };
    case 'ytd':
      return { start: startOfYear(now), end };
    case 'ttm':
      return { start: subMonths(now, 12), end };
    case 'last-30d':
      return { start: subDays(now, 30), end };
    case 'last-90d':
      return { start: subDays(now, 90), end };
    case 'last-12m':
      return { start: subMonths(now, 12), end };
    default:
      return null;
  }
}

/**
 * Returns true if dateStr falls within the given range.
 */
export function isInRange(dateStr: string | null | undefined, range: { start: Date; end: Date } | null): boolean {
  if (!range) return true; // all-time
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= range.start && d <= range.end;
}

/**
 * Returns the human-readable label for a time period, or null for all-time
 */
export function getTimePeriodLabel(period?: TimePeriod): string | null {
  if (!period || period === 'all-time') return null;
  const labels: Record<string, string> = {
    'this-week': 'This Week',
    'this-month': 'This Month',
    'this-quarter': 'This Quarter',
    'ytd': 'YTD',
    'ttm': 'TTM',
    'last-30d': 'Last 30 Days',
    'last-90d': 'Last 90 Days',
    'last-12m': 'Last 12 Months',
  };
  return labels[period] || null;
}
