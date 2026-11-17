/**
 * Period parsing for get_dashboard_tile_values. Pure, import-safe.
 * "YYYY-MM" (month), "YYYY-QN" (quarter) or explicit from/to dates (custom).
 */
export interface ResolvedPeriod {
  period: string;
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
  months: string[]; // YYYY-MM keys covered
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-based

export function monthKeysBetween(start: string, end: string): string[] {
  let [y, m] = start.slice(0, 7).split("-").map(Number);
  const [ey, em] = end.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  while ((y < ey || (y === ey && m <= em)) && out.length < 240) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function resolvePeriod(period: string): ResolvedPeriod {
  const mm = /^(\d{4})-(\d{2})$/.exec(period);
  if (mm) {
    const y = Number(mm[1]); const m = Number(mm[2]);
    if (m < 1 || m > 12) throw new Error(`Invalid month period: ${period}`);
    const start = `${y}-${pad(m)}-01`;
    const end = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
    return { period, start, end, months: [`${y}-${pad(m)}`] };
  }
  const qm = /^(\d{4})-Q([1-4])$/i.exec(period);
  if (qm) {
    const y = Number(qm[1]); const q = Number(qm[2]);
    const sm = (q - 1) * 3 + 1; const em = sm + 2;
    const start = `${y}-${pad(sm)}-01`;
    const end = `${y}-${pad(em)}-${pad(lastDay(y, em))}`;
    return { period: `${y}-Q${q}`, start, end, months: monthKeysBetween(start, end) };
  }
  throw new Error(`Invalid period "${period}" — use YYYY-MM or YYYY-QN.`);
}

export function resolveCustom(from: string, to: string): ResolvedPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("custom view needs from/to as YYYY-MM-DD");
  if (from > to) throw new Error("from must be on or before to");
  return { period: `${from}..${to}`, start: from, end: to, months: monthKeysBetween(from, to) };
}

/** Offset (minutes) of an IANA zone at a given instant, e.g. America/Chicago → -360 or -300. */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Wall-clock time in a zone → UTC Date. */
export function zonedTime(ymd: string, hms: string, timeZone: string): Date {
  const naive = new Date(`${ymd}T${hms}Z`);
  const off = zoneOffsetMinutes(timeZone, naive);
  const guess = new Date(naive.getTime() - off * 60000);
  const off2 = zoneOffsetMinutes(timeZone, guess);
  return off2 === off ? guess : new Date(naive.getTime() - off2 * 60000);
}

/** Years the Sales Dashboard fetches for a period (adds 2 prior months for a single month). */
export function salesV2DataYears(p: ResolvedPeriod): number[] {
  const [sy, sm] = p.start.split("-").map(Number);
  const startDate = p.months.length === 1 ? new Date(Date.UTC(sy, sm - 1 - 2, 1)) : new Date(Date.UTC(sy, sm - 1, 1));
  const ey = Number(p.end.slice(0, 4));
  const out: number[] = [];
  for (let y = startDate.getUTCFullYear(); y <= ey; y += 1) out.push(y);
  return out;
}
