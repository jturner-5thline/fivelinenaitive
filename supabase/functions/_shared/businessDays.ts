/**
 * Edge-function port of src/lib/businessDays.ts.
 * US business days (Mon–Fri, excludes federal holidays 2024–2030).
 */

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }
function observed(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  if (dow === 6) return ymd(y, m, d - 1);
  if (dow === 0) return ymd(y, m, d + 1);
  return ymd(y, m, d);
}
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return ymd(y, m, 1 + offset + (n - 1) * 7);
}
function lastWeekday(y: number, m: number, weekday: number): string {
  const last = new Date(Date.UTC(y, m, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(y, m, last.getUTCDate() - offset);
}
function holidaysForYear(y: number): string[] {
  return [
    observed(y, 1, 1),
    nthWeekday(y, 1, 1, 3),
    nthWeekday(y, 2, 1, 3),
    lastWeekday(y, 5, 1),
    observed(y, 6, 19),
    observed(y, 7, 4),
    nthWeekday(y, 9, 1, 1),
    nthWeekday(y, 10, 1, 2),
    observed(y, 11, 11),
    nthWeekday(y, 11, 4, 4),
    observed(y, 12, 25),
  ];
}
const HOLIDAYS: ReadonlySet<string> = new Set(
  [2024, 2025, 2026, 2027, 2028, 2029, 2030].flatMap(holidaysForYear),
);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const key = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return !HOLIDAYS.has(key);
}

export function businessDaysBetween(from: Date, to: Date): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    if (isBusinessDay(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Subtract N business days from `from` and return the resulting Date (start-of-day). */
export function subtractBusinessDays(from: Date, n: number): Date {
  const cursor = startOfDay(from);
  let remaining = n;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    if (isBusinessDay(cursor)) remaining--;
  }
  return cursor;
}

/** Add N business days to `from` and return the resulting Date (start-of-day). */
export function addBusinessDays(from: Date, n: number): Date {
  const cursor = startOfDay(from);
  let remaining = n;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) remaining--;
  }
  return cursor;
}