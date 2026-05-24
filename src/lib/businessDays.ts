import { US_FEDERAL_HOLIDAYS, isUsFederalHoliday } from './usFederalHolidays';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isBusinessDay(d: Date, holidays: ReadonlySet<string>): boolean {
  if (isWeekend(d)) return false;
  if (isUsFederalHoliday(d, holidays)) return false;
  return true;
}

/**
 * Count US business days (Mon–Fri excluding federal holidays) strictly
 * between `from` and `to`, NOT counting the `from` day itself but counting
 * `to` when it is a business day. Result is always >= 0.
 */
export function businessDaysBetween(
  from: Date,
  to: Date,
  holidays: ReadonlySet<string> = US_FEDERAL_HOLIDAYS,
): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    if (isBusinessDay(cursor, holidays)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export interface StalenessResult {
  stale: boolean;
  businessDaysSince: number;
}

/**
 * Returns whether a status note is stale. Threshold: > 3 business days.
 * Null/undefined `lastUpdatedAt` is always considered stale.
 */
export function isStatusNoteStale(
  lastUpdatedAt: Date | string | null | undefined,
  today: Date = new Date(),
  holidays: ReadonlySet<string> = US_FEDERAL_HOLIDAYS,
): StalenessResult {
  if (!lastUpdatedAt) return { stale: true, businessDaysSince: Number.POSITIVE_INFINITY };
  const last = typeof lastUpdatedAt === 'string' ? new Date(lastUpdatedAt) : lastUpdatedAt;
  if (Number.isNaN(last.getTime())) return { stale: true, businessDaysSince: Number.POSITIVE_INFINITY };
  const bd = businessDaysBetween(last, today, holidays);
  return { stale: bd > 3, businessDaysSince: bd };
}