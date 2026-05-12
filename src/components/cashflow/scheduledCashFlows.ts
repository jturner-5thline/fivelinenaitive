// Helpers and types for scheduled cash flow entries
import type { WeeklyData, WeeklyOverrides } from './types';

export type FrequencyType =
  | 'one_time'
  | 'weekly'
  | 'bi_weekly'
  | 'monthly_first'
  | 'monthly_last'
  | 'monthly_day';
export type FlowType = 'cash_in' | 'cash_out';

export interface FrequencyConfig {
  one_time_date?: string;       // YYYY-MM-DD
  day_of_week?: number;         // 0=Sun..6=Sat
  ordinal_day_of_week?: number; // for monthly_first / monthly_last (0..6)
  day_of_month?: number;        // 1..31 for monthly_day
  /** Optional ± variance percentage applied per occurrence (e.g. 10 = ±10%). */
  variance_pct?: number;
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
// IMPORTANT: these labels MUST match the corresponding row keys in the Weekly
// Report grid (see WEEKLY_ROW_ORDER in WeeklyReportTab.tsx) so that an entry
// saved with category "Retainers" lands in the visible "Retainers" row — the
// same direct mapping FinServ Revenue uses.
export const DEBT_ADVISORY_SUBCATEGORIES = [
  'Retainers',
  'Milestones',
  'Closing Fees',
  'Referral Fees',
] as const;

// Default fallback when a legacy entry is on the parent without a sub-category
export const DEBT_ADVISORY_DEFAULT_SUBCATEGORY = 'Retainers';

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
  Retainers: 'Advisors Revenue',
  Milestone: 'Advisors Revenue',
  Milestones: 'Advisors Revenue',
  'Closing Fees': 'Advisors Revenue',
  'Referral Fees': 'Advisors Revenue',
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
  'Insurance',
  '401k',
  'Ramp',
  'Other Cash Out',
] as const;

// Aliases that map legacy / human-friendly category labels to the canonical
// row keys above. This protects entries created before the schema change and
// also accepts the friendlier names users may type ("Other", etc.).
export const CATEGORY_ALIASES: Record<string, string> = {
  // Cash-In aliases — fold legacy singular labels into the canonical plural
  // labels that match the Weekly Report row keys directly.
  Retainer: 'Retainers',
  Milestone: 'Milestones',
  'Technology Revenue': 'Tech Revenue',
  'Other Receipts': 'Other Cash In',
  'Debt Advisory Revenue': 'Retainers',
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
  'Other Disbursements': 'Other Cash Out',
  Other: 'Other Cash Out',
};

/** Resolve any incoming category label to its canonical weekly row key. */
export function resolveCategoryAlias(category: string): string {
  return CATEGORY_ALIASES[category] || category;
}

/**
 * Map canonical short category keys (used by the Configure modal) to the
 * actual long-form row keys rendered in the Weekly Report grid AND written by
 * the daily-to-weekly aggregator. Without this, Configure entries would write
 * to a key the grid never reads (e.g. "Retainer" vs grid row "Retainers"),
 * and the entry would silently disappear from the visible row.
 */
export const CANONICAL_TO_GRID_ROW: Record<string, string> = {
  // Cash-In — Retainers / Milestones / Closing Fees / Referral Fees all use
  // the same key on both sides (fall-through in resolveCategoryToGridRow),
  // mirroring how "FinServ Revenue" maps directly to its grid row.
  'Tech Revenue': 'Technology Revenue',
  'Other Cash In': 'Other Receipts',
  // Cash-Out
  'Payroll Expense': 'Payroll - Salaries',
  'Contractor Expense': 'Contractors & Consultants',
  'Advertising Bank Fees': 'Advertising & Marketing',
  Software: 'Software & Technology',
  'Professional Services': 'Legal & Professional',
  'Other Cash Out': 'Other Disbursements',
  Insurance: 'Insurance',
};

/**
 * Resolve a Configure-modal category to the exact key used by the Weekly Report
 * grid (and the daily aggregator). Two-step: alias → canonical, then canonical
 * → grid row.
 */
export function resolveCategoryToGridRow(category: string): string {
  const canonical = resolveCategoryAlias(category);
  return CANONICAL_TO_GRID_ROW[canonical] || canonical;
}

/**
 * Reverse of CANONICAL_TO_GRID_ROW: maps a Weekly-Report grid row key (which
 * is what the inline "+ Add" cell popover uses for `category`) back to the
 * canonical category that the Configure modal's Category <Select> can render.
 *
 * Without this, an inline-add saves `category: "Payroll - Salaries"` and the
 * Configure modal shows the row with an empty Category field (because that
 * label isn't in CASH_OUT_CATEGORIES). After resolving, we save the canonical
 * `"Payroll Expense"` instead — which is in the dropdown — and
 * `resolveCategoryToGridRow` still resolves it back to the correct row at
 * render time.
 */
const GRID_ROW_TO_CANONICAL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [canonical, gridRow] of Object.entries(CANONICAL_TO_GRID_ROW)) {
    // Only set if not already present so the first canonical wins on collisions.
    if (!out[gridRow]) out[gridRow] = canonical;
  }
  // Aliases that share a target grid row but should map back to a single
  // canonical for the dropdown. The CANONICAL_TO_GRID_ROW pass above already
  // covers most cases; explicit overrides go here.
  out['Payroll - Taxes & Benefits'] = 'Payroll Expense';
  out['Office & Admin'] = 'Other Cash Out';
  out['Travel & Entertainment'] = 'Other Cash Out';
  out['Rent & Occupancy'] = 'Other Cash Out';
  return out;
})();

/**
 * Given a category as it would appear in the Weekly Report grid (e.g. an
 * inline-add row key like "Payroll - Salaries" or "Retainers"), return the
 * canonical category that matches an option in the Configure modal's
 * Category dropdown. Falls back to the input if no mapping is needed.
 */
export function gridRowToCanonicalCategory(gridRowKey: string): string {
  return GRID_ROW_TO_CANONICAL[gridRowKey] || gridRowKey;
}

export const DAY_OF_WEEK_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Deterministic pseudo-random in [-1, 1] from a string seed (entry id + date).
 * Stable across renders so the projected weekly grid does not flicker.
 */
function seededUnit(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Map to [-1, 1]
  return ((h % 20001) - 10000) / 10000;
}

/**
 * Apply optional ± Variance % to a base amount, deterministically per
 * (entry, occurrence date). Returns the base amount when variance is
 * unset / zero / invalid.
 */
export function applyVariance(
  baseAmount: number,
  variancePct: number | undefined | null,
  seedKey: string,
): number {
  const v = Number(variancePct);
  if (!Number.isFinite(v) || v <= 0) return baseAmount;
  const factor = 1 + (v / 100) * seededUnit(seedKey);
  // Clamp to non-negative
  return Math.max(0, baseAmount * factor);
}

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

  if (entry.frequency_type === 'bi_weekly') {
    const dow = cfg.day_of_week ?? 1;
    const cur = new Date(effectiveStart);
    while (cur.getDay() !== dow && cur <= effectiveEnd) {
      cur.setDate(cur.getDate() + 1);
    }
    while (cur <= effectiveEnd) {
      dates.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 14);
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
  options?: { lockHistoricalThrough?: string; weeklyOverrides?: WeeklyOverrides },
): WeeklyData {
  const lockThrough = options?.lockHistoricalThrough ?? null;
  const overrides = options?.weeklyOverrides || {};
  if ((!entries || entries.length === 0) && !lockThrough) return weekly;
  const sortedKeys = Object.keys(weekly).sort();
  if (sortedKeys.length === 0) return weekly;

  // DEV trace — surface exactly which Configure entries are being routed and to
  // which weekly grid row. Critical for debugging Debt Advisory subcategories
  // (Retainers / Milestones / Closing Fees / Referral Fees) silently failing
  // to render. Only logged in dev builds.
  const traceRows: Array<{ id: string; category: string; resolvedRow: string; flow: string; occ: string; week: string | null; amount: number }> = [];
  const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;

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
      // Then map canonical → actual grid row key (the long-form label the
      // Weekly Report renders and the daily aggregator writes to). This is
      // what makes a Configure "Retainer" entry land in the visible
      // "Retainers" row, "Payroll Expense" in "Payroll - Salaries", etc.
      const cat = resolveCategoryToGridRow(entry.category);
      const baseAmt = Number(entry.amount) || 0;
      const amt = applyVariance(
        baseAmt,
        entry.frequency_config?.variance_pct,
        `${entry.id || entry.category}:${occ}`,
      );
      target[cat] = (Number(target[cat]) || 0) + amt;
      if (isDev) {
        traceRows.push({
          id: entry.id || '(unsaved)',
          category: entry.category,
          resolvedRow: cat,
          flow: entry.flow_type,
          occ,
          week: wk,
          amount: amt,
        });
      }
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

  if (isDev && traceRows.length > 0) {
    // Group by resolved row so it's easy to spot Debt Advisory subcategories.
    const byRow: Record<string, number> = {};
    for (const r of traceRows) byRow[r.resolvedRow] = (byRow[r.resolvedRow] || 0) + r.amount;
    // eslint-disable-next-line no-console
    console.log('[cashflow] mergeScheduledIntoWeekly routed entries', {
      totalEntries: (entries || []).length,
      totalOccurrences: traceRows.length,
      perRowTotals: byRow,
      sample: traceRows.slice(0, 20),
    });
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
    // Manual overrides are authoritative — they win over both the rolled-
    // forward chain AND the computed Net Change. Beginning Cash override
    // breaks the chain and starts a new one from the user's value. Ending
    // Cash override pins the closing balance regardless of inflows/outflows.
    const ov = overrides[k];
    const overrideBegin = ov?.beginningCash;
    const overrideEnd = ov?.endingCash;
    const begin = overrideBegin !== undefined && overrideBegin !== null
      ? Number(overrideBegin)
      : (prevEnd !== null ? prevEnd : (Number(target['BEGINNING CASH']) || 0));
    target['BEGINNING CASH'] = begin;
    const computedEnd = begin + (Number(target['NET CHANGE']) || 0);
    const newEnd = overrideEnd !== undefined && overrideEnd !== null
      ? Number(overrideEnd)
      : computedEnd;
    target['ENDING CASH'] = Math.round(newEnd);
    const addlLegacy = Number(target["Add'l Liquidity (Delayed Draw)"]) || 0;
    const addlNew = Number(target['Addl Liquidity Chase Tax Reserve MT Chk']) || 0;
    target['TOTAL CASH ON HAND'] = Math.round(newEnd + addlLegacy + addlNew);
    prevEnd = target['ENDING CASH'];
  }

  return out;
}
