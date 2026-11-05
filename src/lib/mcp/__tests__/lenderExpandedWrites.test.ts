import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (t: unknown) => t }));
vi.mock("../supabase", () => ({
  supabaseForUser: vi.fn(), requireAuth: (ctx: { isAuthenticated: () => boolean }) => ctx.isAuthenticated() ? null : { isError: true },
  textResult: (payload: unknown) => ({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
  errorResult: (error: string) => ({ isError: true, content: [{ type: "text", text: error }] }),
}));
vi.mock("../lenderWrites", () => ({ resolveLenderId: (_sb: unknown, id: string) => ({ id }) }));
import updateLender, { lenderUpdateItem } from "../tools/update-lender";
import { supabaseForUser } from "../supabase";
import { LENDER_FIELD_SCHEMA, LENDER_LONG_TEXT_LIMITS } from "../lenderFields";
import { defineLenderRelatedTool } from "../lenderRelatedWrites";
import deleteLender from "../tools/delete-lender";
import mergeLenders from "../tools/merge-lenders";

const id = "22222222-2222-4222-8222-222222222222";
const ctx = { isAuthenticated: () => true, getUserId: () => id };
type Tool = { handler: (input: Record<string, unknown>, ctx: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }>; inputSchema: Record<string, { parse: (v: unknown) => unknown }> };
const tool = updateLender as unknown as Tool;
const rpc = vi.fn();
beforeEach(() => { rpc.mockReset(); vi.mocked(supabaseForUser).mockReturnValue({ rpc } as unknown as ReturnType<typeof supabaseForUser>); });

describe("expanded lender write contract", () => {
  it("exposes all requested response and external metadata columns", () => {
    for (const key of ["sync_source", "flex_lender_id", "last_synced_from_flex", "external_created_by", "external_last_modified", "resp_emails_sent", "resp_replies_received", "resp_reply_rate", "resp_median_hours_to_reply", "resp_reply_rate_excl_mass", "resp_last_reply_date", "resp_rating", "resp_emails_sent_l12m", "resp_reply_rate_l12m", "resp_window_label", "resp_updated_at"]) expect(LENDER_FIELD_SCHEMA).toHaveProperty(key);
  });
  it("rejects immutable identities instead of dropping them", () => {
    for (const field of ["id", "user_id", "company_id", "created_at", "updated_at"]) expect(lenderUpdateItem.safeParse({ lender_id: id, [field]: id }).success).toBe(false);
  });
  it("preserves each long-text maximum", () => {
    for (const [key, max] of Object.entries(LENDER_LONG_TEXT_LIMITS)) {
      const schema = LENDER_FIELD_SCHEMA[key as keyof typeof LENDER_LONG_TEXT_LIMITS];
      expect(schema.safeParse("x".repeat(max)).success).toBe(true);
      expect(schema.safeParse("x".repeat(max + 1)).success).toBe(false);
    }
  });
  it("limits batches to 25 lenders", () => {
    expect(() => tool.inputSchema.updates.parse(Array.from({ length: 25 }, () => ({ lender_id: id, name: "x" })))).not.toThrow();
    expect(() => tool.inputSchema.updates.parse(Array.from({ length: 26 }, () => ({ lender_id: id, name: "x" })))).toThrow();
  });
  it("uses server-side append and passes dry-run/provenance without client writes", async () => {
    rpc.mockResolvedValue({ data: { dry_run: true, diff: [] } });
    await tool.handler({ lender_id: id, funding_source_notes: "next", mode: "append", dry_run: true, source: "website", change_reason: "review" }, ctx);
    expect(rpc).toHaveBeenCalledWith("mcp_update_lender", expect.objectContaining({ p_patch: { funding_source_notes: "next" }, p_mode: "append", p_dry_run: true, p_source: "website", p_change_reason: "review" }));
  });
  it("returns conflict as an error with the current record", async () => {
    rpc.mockResolvedValue({ data: { error: "concurrency_conflict", lender: { id, name: "current" } } });
    const result = await tool.handler({ lender_id: id, name: "new", expected_updated_at: "2026-11-05T00:00:00Z" }, ctx);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).lender.name).toBe("current");
  });
  it("one failed batch item does not block the next", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "permission denied" } }).mockResolvedValueOnce({ data: { lender: { id } } });
    const result = await tool.handler({ updates: [{ lender_id: id, name: "a" }, { lender_id: id, name: "b" }] }, ctx);
    const results = JSON.parse(result.content[0].text).results;
    expect(results.map((r: { success: boolean }) => r.success)).toEqual([false, true]);
  });
  it("does not access the database for unauthenticated calls", async () => {
    const result = await tool.handler({ lender_id: id, name: "a" }, { isAuthenticated: () => false });
    expect(result.isError).toBe(true); expect(rpc).not.toHaveBeenCalled();
  });
  it("requires explicit true for related deletes, archive and merge", () => {
    for (const t of [defineLenderRelatedTool("lender_pass_patterns", "delete", "delete_pattern"), deleteLender, mergeLenders]) {
      const schema = (t as unknown as Tool).inputSchema.confirm;
      expect(() => schema.parse(false)).toThrow(); expect(() => schema.parse(undefined)).toThrow(); expect(schema.parse(true)).toBe(true);
    }
  });
  it("reports related-record RLS failures, not success", async () => {
    rpc.mockResolvedValue({ error: { message: "row-level policy denied" } });
    const t = defineLenderRelatedTool("lender_pass_patterns", "update", "update_pattern") as unknown as Tool;
    const result = await t.handler({ lender_id: id, record_id: id, pattern_value: "new" }, ctx);
    expect(result.isError).toBe(true); expect(result.content[0].text).toContain("row-level policy denied");
  });
});