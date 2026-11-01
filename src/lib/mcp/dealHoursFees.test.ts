import { describe, it, expect } from "vitest";
import { computeDealHoursFees, rollupHoursFees } from "./dealHoursFees";

const base = { total_fee: 0, retainer_fee: 0, milestone_fee: 0, success_fee_percent: 0, pre_signing_hours: 0, post_signing_hours: 0 };

describe("deal hours & fees", () => {
  it("closing fee is total minus retainer and milestone", () => {
    const r = computeDealHoursFees({ ...base, total_fee: 200000, retainer_fee: 25000, milestone_fee: 50000 });
    expect(r.closing_fee).toBe(125000);
  });
  it("closing fee never goes negative", () => {
    expect(computeDealHoursFees({ ...base, total_fee: 10000, retainer_fee: 25000 }).closing_fee).toBe(0);
  });
  it("revenue per hour uses pre + post hours", () => {
    expect(computeDealHoursFees({ ...base, total_fee: 100000, pre_signing_hours: 30, post_signing_hours: 20 }).revenue_per_hour).toBe(2000);
  });
  it("flags deals with no fee information", () => {
    expect(computeDealHoursFees(base).missing_fee_information).toBe(true);
    expect(computeDealHoursFees({ ...base, success_fee_percent: 2 }).missing_fee_information).toBe(false);
  });
  it("rolls up per pipeline", () => {
    const a = computeDealHoursFees({ ...base, total_fee: 100000, retainer_fee: 10000, pre_signing_hours: 50, success_fee_percent: 2 });
    const b = computeDealHoursFees({ ...base, total_fee: 50000, post_signing_hours: 50, success_fee_percent: 4 });
    const r = rollupHoursFees([a, b]);
    expect(r.total_fee).toBe(150000);
    expect(r.closing_fee).toBe(140000);
    expect(r.total_hours).toBe(100);
    expect(r.revenue_per_hour).toBe(1500);
    expect(r.avg_success_fee_percent).toBe(3);
  });
});
