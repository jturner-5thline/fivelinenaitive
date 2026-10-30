import { describe, it, expect } from "vitest";
import { ttmAnchorFromTimeframeEnd, ttmWindow } from "@/lib/salesBdActivePipelineConversion";
import { inTrailingYear } from "@/lib/referralConversion";

const now = new Date("2026-10-30T12:00:00");
describe("rolling TTM anchored to header timeframe", () => {
  it("Q3 2026 → Oct 1 2025 through Sep 30 2026", () => {
    const a = ttmAnchorFromTimeframeEnd("2026-09-30", now);
    const { since } = ttmWindow(a);
    expect(a.getFullYear()).toBe(2026); expect(a.getMonth()).toBe(8); expect(a.getDate()).toBe(30);
    expect(since.getFullYear()).toBe(2025); expect(since.getMonth()).toBe(8); expect(since.getDate()).toBe(30);
    const deals = [{ ndaEnteredAt: "2025-10-01T10:00:00" }, { ndaEnteredAt: "2026-10-05T10:00:00" }, { ndaEnteredAt: "2025-09-15T10:00:00" }];
    expect(inTrailingYear(deals, a)).toHaveLength(1);
  });
  it("Q2 2026 anchors to Jun 30 2026", () => {
    const a = ttmAnchorFromTimeframeEnd("2026-06-30", now);
    expect(a.getMonth()).toBe(5); expect(a.getDate()).toBe(30);
  });
  it("in-progress period caps at today", () => {
    expect(ttmAnchorFromTimeframeEnd("2026-12-31", now).getTime()).toBe(now.getTime());
    expect(ttmAnchorFromTimeframeEnd(undefined, now).getTime()).toBe(now.getTime());
  });
});
