import { describe, it, expect } from "vitest";
import { textResult } from "../supabase";

describe("textResult structuredContent", () => {
  it("includes the record array alongside metadata", () => {
    const r = textResult({ funding_sources: [{ id: "a" }], total_count: 15 }, { count: 1, has_more: true });
    expect(r.structuredContent).toEqual({ count: 1, has_more: true, funding_sources: [{ id: "a" }], total_count: 15 });
  });
  it("payload keys win over conflicting metadata (describe_schema tables)", () => {
    const r = textResult({ tables: [{ table: "deal_lenders", columns: [{ column_name: "id" }] }] }, { tables: "deal_lenders" });
    expect(Array.isArray((r.structuredContent as any).tables)).toBe(true);
  });
  it("wraps array payloads under data", () => {
    expect(textResult([1, 2], { count: 2 }).structuredContent).toEqual({ count: 2, data: [1, 2] });
  });
});
