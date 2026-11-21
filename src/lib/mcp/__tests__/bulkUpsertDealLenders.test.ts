import { describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (t: unknown) => t }));
vi.mock("../supabase", () => ({ supabaseForUser: vi.fn(), requireAuth: () => null, errorResult: vi.fn(), textResult: vi.fn() }));
import tool, { summarize } from "../tools/bulk-upsert-deal-lenders";
import delTool from "../tools/delete-deal-lender";

const id = "3a9bb926-f60a-4bf1-8aeb-62a3fadd3c25";
const row = { deal_id: id, lender_id: id };
describe("bulk_upsert_deal_lenders", () => {
  it("accepts 500 rows and rejects 501", () => {
    expect(tool.inputSchema.rows.safeParse(Array(500).fill(row)).success).toBe(true);
    expect(tool.inputSchema.rows.safeParse(Array(501).fill(row)).success).toBe(false);
  });
  it("defaults to a dry run", () => expect(tool.inputSchema.dry_run.parse(undefined)).toBe(true));
  it("counts would-insert, would-update, skipped and errors", () => {
    expect(summarize([{ outcome: "would_insert" }, { outcome: "would_update" }, { outcome: "skipped_same" }, { outcome: "skipped_existing" }, { outcome: "error" }]))
      .toEqual({ total: 5, inserted: 0, updated: 0, would_insert: 1, would_update: 1, skipped: 2, errors: 1 });
  });
});
describe("delete_deal_lender", () => {
  it("requires confirm: true", () => {
    expect(delTool.inputSchema.confirm.safeParse(false).success).toBe(false);
    expect(delTool.inputSchema.confirm.safeParse(true).success).toBe(true);
  });
});
