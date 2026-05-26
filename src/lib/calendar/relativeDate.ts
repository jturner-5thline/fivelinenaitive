/**
 * getRelativeDateLabel — produce a natural-language label for a date,
 * relative to "now" in a specific IANA time zone.
 *
 *   same TZ-local day              -> "Today"
 *   next TZ-local day              -> "Tomorrow"
 *   within next 6 TZ-local days    -> weekday name ("Thursday")
 *   7+ days out                    -> "<Wkd>, <Mon> <D>" ("Mon, Jun 1")
 */

function ymdInTz(d: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Whole-day diff between two dates, evaluated in the given TZ. */
function tzDayDiff(target: Date, now: Date, tz: string): number {
  const a = ymdInTz(target, tz);
  const b = ymdInTz(now, tz);
  const aUtc = Date.UTC(a.y, a.m - 1, a.d);
  const bUtc = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((aUtc - bUtc) / 86_400_000);
}

export function getRelativeDateLabel(date: Date, now: Date, tz: string): string {
  const diff = tzDayDiff(date, now, tz);
  if (diff <= 0 && diff > -1) return 'Today';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff >= 2 && diff <= 5) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(date);
  }
  // 6+ days out — or past (fallback to full weekday + date).
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
  }).format(date);
}