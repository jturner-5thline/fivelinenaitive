/**
 * Deal freshness helpers.
 *
 * A deal is considered "stale" when its most recent status or stage update
 * is more than `STALE_BUSINESS_DAYS` business days in the past. Used by the
 * left-column pipeline tile to surface a soft attention glow.
 */

export const STALE_BUSINESS_DAYS = 2;

/** Number of business days (Mon–Fri) strictly between two timestamps. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  if (to <= from) return 0;

  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * `true` when the elapsed business days since `lastChangeAt` reach the
 * stale threshold. A missing timestamp is treated as never-updated and
 * therefore stale only after the threshold has actually elapsed since the
 * caller-provided fallback (typically `deal.createdAt`).
 */
export function isDealStaleByBusinessDays(
  lastChangeAt: string | Date | null | undefined,
  threshold: number = STALE_BUSINESS_DAYS,
  now: Date = new Date(),
): boolean {
  if (!lastChangeAt) return false;
  const last =
    lastChangeAt instanceof Date ? lastChangeAt : new Date(lastChangeAt);
  if (Number.isNaN(last.getTime())) return false;
  return businessDaysBetween(last, now) >= threshold;
}