import { describe, it, expect } from "vitest";
import { firmTotal, headcountMatrix, aggregateHarvestMonths, perHour, ttmPerHead } from "../workforceMetrics";

describe("workforce MCP metrics", () => {
  it("firm total subtracts the James duplicate", () => {
    expect(firmTotal([3, 2, null, 1])).toBe(5);
    expect(firmTotal([null, null])).toBeNull();
  });
  it("matrix labels units by entity", () => {
    const m = headcountMatrix([{ realm_id: "193514877331929", month: "2026-01-01", headcount: 4 }, { realm_id: "123146077561874", month: "2026-01-01", headcount: "1" }]);
    expect(m[0]).toMatchObject({ month: "2026-01", Debt: 4, Parent: 1, firm_total: 4 });
  });
  it("per-hour uses billable hours across all users", () => {
    const months = aggregateHarvestMonths([
      { spent_date: "2026-01-05", hours: 10, billable: true, billable_rate: 100, currency: "USD", user_name: "Scott Williams" },
      { spent_date: "2026-01-06", hours: 30, billable: true, billable_rate: 100, currency: "USD", user_name: "Kris" },
      { spent_date: "2026-01-07", hours: 5, billable: false, billable_rate: null, currency: "USD", user_name: "Kris" },
    ]);
    expect(months["2026-01"].billable_hours).toBe(40);
    expect(perHour(8000, months["2026-01"].billable_hours)).toBe(200);
    expect(perHour(100, 0)).toBeNull();
  });
  it("TTM per head needs 12 months of headcount", () => {
    const hc: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) hc[`2025-${String(m).padStart(2, "0")}`] = 2;
    expect(ttmPerHead("2025-12", { "2025-06": 240000 }, hc).per_head).toBe(120000);
    expect(ttmPerHead("2026-01", {}, hc).per_head).toBeNull();
  });
});
