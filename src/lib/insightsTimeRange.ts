import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
  differenceInMonths,
} from 'date-fns';

export type Granularity = 'monthly' | 'quarterly' | 'yearly';

export type TimeRangePresetId =
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'last_90_days'
  | 'qtd'
  | 'this_quarter'
  | 'last_quarter'
  | 'ytd'
  | 'ttm'
  | 'last_year'
  | 'custom';

export interface TimeRangePreset {
  id: TimeRangePresetId;
  label: string;
}

export const TIME_RANGE_PRESETS: TimeRangePreset[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_30_days', label: '30D' },
  { id: 'last_3_months', label: 'Last 3 Months' },
  { id: 'last_6_months', label: '6M' },
  { id: 'last_12_months', label: '12M' },
  { id: 'last_90_days', label: 'Last 90 Days' },
  { id: 'qtd', label: 'Quarter to Date' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'ytd', label: 'Year to Date' },
  { id: 'ttm', label: 'Last 12 Months (TTM)' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'custom', label: 'Custom range…' },
];

function ymd(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export interface ResolvedRange {
  id: TimeRangePresetId;
  start: string;
  end: string;
  label: string;
}

export interface ResolveOptions {
  custom?: { start: string; end: string };
  includeCurrentMonth?: boolean; // applies to YTD only; default true
}

export function resolveRange(
  id: TimeRangePresetId,
  customOrOptions?: { start: string; end: string } | ResolveOptions,
): ResolvedRange {
  // Back-compat: second arg may be either custom range or options object.
  const options: ResolveOptions = (customOrOptions && 'custom' in (customOrOptions as ResolveOptions))
    ? (customOrOptions as ResolveOptions)
    : { custom: customOrOptions as { start: string; end: string } | undefined };
  const custom = options.custom;
  const includeCurrentMonth = options.includeCurrentMonth ?? true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (id) {
    case 'this_month': {
      const s = startOfMonth(today);
      return { id, start: ymd(s), end: ymd(today), label: `${format(s, 'MMM yyyy')} (MTD)` };
    }
    case 'last_month': {
      const prev = subMonths(today, 1);
      return { id, start: ymd(startOfMonth(prev)), end: ymd(endOfMonth(prev)), label: format(prev, 'MMM yyyy') };
    }
    case 'last_30_days': {
      const s = subDays(today, 29);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 30 Days' };
    }
    case 'last_3_months': {
      const s = startOfMonth(subMonths(today, 2));
      const e = endOfMonth(today);
      return { id, start: ymd(s), end: ymd(e), label: 'Last 3 Months' };
    }
    case 'last_6_months': {
      const s = subMonths(today, 6);
      s.setDate(s.getDate() + 1);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 6 Months' };
    }
    case 'last_12_months': {
      const s = subMonths(today, 12);
      s.setDate(s.getDate() + 1);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 12 Months' };
    }
    case 'last_90_days': {
      const s = subDays(today, 89);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 90 Days' };
    }
    case 'qtd': {
      return { id, start: ymd(startOfQuarter(today)), end: ymd(today), label: 'QTD' };
    }
    case 'this_quarter': {
      const s = startOfQuarter(today);
      const e = endOfQuarter(today);
      const q = Math.floor(today.getMonth() / 3) + 1;
      return { id, start: ymd(s), end: ymd(e), label: `Q${q} ${today.getFullYear()}` };
    }
    case 'last_quarter': {
      const lq = subQuarters(today, 1);
      const s = startOfQuarter(lq);
      const e = endOfQuarter(lq);
      const q = Math.floor(s.getMonth() / 3) + 1;
      return { id, start: ymd(s), end: ymd(e), label: `Q${q} ${s.getFullYear()}` };
    }
    case 'ytd': {
      const start = startOfYear(today);
      if (includeCurrentMonth) {
        return { id, start: ymd(start), end: ymd(today), label: `${today.getFullYear()} YTD` };
      }
      // Exclude current month: end on last day of prior completed month.
      const priorEnd = endOfMonth(subMonths(today, 1));
      // Guard: if today is in January, prior month would be last year — fall back to today
      if (priorEnd < start) {
        return { id, start: ymd(start), end: ymd(today), label: `${today.getFullYear()} YTD` };
      }
      return {
        id,
        start: ymd(start),
        end: ymd(priorEnd),
        label: `${today.getFullYear()} YTD (thru ${format(priorEnd, 'MMM')})`,
      };
    }
    case 'ttm': {
      const s = subMonths(today, 12);
      // today-12mo+1d
      s.setDate(s.getDate() + 1);
      return { id, start: ymd(s), end: ymd(today), label: 'Trailing 12 Months' };
    }
    case 'last_year': {
      const ly = subYears(today, 1);
      return { id, start: ymd(startOfYear(ly)), end: ymd(endOfYear(ly)), label: `${ly.getFullYear()}` };
    }
    case 'custom': {
      if (custom?.start && custom?.end) {
        const s = new Date(custom.start + 'T00:00:00');
        const e = new Date(custom.end + 'T00:00:00');
        return {
          id,
          start: custom.start,
          end: custom.end,
          label: `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`,
        };
      }
      return resolveRange('ytd');
    }
  }
}

export function defaultGranularityForRange(start: string, end: string): Granularity {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const months = Math.max(1, differenceInMonths(e, s) + 1);
  if (months <= 3) return 'monthly';
  if (months <= 24) return 'monthly';
  return 'quarterly';
}

export interface BucketPeriod {
  start_date: string;
  end_date: string;
  key: string;
  label: string;
}

export function buildBuckets(start: string, end: string, granularity: Granularity): BucketPeriod[] {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const buckets: BucketPeriod[] = [];

  if (granularity === 'monthly') {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cursor <= endDate) {
      const mStart = startOfMonth(cursor);
      const mEnd = endOfMonth(cursor);
      const boundedStart = mStart < startDate ? startDate : mStart;
      const boundedEnd = mEnd > endDate ? endDate : mEnd;
      buckets.push({
        start_date: ymd(boundedStart),
        end_date: ymd(boundedEnd),
        key: format(mStart, 'yyyy-MM'),
        label: format(mStart, 'MMM yy'),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (granularity === 'quarterly') {
    const cursor = startOfQuarter(startDate);
    while (cursor <= endDate) {
      const qStart = startOfQuarter(cursor);
      const qEnd = endOfQuarter(cursor);
      const boundedStart = qStart < startDate ? startDate : qStart;
      const boundedEnd = qEnd > endDate ? endDate : qEnd;
      const q = Math.floor(qStart.getMonth() / 3) + 1;
      buckets.push({
        start_date: ymd(boundedStart),
        end_date: ymd(boundedEnd),
        key: `${qStart.getFullYear()}-Q${q}`,
        label: `Q${q} ${qStart.getFullYear()}`,
      });
      cursor.setMonth(cursor.getMonth() + 3);
    }
  } else {
    const cursor = startOfYear(startDate);
    while (cursor <= endDate) {
      const yStart = startOfYear(cursor);
      const yEnd = endOfYear(cursor);
      const boundedStart = yStart < startDate ? startDate : yStart;
      const boundedEnd = yEnd > endDate ? endDate : yEnd;
      buckets.push({
        start_date: ymd(boundedStart),
        end_date: ymd(boundedEnd),
        key: String(yStart.getFullYear()),
        label: String(yStart.getFullYear()),
      });
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  }

  return buckets;
}

const STORAGE_PREFIX = 'naitive.insights.timeRange.';

export interface PersistedTimeRange {
  presetId: TimeRangePresetId;
  granularity: Granularity;
  custom?: { start: string; end: string };
  includeCurrentMonth?: boolean;
}

export function loadPersistedRange(boardId: string): PersistedTimeRange | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + boardId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.presetId) return parsed;
  } catch { /* ignore */ }
  return null;
}

export function savePersistedRange(boardId: string, value: PersistedTimeRange) {
  try {
    globalThis.localStorage?.setItem(STORAGE_PREFIX + boardId, JSON.stringify(value));
  } catch { /* ignore */ }
}