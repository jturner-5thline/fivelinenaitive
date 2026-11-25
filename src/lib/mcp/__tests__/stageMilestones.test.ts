import { describe, it, expect } from "vitest";
import { stageMilestoneDefs, mergeStageMilestones } from "../stageMilestones";

describe("stage milestone helpers", () => {
  it("resolves defs for a renamed stage via its label", () => {
    const defs = stageMilestoneDefs("s1", [{ id: "s1", label: "Qualification Call" }]);
    expect(defs.map((d) => d.key)).toEqual(["demo-access-granted", "disqualified", "no-show"]);
  });
  it("returns no defs for stages without milestones", () => {
    expect(stageMilestoneDefs("closed-lost", [])).toEqual([]);
  });
  it("shows defined milestones without a row as not completed", () => {
    const defs = stageMilestoneDefs("qual-call", []);
    const merged = mergeStageMilestones("qual-call", defs, [
      { id: "r1", stage: "qual-call", milestone_key: "no-show", completed: true, completed_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(merged.find((m) => m.milestone_key === "demo-access-granted")).toMatchObject({ completed: false, has_row: false, completed_at: null });
    expect(merged.find((m) => m.milestone_key === "no-show")).toMatchObject({ completed: true, has_row: true, label: "No-Show" });
  });
});
