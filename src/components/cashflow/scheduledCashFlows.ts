// Helpers and types for scheduled cash flow entries
import type { WeeklyData } from './types';

export type FrequencyType = 'one_time' | 'weekly' | 'monthly_first' | 'monthly_last' | 'monthly_day';
export type FlowType = 'cash_in' | 'cash_out';

export interface FrequencyConfig {
  one_time_date?: string;       // YYYY-MM-DD
  day_of_week?: number;         // 0=Sun..6=Sat
  ordinal_day_of_week?: number; // for monthly_first / monthly_last (0..6)
  day_of_month?: number;        // 1..31 for monthly_day
}

export interface ScheduledCashFlow {
  id: string;
  company_id: string;
  account: string;
  category: string;
  amount: number;
  frequency_type: FrequencyType;
  frequency_config: FrequencyConfig;
  flow_type: FlowType;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export const ACCOUNT_OPTIONS = [
  'Operating Acc. 8630',
  '5LCA 2681',
  '5LFS 0661',
  '5LT 3965',
  'Tax Acc. 1390',
  'M&T Acc.',
] as const;

export const CASH_IN_CATEGORIES = [
  'Revenue Deposits',
  'Customer Payments',
  'Consulting Fees',
  'Loan Proceeds',
  'Other Receipts',
] as const;

export const CASH_OUT_CATEGORIES = [
  'Advertising & Marketing',
  'Insurance',
  'Payroll - Salaries',
  'Payroll - Taxes & Benefits',
  'Contractors & Consultants',
  'Rent & Occupancy',
  'Software & Technology',
  'Legal & Professional',
  'Travel & Entertainment',
  'Office & Admin',
  'Loan Payments',
  'Other Disbursements',
] as const;

export const DAY_OF_WEEK_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lastDayOfMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

/**
 * Generate occurrence dates for a scheduled entry within [rangeStart, rangeEnd].
 */
export function generateOccurrences(
  entry: ScheduledCashFlow,
  rangeStart: Date,
  rangeEnd: Date,
): string[] {
  const dates: string[] = [];
  const start = entry.start_date ? parseDate(entry.start_date) : rangeStart;
  const end = entry.end_date ? parseDate(entry.end_date) : rangeEnd;
  const effectiveStart = start > rangeStart ? start : rangeStart;
  const effectiveEnd = end < rangeEnd ? end : rangeEnd;
  if (effectiveStart > effectiveEnd) return dates;

  const cfg = entry.frequency_config || {};

  if (entry.frequency_type === 'one_time') {
    if (cfg.one_time_date) {
      const d = parseDate(cfg.one_time_date);
      if (d >= rangeStart && d <= rangeEnd) dates.push(cfg.one_time_date);
    }
    return dates;
  }

  if (entry.frequency_type === 'weekly') {
    const dow = cfg.day_of_week ?? 1;
    const cur = new Date(effectiveStart);
    // advance to first matching dow
    while (cur.getDay() !== dow && cur <= effectiveEnd) {
      cur.setDate(cur.getDate() + 1);
    }
    while (cur <= effectiveEnd) {
      dates.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 7);
    }
    return dates;
  }

  if (entry.frequency_type === 'monthly_first' || entry.frequency_type === 'monthly_last') {
    const dow = cfg.ordinal_day_of_week ?? 1;
    const cur = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1);
    while (cur <= effectiveEnd) {
      const year = cur.getFullYear();
      const month = cur.getMonth();
      let target: Date;
      if (entry.frequency_type === 'monthly_first') {
        target = new Date(year, month, 1);
        while (target.getDay() !== dow) target.setDate(target.getDate() + 1);
      } else {
        target = new Date(year, month, lastDayOfMonth(year, month));
        while (target.getDay() !== dow) target.setDate(target.getDate() - 1);
      }
      if (target >= effectiveStart && target <= effectiveEnd) {
        dates.push(fmtDate(target));
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return dates;
  }

  if (entry.frequency_type === 'monthly_day') {
    const dom = Math.min(Math.max(cfg.day_of_month ?? 1, 1), 31);
    const cur = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1);
    while (cur <= effectiveEnd) {
      const year = cur.getFullYear();
      const month = cur.getMonth();
      const lastDay = lastDayOfMonth(year, month);
      const day = Math.min(dom, lastDay);
      const target = new Date(year, month, day);
      if (target >= effectiveStart && target <= effectiveEnd) {
        dates.push(fmtDate(target));
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return dates;
  }

  return dates;
}

/**
 * Merge scheduled occurrences into the WeeklyData grid by category.
 * For each scheduled date, find the week whose [weekKey, week_ending] window contains it,
 * and add the amount to the matching category line + total + net change + ending cash.
 */
export function mergeScheduledIntoWeekly(
  weekly: WeeklyData,
  entries: ScheduledCashFlow[],
): WeeklyData {
  if (!entries || entries.length === 0) return weekly;
  const sortedKeys = Object.keys(weekly).sort();
  if (sortedKeys.length === 0) return weekly;

  // Build week ranges
  const weekRanges = sortedKeys.map((k) => {
    const entry = weekly[k];
    const startDate = parseDate(k);
    const endDate = parseDate(typeof entry.week_ending === 'string' ? entry.week_ending : k);
    return { key: k, startDate, endDate };
  });
  const rangeStart = weekRanges[0].startDate;
  const rangeEnd = weekRanges[weekRanges.length - 1].endDate;

  // Clone weekly
  const out: WeeklyData = {};
  for (const k of sortedKeys) out[k] = { ...weekly[k] };

  const findWeekKey = (dateStr: string): string | null => {
    const d = parseDate(dateStr);
    for (const r of weekRanges) {
      if (d >= r.startDate && d <= r.endDate) return r.key;
    }
    return null;
  };

  // Apply entries
  for (const entry of entries) {
    const occurrences = generateOccurrences(entry, rangeStart, rangeEnd);
    for (const occ of occurrences) {
      const wk = findWeekKey(occ);
      if (!wk) continue;
      const target = out[wk] as any;
      const cat = entry.category;
      const amt = Number(entry.amount) || 0;
      target[cat] = (Number(target[cat]) || 0) + amt;
      if (entry.flow_type === 'cash_in') {
        target['TOTAL RECEIPTS'] = (Number(target['TOTAL RECEIPTS']) || 0) + amt;
        target['NET CHANGE'] = (Number(target['NET CHANGE']) || 0) + amt;
      } else {
        target['TOTAL DISBURSEMENTS'] = (Number(target['TOTAL DISBURSEMENTS']) || 0) + amt;
        target['NET CHANGE'] = (Number(target['NET CHANGE']) || 0) - amt;
      }
    }
  }

  // Recompute Ending Cash + Total Cash on Hand using roll-forward
  let prevEnd: number | null = null;
  for (const k of sortedKeys) {
    const target = out[k] as any;
    const begin = prevEnd !== null ? prevEnd : (Number(target['BEGINNING CASH']) || 0);
    target['BEGINNING CASH'] = begin;
    const newEnd = begin + (Number(target['NET CHANGE']) || 0);
    target['ENDING CASH'] = Math.round(newEnd);
    target['TOTAL CASH ON HAND'] = Math.round(newEnd + (Number(target["Add'l Liquidity (Delayed Draw)"]) || 0));
    prevEnd = target['ENDING CASH'];
  }

  return out;
}
