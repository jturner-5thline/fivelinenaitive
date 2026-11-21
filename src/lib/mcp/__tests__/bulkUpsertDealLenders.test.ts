import { describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (t: unknown) => t }));
vi.mock("../supabase", () => ({ supabaseForUser: vi.fn(), requireAuth: () => null, errorResult: vi.fn(), textResult: vi.fn() }));
import tool, { summarize } from "../tools/bulk-upsert-deal-lenders";
import delTool from "../tools/delete-deal-lender";
import { supabaseForUser, textResult } from '../supabase';

const id = "3a9bb926-f60a-4bf1-8aeb-62a3fadd3c25";
const row = { deal_id: id, lender_id: id };
describe("bulk_upsert_deal_lenders", () => {
  it("accepts 500 rows and rejects 501", () => {
    expect(tool.inputSchema.rows.safeParse(Array(500).fill(row)).success).toBe(true);
    expect(tool.inputSchema.rows.safeParse(Array(501).fill(row)).success).toBe(false);
  });
  it("defaults to a dry run", () => expect(tool.inputSchema.dry_run.parse(undefined)).toBe(true));
  it("preserves all eight explicit timestamp fields including null clears", () => {
    const timestamps = { submitted_at: '2026-10-15T12:00:00Z', approved_at: null, passed_at: null, declined_at: null, excluded_at: null, on_hold_at: null, on_deck_at: '2026-10-01T12:00:00-05:00', last_status_change_at: null };
    expect(tool.inputSchema.rows.parse([{ ...row, stage: 'active', timestamps }])[0].timestamps).toEqual(timestamps);
  });
  it("rejects malformed and unauthorized timestamp fields", () => {
    expect(tool.inputSchema.rows.safeParse([{ ...row, timestamps: { submitted_at: 'yesterday' } }]).success).toBe(false);
    expect(tool.inputSchema.rows.safeParse([{ ...row, timestamps: { created_at: null } }]).success).toBe(false);
  });
  it("counts timestamp-only updates as updated", () => {
    expect(summarize([{ outcome: 'updated' }, { outcome: 'would_update' }])).toMatchObject({ updated: 1, would_update: 1, skipped: 0 });
  });
  it("forwards timestamp-only rows and returns updated in the actual tool summary", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ index: 1, deal_id: id, lender_id: id, outcome: 'updated', stage: 'active' }], error: null });
    vi.mocked(supabaseForUser).mockReturnValue({ rpc } as unknown as ReturnType<typeof supabaseForUser>);
    vi.mocked(textResult).mockClear();
    const rows = tool.inputSchema.rows.parse([{ ...row, stage: 'active', timestamps: { submitted_at: '2026-10-15T12:00:00Z', approved_at: null } }]);
    await tool.handler({ rows, mode: 'upsert', dry_run: false, response_mode: 'summary' }, {} as Parameters<typeof tool.handler>[1]);
    expect(rpc).toHaveBeenCalledWith('mcp_bulk_upsert_deal_lenders', { p_rows: rows, p_mode: 'upsert', p_dry_run: false, p_source: 'mcp' });
    expect(textResult).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.objectContaining({ updated: 1, skipped: 0 }) }), expect.anything());
  });
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
