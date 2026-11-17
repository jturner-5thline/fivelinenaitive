import { describe, it, expect } from "vitest";
import { computeStageEntryMetric, rollingAnchor, rollingMonthsWindow } from "../dashboardTiles/debtStageEntry";

const ACTIVE = "b78ad452-b489-4c89-8a91-789347c05f79";
const INDEV = "40b17dfb-9122-49e0-bf7c-5aa993d5d615";
const SIGNED = ["final-credit-items", "terms-issued", "in-due-diligence", "funded-invoiced"];
const OPTS = { firstEverInWindow: true, historyPipelineIds: [ACTIVE] };
const row = (deal_id: string, changed_at: string, to_stage: string, company: string, value = 1_000_000, pipeline_id = ACTIVE) => ({
  deal_id, changed_at, to_stage, pipeline_id, deals: { company, value, pipeline_id, stage: to_stage },
});

describe("Debt Deals Signed (shared dashboard + connector calculation)", () => {
  const rows = [
    row("a", "2026-03-10T10:00:00Z", "final-credit-items", "Alpha"),
    row("a", "2026-05-02T10:00:00Z", "Terms Issued", "Alpha"),
    row("b", "2026-05-06T10:00:00Z", "TERMS ISSUED", "Bravo", 2_000_000),
    row("c", "2026-05-20T10:00:00Z", "Final Credit Items", "Test deal"),
    row("d", "2026-05-21T10:00:00Z", "final-credit-items", "Delta", 3_000_000, INDEV),
  ];
  const may = { startDate: "2026-05-01", endDate: "2026-05-31" };

  it("counts only deals whose first-ever signed entry is in the period", () => {
    const r = computeStageEntryMetric(rows, SIGNED, may, [ACTIVE, INDEV], OPTS);
    expect(r.deals.map((d) => d.deal_id)).toEqual(["b"]);
    expect(r.count).toBe(1);
    expect(r.dollarVolume).toBe(2_000_000);
  });

  it("collapses deals sharing a company name, keeping the earliest entry", () => {
    const dup = [...rows, row("e", "2026-05-25T10:00:00Z", "final-credit-items", "bravo ", 9)];
    expect(computeStageEntryMetric(dup, SIGNED, may, [ACTIVE, INDEV], OPTS).count).toBe(1);
  });

  it("gives the same result from a wider fetch window as from the period's own window", () => {
    const opts = { calendarYearDedupe: true, exactStageLabels: ["proposal-issued"] };
    const prop = [row("p", "2026-04-01T00:00:00Z", "proposal-issued", "P"), row("q", "2026-06-01T00:00:00Z", "proposal-issued", "Q")];
    const narrow = computeStageEntryMetric(prop.slice(0, 1), ["proposal-issued"], { startDate: "2026-04-01", endDate: "2026-04-30" }, [ACTIVE], opts);
    const wide = computeStageEntryMetric(prop, ["proposal-issued"], { startDate: "2026-04-01", endDate: "2026-04-30" }, [ACTIVE], opts, { start: "2026-01-01", end: "2026-04-30" });
    expect(wide.count).toBe(narrow.count);
  });

  it("anchors rolling windows at period end capped at the current month", () => {
    expect(rollingAnchor("2026-06-30", new Date("2026-11-17T00:00:00Z"))).toBe("2026-06-30");
    expect(rollingAnchor("2026-12-31", new Date("2026-11-17T00:00:00Z"))).toBe("2026-11-30");
    expect(rollingMonthsWindow("2026-10-31", 6)).toEqual({ startDate: "2026-05-01", endDate: "2026-10-31" });
  });
});
