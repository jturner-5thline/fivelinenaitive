import { describe, it, expect } from "vitest";
import { earliestNdaEntries, resolveNdaEnteredAt } from "../referralNdaEntry";

const A = new Set(["active"]);
const pipe = new Map([["d1", "active"]]);

describe("referral date", () => {
  it("uses the NDA / Needs List Sent entry even if a later stage was entered earlier", () => {
    const e = earliestNdaEntries([
      { deal_id: "d1", changed_at: "2026-05-01", pipeline_id: "active", to_stage: "proposal-issued" },
      { deal_id: "d1", changed_at: "2026-06-01", pipeline_id: "active", to_stage: "ndaneeds-list-sent" },
    ], A, pipe);
    expect(e.get("d1")).toBe("2026-06-01");
  });
  it("falls back to the closest later Active stage when NDA was never recorded", () => {
    const e = earliestNdaEntries([
      { deal_id: "d1", changed_at: "2026-04-01", pipeline_id: "active", to_stage: "proposal-issued" },
      { deal_id: "d1", changed_at: "2026-07-01", pipeline_id: "active", to_stage: "pre-credit-needs" },
    ], A, pipe);
    expect(e.get("d1")).toBe("2026-07-01");
  });
  it("never uses the deal created date", () => {
    expect(resolveNdaEnteredAt({ id: "d1" }, new Map(), A)).toBeNull();
  });
});
