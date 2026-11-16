// Timezone-safe helpers for QuickBooks dates stored as "YYYY-MM-DD".
// Never parse these with `new Date()`: that reads UTC midnight and shifts
// the date into the previous month in US timezones.

export function isoMonthKey(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}/.test(date)) return null;
  return date.slice(0, 7);
}

export interface PnlSnapshotLike {
  realm_id: string | null;
  period_start: string | null;
  period_end: string | null;
  fetched_at?: string | null;
  accounting_method?: string | null;
}

/**
 * Picks one single-month Accrual snapshot per (realm, month).
 * Multi-month (YTD/quarter) aggregates are ignored entirely so they can
 * never be counted as a monthly figure. Latest fetched_at wins.
 */
function lastDayOfMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function pickMonthlySnapshots<T extends PnlSnapshotLike>(rows: T[]): Record<string, T> {
  const best: Record<string, T> = {};
  for (const r of rows) {
    if (!r.realm_id) continue;
    if ((r.accounting_method ?? "Accrual") !== "Accrual") continue;
    const startKey = isoMonthKey(r.period_start);
    const endKey = isoMonthKey(r.period_end ?? r.period_start);
    if (!startKey || startKey !== endKey) continue;
    // Full calendar months only: partial month-to-date fetches are not monthly totals.
    if (!r.period_start!.endsWith("-01") || r.period_end !== lastDayOfMonth(startKey)) continue;
    const key = `${r.realm_id}::${startKey}`;
    const prev = best[key];
    if (!prev || (r.fetched_at ?? "") > (prev.fetched_at ?? "")) best[key] = r;
  }
  return best;
}

/** Capital Advisors (Debt Advisory) realm: revenue = QBO P&L Total Income, never invoices. */
export const DEBT_REVENUE_REALM_ID = "193514877331929";

export interface RevenueRowLike {
  realm_id: string | null;
  txn_date: string | null;
  total_amt: number | null;
}

/**
 * Replaces Capital Advisors invoice rows with one synthetic row per calendar
 * month carrying that month's Accrual P&L Total Income (dated the 1st), so
 * any invoice-sum revenue widget reports QBO revenue for Debt Advisory.
 * Other realms' invoices pass through unchanged.
 */
export function withDebtPnlRevenue<T extends RevenueRowLike>(
  invoices: T[],
  snapshots: (PnlSnapshotLike & { income_total: number | null })[],
): RevenueRowLike[] {
  const out: RevenueRowLike[] = invoices.filter((r) => r.realm_id !== DEBT_REVENUE_REALM_ID);
  const best = pickMonthlySnapshots(snapshots.filter((s) => s.realm_id === DEBT_REVENUE_REALM_ID));
  for (const key of Object.keys(best)) {
    const month = key.split("::")[1];
    out.push({ realm_id: DEBT_REVENUE_REALM_ID, txn_date: `${month}-01`, total_amt: Number(best[key].income_total ?? 0) });
  }
  return out;
}
