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

// Sub-categories nested under "Advisors Revenue" (the parent row in the
// historical-seed weekly grid).
export const DEBT_ADVISORY_SUBCATEGORIES = [
  'Retainer',
  'Milestone',
  'Closing Fees',
] as const;

// Default fallback when a legacy entry is on the parent without a sub-category
export const DEBT_ADVISORY_DEFAULT_SUBCATEGORY = 'Retainer';

// Flat selectable Cash-In categories — these MUST match the row titles in
// `weeklyHistoricalSeed.ts` (CASH_IN_ROWS) so Configure entries roll into
// the correct weekly row.
export const CASH_IN_CATEGORIES = [
  ...DEBT_ADVISORY_SUBCATEGORIES,
  'FinServ Revenue',
  'Tech Revenue',
  'Loan Proceeds',
  'Other Cash In',
] as const;

// Grouped Cash-In options for the Configure modal Select
export const CASH_IN_GROUPED_OPTIONS: ReadonlyArray<{
  group?: string;
  options: ReadonlyArray<string>;
}> = [
  { group: 'Advisors Revenue', options: DEBT_ADVISORY_SUBCATEGORIES },
  { options: ['FinServ Revenue', 'Tech Revenue', 'Loan Proceeds', 'Other Cash In'] },
];

// Map child category -> parent for weekly grid roll-up.
export const CASH_IN_PARENT_MAP: Record<string, string> = {
  Retainer: 'Advisors Revenue',
  Milestone: 'Advisors Revenue',
  'Closing Fees': 'Advisors Revenue',
};

// Cash-Out categories — MUST match the row titles in `weeklyHistoricalSeed.ts`
// (CASH_OUT_ROWS) so Configure entries roll into the correct weekly row.
export const CASH_OUT_CATEGORIES = [
  'Payroll Expense',
  'Contractor Expense',
  'Advertising Bank Fees',
  'Loan Payments',
  'Distribution',
  'Credit Card Payments',
  'Professional Services',
  'Software',
  'Healthcare',
  '401k',
  'Ramp',
  'Other Cash Out',
] as const;

// Aliases that map legacy / human-friendly category labels to the canonical
// row keys above. This protects entries created before the schema change and
// also accepts the friendlier names users may type ("Other", etc.).
export const CATEGORY_ALIASES: Record<string, string> = {
  // Cash-In aliases
  Retainers: 'Retainer',
  Milestones: 'Milestone',
  'Referral Fees': 'Closing Fees',
  'Technology Revenue': 'Tech Revenue',
  'Other Receipts': 'Other Cash In',
  'Debt Advisory Revenue': 'Retainer',
  // Cash-Out aliases
  'Advertising & Marketing': 'Advertising Bank Fees',
  'Payroll - Salaries': 'Payroll Expense',
  'Payroll - Taxes & Benefits': 'Payroll Expense',
  'Contractors & Consultants': 'Contractor Expense',
  'Software & Technology': 'Software',
  'Legal & Professional': 'Professional Services',
  'Office & Admin': 'Other Cash Out',
  'Travel & Entertainment': 'Other Cash Out',
  'Rent & Occupancy': 'Other Cash Out',
  Insurance: 'Other Cash Out',
  'Other Disbursements': 'Other Cash Out',
  Other: 'Other Cash Out',
};

/** Resolve any incoming category label to its canonical weekly row key. */
export function resolveCategoryAlias(category: string): string {
  return CATEGORY_ALIASES[category] || category;
}

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
  options?: { lockHistoricalThrough?: string },
): WeeklyData {
  const lockThrough = options?.lockHistoricalThrough ?? null;
  if ((!entries || entries.length === 0) && !lockThrough) return weekly;
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
  for (const entry of entries || []) {
    const occurrences = generateOccurrences(entry, rangeStart, rangeEnd);
    for (const occ of occurrences) {
      // Ignore occurrences that fall on/before the historical lock cutoff —
      // those weeks are seeded from historical data and must not be mutated
      // by Configure entries.
      if (lockThrough && occ <= lockThrough) continue;
      const wk = findWeekKey(occ);
      if (!wk) continue;
      const target = out[wk] as any;
      // Resolve legacy / aliased category labels to the canonical weekly row
      // key (e.g. "Software & Technology" -> "Software", "Retainers" -> "Retainer").
      const cat = resolveCategoryAlias(entry.category);
      const amt = Number(entry.amount) || 0;
      target[cat] = (Number(target[cat]) || 0) + amt;
      // Note: parent "Advisors Revenue" value is computed in the weekly view as
      // the sum of its sub-categories, so we do NOT write to the parent key here.
      if (entry.flow_type === 'cash_in') {
        // Maintain both legacy (TOTAL RECEIPTS / NET CHANGE) and current
        // (CASH IN / TOTAL NET CASH CHANGE) totals so all consumers stay in sync.
        target['TOTAL RECEIPTS'] = (Number(target['TOTAL RECEIPTS']) || 0) + amt;
        target['CASH IN'] = (Number(target['CASH IN']) || 0) + amt;
        target['NET CHANGE'] = (Number(target['NET CHANGE']) || 0) + amt;
        target['TOTAL NET CASH CHANGE'] = (Number(target['TOTAL NET CASH CHANGE']) || 0) + amt;
      } else {
        target['TOTAL DISBURSEMENTS'] = (Number(target['TOTAL DISBURSEMENTS']) || 0) + amt;
        target['CASH OUT'] = (Number(target['CASH OUT']) || 0) + amt;
        target['NET CHANGE'] = (Number(target['NET CHANGE']) || 0) - amt;
        target['TOTAL NET CASH CHANGE'] = (Number(target['TOTAL NET CASH CHANGE']) || 0) - amt;
      }
    }
  }

  // Recompute Ending Cash + Total Cash on Hand using roll-forward
  let prevEnd: number | null = null;
  for (const k of sortedKeys) {
    const target = out[k] as any;
    const weekEnding = typeof target.week_ending === 'string' ? target.week_ending : k;
    // Historical (locked) weeks: keep their seeded BEGINNING/ENDING CASH and
    // TOTAL CASH ON HAND untouched. Just carry forward their ending cash so
    // the first forward week starts from the correct balance.
    if (lockThrough && weekEnding <= lockThrough) {
      const ec = Number(target['ENDING CASH']);
      prevEnd = Number.isFinite(ec) ? ec : prevEnd;
      continue;
    }
    const begin = prevEnd !== null ? prevEnd : (Number(target['BEGINNING CASH']) || 0);
    target['BEGINNING CASH'] = begin;
    const newEnd = begin + (Number(target['NET CHANGE']) || 0);
    target['ENDING CASH'] = Math.round(newEnd);
    const addlLegacy = Number(target["Add'l Liquidity (Delayed Draw)"]) || 0;
    const addlNew = Number(target['Addl Liquidity Chase Tax Reserve MT Chk']) || 0;
    target['TOTAL CASH ON HAND'] = Math.round(newEnd + addlLegacy + addlNew);
    prevEnd = target['ENDING CASH'];
  }

  return out;
}
