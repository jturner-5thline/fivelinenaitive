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
