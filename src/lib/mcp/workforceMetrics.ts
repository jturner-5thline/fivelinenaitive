/**
 * Pure helpers for headcount, Harvest and per-head/per-hour MCP tools.
 * Mirrors src/lib/monthlyHeadcount.ts, src/lib/metrics/ttmPerHead.ts and the
 * Harvest aggregation so Claude reports the same numbers as Insights.
 */
export const WORKSPACE_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";
export const HARVEST_START = "2024-01-01";
export const UNITS = [
  { realm_id: "193514877331929", label: "Debt", name: "5th Line Capital Advisors LLC" },
  { realm_id: "9341451968897660", label: "FinServ", name: "5th Line Financial Services, LLC" },
  { realm_id: "9130350272677286", label: "Tech", name: "5th Line Technologies LLC" },
  { realm_id: "123146077561874", label: "Parent", name: "5th Line Capital, LLC" },
] as const;
export const FINSERV_REALM = UNITS[1].realm_id;
export const DEBT_REALM = UNITS[0].realm_id;
export const DUPLICATE_NOTE = "James is counted in both Debt & Parent, so firm-wide totals subtract 1.";

export type HcRow = { realm_id: string; month: string; headcount: number | string | null };

/** Firm-wide monthly total: sum of entered units minus 1, floored at 0; null when nothing entered. */
export function firmTotal(values: Array<number | null>): number | null {
  const entered = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!entered.length) return null;
  return Math.max(0, entered.reduce((s, v) => s + v, 0) - 1);
}

export function headcountMatrix(rows: HcRow[]) {
  const byMonth = new Map<string, Record<string, number | null>>();
  for (const r of rows) {
    const k = r.month.slice(0, 7);
    const unit = UNITS.find((u) => u.realm_id === r.realm_id)?.label ?? r.realm_id;
    const rec = byMonth.get(k) ?? {};
    const v = r.headcount == null ? null : Number(r.headcount);
    rec[unit] = v != null && Number.isFinite(v) ? v : null;
    byMonth.set(k, rec);
  }
  return [...byMonth.keys()].sort().map((month) => {
    const rec = byMonth.get(month)!;
    const units = Object.fromEntries(UNITS.map((u) => [u.label, rec[u.label] ?? null]));
    return { month, ...units, firm_total: firmTotal(UNITS.map((u) => rec[u.label] ?? null)) };
  });
}

export type HarvestRow = { spent_date: string; hours: number | string; billable: boolean; billable_rate: number | string | null; currency: string | null; user_name: string | null };

export function aggregateHarvestMonths(entries: HarvestRow[]) {
  const months: Record<string, { hours: number; billable_hours: number; billable_amount: number; missing_rates: number; people: Record<string, { hours: number; billable_hours: number }> }> = {};
  for (const e of entries) {
    if (e.spent_date < HARVEST_START) continue;
    const h = Number(e.hours) || 0;
    const m = (months[e.spent_date.slice(0, 7)] ||= { hours: 0, billable_hours: 0, billable_amount: 0, missing_rates: 0, people: {} });
    const p = (m.people[e.user_name ?? "Unknown"] ||= { hours: 0, billable_hours: 0 });
    m.hours += h; p.hours += h;
    if (e.billable) {
      m.billable_hours += h; p.billable_hours += h;
      if (e.billable_rate == null || e.currency !== "USD") m.missing_rates++;
      else m.billable_amount += h * Number(e.billable_rate);
    }
  }
  return months;
}

/** Same rule as the dashboard: numerator ÷ billable hours of ALL users; null when no hours. */
export function perHour(numerator: number, billableHours: number): number | null {
  return billableHours > 0 ? numerator / billableHours : null;
}

export function addMonthsKey(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Rolling TTM per head ending at endMonth: requires all 12 months of headcount. */
export function ttmPerHead(endMonth: string, amountByMonth: Record<string, number>, hcByMonth: Record<string, number | null>) {
  const months = Array.from({ length: 12 }, (_, i) => addMonthsKey(endMonth, i - 11));
  const amount = months.reduce((s, k) => s + (amountByMonth[k] ?? 0), 0);
  const complete = months.every((k) => hcByMonth[k] != null);
  const avg = complete ? months.reduce((s, k) => s + (hcByMonth[k] ?? 0), 0) / 12 : null;
  return { period_end_month: endMonth, ttm_start_month: months[0], ttm_amount: amount, avg_headcount: avg, per_head: avg && avg > 0 ? amount / avg : null };
}
