import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { trimmedMean, projectionDays, milestoneCompletedByStage, nextDueDate, MILESTONE_RULES } from "./milestoneProjection";

describe("trimmedMean (10%)", () => {
  it("drops one value from each end with 10 samples", () => {
    expect(trimmedMean([1, 10, 10, 10, 10, 10, 10, 10, 10, 1000])).toBe(10);
  });
  it("trims nothing below 10 samples", () => {
    expect(trimmedMean([10, 20, 30])).toBe(20);
  });
  it("returns null with no values", () => {
    expect(trimmedMean([])).toBeNull();
  });
});

describe("projectionDays", () => {
  it.each([["final-credit-items", 20], ["terms-issued", 58], ["in-due-diligence", 120]])(
    "falls back for %s with fewer than 3 samples", (stage, days) => {
      expect(projectionDays(stage, [5, 6])).toBe(days);
    });
  it("uses rounded trimmed mean with 3+ samples", () => {
    expect(projectionDays("terms-issued", [30, 31, 33])).toBe(31);
  });
  it("ignores unmapped stages", () => {
    expect(projectionDays("proposal-issued", [1, 2, 3])).toBeNull();
  });
});

describe("stage completion mapping", () => {
  it("maps stages to milestones", () => {
    expect(milestoneCompletedByStage("final-credit-items")).toBe("Client Signed");
    expect(milestoneCompletedByStage("terms-issued")).toBe("First Term Sheets");
    expect(milestoneCompletedByStage("in-due-diligence")).toBe("Term Sheet Signed");
    expect(milestoneCompletedByStage("lenders-in-review")).toBeNull();
  });
});

describe("nextDueDate", () => {
  it("keeps a manual date", () => {
    expect(nextDueDate({ due_date: "2026-01-01", completed: false }, "2026-05-01")).toBe("2026-01-01");
  });
  it("does not date completed milestones", () => {
    expect(nextDueDate({ due_date: null, completed: true }, "2026-05-01")).toBeNull();
  });
  it("fills empty open milestones and new ones", () => {
    expect(nextDueDate({ due_date: null, completed: false }, "2026-05-01")).toBe("2026-05-01");
    expect(nextDueDate(null, "2026-05-01")).toBe("2026-05-01");
  });
});

describe("parity with database trigger SQL", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../../drizzle/migrations/0073_migration.sql"), "utf8");
  it("uses the same fallbacks, trim, window and mappings", () => {
    for (const r of MILESTONE_RULES) {
      expect(sql).toContain(`WHEN '${r.stage}' THEN ${r.fallbackDays}`);
      expect(sql).toContain(`('${r.title}','${r.stage}')`);
      expect(sql).toContain(`WHEN '${r.stage}' THEN '${r.title}'`);
    }
    expect(sql).toContain("fn_trimmed_mean(v_vals, 0.10)");
    expect(sql).toContain("interval '24 months'");
    expect(sql).toContain("< 3 THEN RETURN v_fallback");
  });
});
