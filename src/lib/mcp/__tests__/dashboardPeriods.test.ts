import { describe, it, expect } from "vitest";
import { resolvePeriod, resolveCustom, zonedTime, salesV2DataYears } from "../dashboardPeriods";

describe("dashboard periods", () => {
  it("resolves a month to its full calendar range", () => {
    expect(resolvePeriod("2026-02")).toEqual({ period: "2026-02", start: "2026-02-01", end: "2026-02-28", months: ["2026-02"] });
  });
  it("resolves a quarter to three months", () => {
    const q = resolvePeriod("2026-Q3");
    expect(q.start).toBe("2026-07-01");
    expect(q.end).toBe("2026-09-30");
    expect(q.months).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
  it("rejects bad periods", () => {
    expect(() => resolvePeriod("2026-13")).toThrow();
    expect(() => resolvePeriod("2026")).toThrow();
    expect(() => resolveCustom("2026-05-02", "2026-05-01")).toThrow();
  });
  it("uses Chicago wall-clock boundaries (CST and CDT)", () => {
    expect(zonedTime("2026-01-01", "00:00:00", "America/Chicago").toISOString()).toBe("2026-01-01T06:00:00.000Z");
    expect(zonedTime("2026-07-31", "23:59:59", "America/Chicago").toISOString()).toBe("2026-08-01T04:59:59.000Z");
  });
  it("fetches the prior year for January single-month views, like the Sales Dashboard", () => {
    expect(salesV2DataYears(resolvePeriod("2026-01"))).toEqual([2025, 2026]);
    expect(salesV2DataYears(resolvePeriod("2026-07"))).toEqual([2026]);
    expect(salesV2DataYears(resolvePeriod("2026-Q1"))).toEqual([2026]);
  });
});
