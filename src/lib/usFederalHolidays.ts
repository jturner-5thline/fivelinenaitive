/**
 * Hardcoded US federal holidays for 2025–2030 used by the stale
 * deal-status nudge. Includes observed-date rules (federal holidays
 * falling on Sat are observed Fri; on Sun are observed Mon). No
 * network/runtime dependency — purely deterministic.
 */

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }

function observed(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  if (dow === 6) return ymd(y, m, d - 1); // Sat → Fri
  if (dow === 0) return ymd(y, m, d + 1); // Sun → Mon
  return ymd(y, m, d);
}

// Nth weekday of a month. weekday: 0=Sun..6=Sat; n: 1..5.
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return ymd(y, m, day);
}

function lastWeekday(y: number, m: number, weekday: number): string {
  // Last day of month
  const last = new Date(Date.UTC(y, m, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(y, m, last.getUTCDate() - offset);
}

function holidaysForYear(y: number): string[] {
  return [
    observed(y, 1, 1),                  // New Year's Day
    nthWeekday(y, 1, 1, 3),             // MLK Day (3rd Mon Jan)
    nthWeekday(y, 2, 1, 3),             // Presidents' Day (3rd Mon Feb)
    lastWeekday(y, 5, 1),               // Memorial Day (last Mon May)
    observed(y, 6, 19),                 // Juneteenth
    observed(y, 7, 4),                  // Independence Day
    nthWeekday(y, 9, 1, 1),             // Labor Day (1st Mon Sep)
    nthWeekday(y, 10, 1, 2),            // Columbus Day (2nd Mon Oct)
    observed(y, 11, 11),                // Veterans Day
    nthWeekday(y, 11, 4, 4),            // Thanksgiving (4th Thu Nov)
    observed(y, 12, 25),                // Christmas
  ];
}

const HOLIDAY_LIST = [2024, 2025, 2026, 2027, 2028, 2029, 2030]
  .flatMap(holidaysForYear);

export const US_FEDERAL_HOLIDAYS: ReadonlySet<string> = new Set(HOLIDAY_LIST);

export function isUsFederalHoliday(date: Date, set: ReadonlySet<string> = US_FEDERAL_HOLIDAYS): boolean {
  const key = ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return set.has(key);
}