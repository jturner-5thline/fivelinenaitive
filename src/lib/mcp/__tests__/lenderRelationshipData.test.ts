import { describe, it, expect } from "vitest";
import { introPathProblems, dealHistoryProblems, pageInfo } from "../lenderRelationshipData";

describe("lender relationship MCP validation", () => {
  it("rejects intro paths without a from value or evidence", () => {
    expect(introPathProblems({ evidence_type: "manual" })).toHaveLength(1);
    expect(introPathProblems({ from_name: "A", evidence_type: "intro_email" })).toEqual(["evidence_ref is required unless evidence_type is manual"]);
    expect(introPathProblems({ from_name: "A", evidence_type: "manual" })).toEqual([]);
  });
  it("rejects outside deals missing source or evidence", () => {
    expect(dealHistoryProblems({ borrower_name: "X" })).toHaveLength(3);
    expect(dealHistoryProblems({ borrower_name: "X", source_type: "news", source_ref: "https://a", evidence_grade: "third_party" })).toEqual([]);
  });
  it("paginates", () => {
    expect(pageInfo(0, 2, 2, 5)).toMatchObject({ next_offset: 2, has_more: true });
    expect(pageInfo(4, 2, 1, 5)).toMatchObject({ next_offset: null, has_more: false });
  });
});
