/**
 * Per–data-source monthly resolvers used by the "Show monthly breakdown"
 * toggle on Insights stat widgets. Each resolver returns three values —
 * one per month of the selected quarter — plus a formatter and label so
 * the presentational component can render consistently regardless of
 * whether the source is deals, QuickBooks, or FinServ.
 */
import { format } from "date-fns";

export interface MonthlyValuePoint {
  monthKey: string;   // "2026-04"
  monthLabel: string; // "Apr"
  value: number | null;
}

export type ValueFormat = "usd" | "usd-precise" | "count" | "percent";

export interface MonthlyResolverResult {
  points: MonthlyValuePoint[];
  format: ValueFormat;
  isLoading?: boolean;
  note?: string; // small caption under the widget, e.g. "Sum of invoiced revenue"
}

/** Ordered YYYY-MM keys and month labels for a quarter's three months. */
export function quarterMonthBuckets(
  start: string, // YYYY-MM-DD (Q start)
  end: string,   // YYYY-MM-DD (Q end)
): { monthKey: string; monthLabel: string; monthStart: Date; monthEnd: Date }[] {
  const startDate = new Date(start + "T00:00:00");
  const buckets: {
    monthKey: string;
    monthLabel: string;
    monthStart: Date;
    monthEnd: Date;
  }[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
    buckets.push({
      monthKey: format(m, "yyyy-MM"),
      monthLabel: format(m, "MMM"),
      monthStart: m,
      monthEnd: mEnd,
    });
  }
  // Trim to actual end (protect against custom short quarters).
  const endDate = new Date(end + "T23:59:59");
  return buckets.filter((b) => b.monthStart <= endDate);
}

function inMonth(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

// ────────────────────────────────────────────────────────────
// Deals-based resolvers (rely on rawDeals already loaded on the page).
// ────────────────────────────────────────────────────────────

export function resolveDealsMonthly(
  dataSource: string,
  quarter: { start: string; end: string },
  rawDeals?: any[] | null,
): MonthlyResolverResult | null {
  if (!rawDeals) return null;
  const buckets = quarterMonthBuckets(quarter.start, quarter.end);

  switch (dataSource) {
    case "active-pipeline": {
      // Snapshot at end of each month: deals last updated in-month and not archived.
      const points = buckets.map((b) => {
        const inRange = rawDeals.filter((d) => inMonth(d.updated_at, b.monthStart, b.monthEnd));
        const active = inRange.filter((d) => d.status !== "archived");
        const value = active.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
        return { monthKey: b.monthKey, monthLabel: b.monthLabel, value };
      });
      return { points, format: "usd", note: "Active pipeline value updated in-month" };
    }
    case "closed-won": {
      const points = buckets.map((b) => {
        const closed = rawDeals.filter(
          (d) =>
            d.status === "archived" &&
            d.stage === "closed-won" &&
            inMonth(d.updated_at, b.monthStart, b.monthEnd),
        );
        const value = closed.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
        return { monthKey: b.monthKey, monthLabel: b.monthLabel, value };
      });
      return { points, format: "usd", note: "Value of deals closed-won in month" };
    }
    case "total-fees": {
      const points = buckets.map((b) => {
        const closed = rawDeals.filter(
          (d) =>
            d.status === "archived" &&
            d.stage === "closed-won" &&
            inMonth(d.updated_at, b.monthStart, b.monthEnd),
        );
        const value = closed.reduce((s: number, d: any) => s + Number(d.total_fee || 0), 0);
        return { monthKey: b.monthKey, monthLabel: b.monthLabel, value };
      });
      return { points, format: "usd", note: "Fees on deals closed in month" };
    }
    case "avg-deal-size": {
      const points = buckets.map((b) => {
        const closed = rawDeals.filter(
          (d) =>
            d.status === "archived" &&
            d.stage === "closed-won" &&
            inMonth(d.updated_at, b.monthStart, b.monthEnd),
        );
        const total = closed.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
        const value = closed.length > 0 ? total / closed.length : 0;
        return { monthKey: b.monthKey, monthLabel: b.monthLabel, value };
      });
      return { points, format: "usd", note: "Average size of deals closed in month" };
    }
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// QuickBooks resolvers (rely on rawInvoices / rawPayments / rawExpenses).
// ────────────────────────────────────────────────────────────

export function resolveQbMonthly(
  dataSource: string,
  quarter: { start: string; end: string },
  raw: { rawInvoices?: any[] | null; rawPayments?: any[] | null; rawExpenses?: any[] | null },
): MonthlyResolverResult | null {
  const buckets = quarterMonthBuckets(quarter.start, quarter.end);
  const { rawInvoices, rawPayments, rawExpenses } = raw;

  switch (dataSource) {
    case "qb-total-revenue": {
      if (!rawInvoices) return null;
      const points = buckets.map((b) => {
        const inv = rawInvoices.filter((i: any) => inMonth(i.txn_date, b.monthStart, b.monthEnd));
        return {
          monthKey: b.monthKey,
          monthLabel: b.monthLabel,
          value: inv.reduce((s: number, i: any) => s + (i.total_amt || 0), 0),
        };
      });
      return { points, format: "usd", note: "Sum of invoices dated in month" };
    }
    case "qb-total-payments": {
      if (!rawPayments) return null;
      const points = buckets.map((b) => {
        const p = rawPayments.filter((r: any) => inMonth(r.txn_date, b.monthStart, b.monthEnd));
        return {
          monthKey: b.monthKey,
          monthLabel: b.monthLabel,
          value: p.reduce((s: number, r: any) => s + (r.total_amt || 0), 0),
        };
      });
      return { points, format: "usd", note: "Payments received in month" };
    }
    case "qb-total-expenses": {
      if (!rawExpenses) return null;
      const points = buckets.map((b) => {
        const e = rawExpenses.filter((r: any) => inMonth(r.txn_date, b.monthStart, b.monthEnd));
        return {
          monthKey: b.monthKey,
          monthLabel: b.monthLabel,
          value: e.reduce((s: number, r: any) => s + (r.total_amt || 0), 0),
        };
      });
      return { points, format: "usd", note: "Expenses booked in month" };
    }
    case "qb-net-income": {
      if (!rawInvoices || !rawExpenses) return null;
      const points = buckets.map((b) => {
        const inv = rawInvoices.filter((i: any) => inMonth(i.txn_date, b.monthStart, b.monthEnd));
        const exp = rawExpenses.filter((r: any) => inMonth(r.txn_date, b.monthStart, b.monthEnd));
        const rev = inv.reduce((s: number, i: any) => s + (i.total_amt || 0), 0);
        const ex = exp.reduce((s: number, r: any) => s + (r.total_amt || 0), 0);
        return { monthKey: b.monthKey, monthLabel: b.monthLabel, value: rev - ex };
      });
      return { points, format: "usd", note: "Revenue minus expenses per month" };
    }
    case "qb-accounts-receivable": {
      if (!rawInvoices) return null;
      const points = buckets.map((b) => {
        const inv = rawInvoices.filter((i: any) => inMonth(i.txn_date, b.monthStart, b.monthEnd));
        return {
          monthKey: b.monthKey,
          monthLabel: b.monthLabel,
          value: inv.reduce((s: number, i: any) => s + (i.balance || 0), 0),
        };
      });
      return { points, format: "usd", note: "Outstanding balance on in-month invoices" };
    }
    case "qb-overdue-amount": {
      if (!rawInvoices) return null;
      const now = new Date();
      const points = buckets.map((b) => {
        const overdue = rawInvoices.filter(
          (i: any) =>
            inMonth(i.txn_date, b.monthStart, b.monthEnd) &&
            i.due_date &&
            i.balance > 0 &&
            new Date(i.due_date) < now,
        );
        return {
          monthKey: b.monthKey,
          monthLabel: b.monthLabel,
          value: overdue.reduce((s: number, i: any) => s + (i.balance || 0), 0),
        };
      });
      return { points, format: "usd", note: "Overdue balance on in-month invoices" };
    }
    default:
      return null;
  }
}

/**
 * List of dataSource ids that support the monthly breakdown. Used both
 * by the toggle-supported check and by the render dispatcher.
 */
export const MONTHLY_BREAKDOWN_SUPPORTED = new Set<string>([
  // Deals
  "active-pipeline",
  "closed-won",
  "total-fees",
  "avg-deal-size",
  // QuickBooks
  "qb-total-revenue",
  "qb-total-payments",
  "qb-total-expenses",
  "qb-net-income",
  "qb-accounts-receivable",
  "qb-overdue-amount",
  // FinServ (resolved through their dedicated hooks — see StatMonthlyBreakdown).
  "finserv-active-client-count",
  "finserv-total-mrr",
  "finserv-revenue-per-hour",
  "finserv-profit-per-hour",
]);

export function isMonthlyBreakdownSupported(dataSource?: string): boolean {
  if (!dataSource) return false;
  return MONTHLY_BREAKDOWN_SUPPORTED.has(dataSource);
}

// ────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────

export function formatMonthlyValue(v: number | null, f: ValueFormat): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (f) {
    case "usd": {
      const abs = Math.abs(v);
      if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000).toFixed(1)}K`;
      return `${v < 0 ? "-" : ""}$${abs.toFixed(0)}`;
    }
    case "usd-precise":
      return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    case "percent":
      return `${v.toFixed(1)}%`;
    case "count":
    default:
      return `${Math.round(v)}`;
  }
}

export function formatMonthlyDelta(current: number | null, prior: number | null, f: ValueFormat): string {
  if (current == null || prior == null) return "—";
  const diff = current - prior;
  if (Math.abs(diff) < 0.005) return "+0";
  const sign = diff > 0 ? "+" : "−";
  const absStr = formatMonthlyValue(Math.abs(diff), f);
  // Strip leading $ for symmetry with sign prefix but keep suffix like K/M.
  return `${sign}${absStr.replace(/^-/, "")}`;
}