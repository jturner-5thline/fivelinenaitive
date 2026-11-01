import { describe, it, expect } from "vitest";
import { bucketSalesCallsByWeek, weekStartUtc } from "./salesCallsWeekly";

describe("sales calls weekly bucketing", () => {
  it("weeks start on Monday UTC", () => {
    expect(weekStartUtc(new Date("2026-11-01T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-26");
    expect(weekStartUtc(new Date("2026-10-26T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("counts calls per week and keeps empty weeks", () => {
    const rows = bucketSalesCallsByWeek(
      [
        { start: "2026-10-20T15:00:00Z", company: "A" },
        { start: "2026-10-27T15:00:00Z", company: "B" },
        { start: "2026-10-29T15:00:00Z", company: "C" },
        { start: null },
      ],
      new Date("2026-10-12T00:00:00Z"),
      new Date("2026-11-01T23:59:59Z"),
    );
    expect(rows.map((r) => [r.week_start, r.count])).toEqual([
      ["2026-10-12", 0],
      ["2026-10-19", 1],
      ["2026-10-26", 2],
    ]);
  });
});
