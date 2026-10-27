import { describe, it, expect } from "vitest";
import { sourceConversions, topAndBottom, type ConversionDeal } from "../referralConversion";

const d = (referredBy: string, stage: string, entered: string[] = []): ConversionDeal => ({
  id: Math.random().toString(), referredBy, stage, enteredStages: new Set(entered),
});

describe("referral conversion", () => {
  it("measures NDA -> Pre-Credit Needs per source", () => {
    const rows = sourceConversions([
      d("Ann", "pre-credit-needs"), d("Ann", "ndaneeds-list-sent"),
      d("Bob", "ndaneeds-list-sent"), d("Bob", "ndaneeds-list-sent"),
    ], "pre-credit-needs");
    expect(rows.find((r) => r.source === "Ann")?.rate).toBe(0.5);
    expect(rows.find((r) => r.source === "Bob")?.rate).toBe(0);
  });
  it("counts a deal that passed the target earlier but is now on hold", () => {
    const rows = sourceConversions([d("Ann", "on-hold", ["ndaneeds-list-sent", "funded-invoiced"]), d("Ann", "ndaneeds-list-sent")], "funded-invoiced");
    expect(rows[0].converted).toBe(1);
  });
  it("ignores deals that never reached NDA", () => {
    expect(sourceConversions([d("Ann", "on-hold"), d("Ann", "on-hold")], "pre-credit-needs")).toEqual([]);
  });
  it("needs at least 2 NDA deals to be ranked", () => {
    expect(sourceConversions([d("Ann", "pre-credit-needs")], "pre-credit-needs")).toEqual([]);
  });
  it("keeps a source out of both highest and lowest lists", () => {
    const rows = [1, 0.8, 0.5, 0.2].map((rate, i) => ({ source: `S${i}`, total: 5, converted: rate * 5, rate }));
    const { top, bottom } = topAndBottom(rows);
    expect(top.map((r) => r.source)).toEqual(["S0", "S1", "S2"]);
    expect(bottom.map((r) => r.source)).toEqual(["S3"]);
  });
});
