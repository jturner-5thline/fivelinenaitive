import { describe, it, expect } from "vitest";
import { isoMonthKey, pickMonthlySnapshots } from "../qboMonthly";

describe("qboMonthly", () => {
  it("keeps the 1st of the month in its own month", () => {
    expect(isoMonthKey("2026-01-01")).toBe("2026-01");
  });
  it("ignores multi-month YTD snapshots", () => {
    const picked = pickMonthlySnapshots([
      { realm_id: "r", period_start: "2026-02-01", period_end: "2026-07-31", fetched_at: "z" },
      { realm_id: "r", period_start: "2026-07-01", period_end: "2026-07-31", fetched_at: "a" },
    ]);
    expect(Object.keys(picked)).toEqual(["r::2026-07"]);
  });
  it("prefers the latest fetch for the same month", () => {
    const picked = pickMonthlySnapshots([
      { realm_id: "r", period_start: "2026-07-01", period_end: "2026-07-31", fetched_at: "2026-08-01" },
      { realm_id: "r", period_start: "2026-07-01", period_end: "2026-07-31", fetched_at: "2026-09-01" },
    ]);
    expect(picked["r::2026-07"].fetched_at).toBe("2026-09-01");
  });
  it("skips cash-basis snapshots", () => {
    expect(pickMonthlySnapshots([{ realm_id: "r", period_start: "2026-07-01", period_end: "2026-07-31", accounting_method: "Cash" }])).toEqual({});
  });
});

import { withDebtPnlRevenue, DEBT_REVENUE_REALM_ID } from "../qboMonthly";
describe("withDebtPnlRevenue", () => {
  it("replaces Debt invoices with monthly P&L income and keeps other realms", () => {
    const rows = withDebtPnlRevenue(
      [
        { realm_id: DEBT_REVENUE_REALM_ID, txn_date: "2026-04-10", total_amt: 75000 },
        { realm_id: "fs", txn_date: "2026-04-10", total_amt: 100 },
      ],
      [
        { realm_id: DEBT_REVENUE_REALM_ID, period_start: "2026-04-01", period_end: "2026-04-30", income_total: 67222, fetched_at: "b" },
        { realm_id: DEBT_REVENUE_REALM_ID, period_start: "2026-04-01", period_end: "2026-04-30", income_total: 82778, fetched_at: "a" },
        { realm_id: DEBT_REVENUE_REALM_ID, period_start: "2026-01-01", period_end: "2026-04-30", income_total: 999999, fetched_at: "c" },
      ],
    );
    const debt = rows.filter((r) => r.realm_id === DEBT_REVENUE_REALM_ID);
    expect(debt).toEqual([{ realm_id: DEBT_REVENUE_REALM_ID, txn_date: "2026-04-01", total_amt: 67222 }]);
    expect(rows.find((r) => r.realm_id === "fs")?.total_amt).toBe(100);
  });
});

import { withPnlRevenue } from "../qboMonthly";
describe("withPnlRevenue covers every entity", () => {
  it("uses FinServ and Technologies P&L income instead of invoices", () => {
    const rows = withPnlRevenue(
      [
        { realm_id: "9341451968897660", txn_date: "2025-12-01", total_amt: 33991.4 },
        { realm_id: "9130350272677286", txn_date: "2026-06-01", total_amt: 400 },
      ],
      [
        { realm_id: "9341451968897660", period_start: "2025-12-01", period_end: "2025-12-31", income_total: 34645.49, fetched_at: "a" },
        { realm_id: "9130350272677286", period_start: "2026-06-01", period_end: "2026-06-30", income_total: 731.12, fetched_at: "a" },
      ] as never[],
    );
    expect(rows).toEqual([
      { realm_id: "9341451968897660", txn_date: "2025-12-01", total_amt: 34645.49 },
      { realm_id: "9130350272677286", txn_date: "2026-06-01", total_amt: 731.12 },
    ]);
  });
});
