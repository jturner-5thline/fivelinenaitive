/**
 * Weekly bucketing for sales-call events. Weeks start Monday 00:00 UTC.
 * Import-safe: pure functions only.
 */
export interface SalesCallLike {
  start: string | null;
  company?: string | null;
  title?: string | null;
}

export function weekStartUtc(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Returns one row per week in [from, to], including zero-count weeks. */
export function bucketSalesCallsByWeek(events: SalesCallLike[], from: Date, to: Date) {
  const weeks = new Map<string, { week_start: string; week_end: string; count: number; companies: string[] }>();
  for (let w = weekStartUtc(from); w <= to; w = new Date(w.getTime() + 7 * 86400000)) {
    const end = new Date(w.getTime() + 6 * 86400000);
    weeks.set(iso(w), { week_start: iso(w), week_end: iso(end), count: 0, companies: [] });
  }
  for (const ev of events) {
    if (!ev.start) continue;
    const d = new Date(ev.start);
    if (Number.isNaN(d.getTime()) || d < from || d > to) continue;
    const row = weeks.get(iso(weekStartUtc(d)));
    if (!row) continue;
    row.count += 1;
    if (ev.company) row.companies.push(ev.company);
  }
  return [...weeks.values()];
}
