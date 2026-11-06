import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({
  supabaseForUser: vi.fn(),
  requireAuth: (ctx: { isAuthenticated: () => boolean }) => ctx.isAuthenticated() ? null : { isError: true },
  textResult: (payload: unknown) => ({ content: [{ text: JSON.stringify(payload) }] }),
  errorResult: (message: string) => ({ isError: true, content: [{ text: message }] }),
}));
import updateMatch from "../tools/update-claap-meeting-match";
import listMeetings from "../tools/list-lender-claap-meetings";
import { LENDER_FIELD_SCHEMA, CRITERIA_CONFIDENCE_MEANINGS, validateLenderPatch } from "../lenderFields";
import { supabaseForUser } from "../supabase";

type Tool = { handler: (input: Record<string, unknown>, ctx: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }>; inputSchema: Record<string, { parse: (value: unknown) => unknown }> };
const update = updateMatch as unknown as Tool;
const list = listMeetings as unknown as Tool;
const id = "22222222-2222-4222-8222-222222222222";
const ctx = { isAuthenticated: () => true, getUserId: () => id };
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReset();
  vi.mocked(supabaseForUser).mockReturnValue({ rpc } as unknown as ReturnType<typeof supabaseForUser>);
});

describe("criteria confidence", () => {
  for (const value of ["imported", "verified_call", "verified_email", "verified_attachment", null]) {
    it(`accepts ${value} at both validation boundaries`, async () => {
      expect(LENDER_FIELD_SCHEMA.criteria_confidence.parse(value)).toBe(value);
      expect(await validateLenderPatch(supabaseForUser(ctx as never), { criteria_confidence: value })).toBeNull();
    });
  }
  it("rejects unknown values and enumerates all allowed values", async () => {
    expect(LENDER_FIELD_SCHEMA.criteria_confidence.safeParse("verified").success).toBe(false);
    const error = await validateLenderPatch(supabaseForUser(ctx as never), { criteria_confidence: "verified" });
    for (const value of ["imported", "verified_call", "verified_email", "verified_attachment"]) {
      expect(error).toContain(value);
      expect(CRITERIA_CONFIDENCE_MEANINGS).toHaveProperty(value);
    }
  });
});

describe("Claap MCP refresh", () => {
  it("passes only match fields to an atomic caller-scoped RPC", async () => {
    rpc.mockResolvedValue({ data: { meeting: { id } } });
    await update.handler({ meeting_id: id, matched_lender_id: id, match_status: "matched", reason: "Lender confirmed", status: "routed" }, ctx);
    expect(rpc).toHaveBeenCalledWith("mcp_update_claap_meeting_match", {
      p_meeting_id: id, p_matched_lender_id: id, p_match_status: "matched", p_reason: "Lender confirmed", p_status: "routed",
    });
  });
  it("clears with null and preserves status when omitted", async () => {
    rpc.mockResolvedValue({ data: { meeting: { id, matched_lender_id: null } } });
    await update.handler({ meeting_id: id, matched_lender_id: null, match_status: "unmatched" }, ctx);
    expect(rpc).toHaveBeenCalledWith("mcp_update_claap_meeting_match", expect.objectContaining({ p_matched_lender_id: null, p_status: null }));
  });
  it("returns permission/audit failures instead of success", async () => {
    rpc.mockResolvedValue({ error: { message: "Caller lacks permission" } });
    const result = await update.handler({ meeting_id: id, matched_lender_id: id, match_status: "matched" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Caller lacks permission");
  });
  it("rejects unrecognized matching and queue statuses", () => {
    expect(() => update.inputSchema.match_status.parse("manually_linked")).toThrow();
    expect(() => update.inputSchema.status.parse("done")).toThrow();
    expect(() => update.inputSchema.matched_lender_id.parse(undefined)).toThrow();
  });
  it("defaults to no transcript and bounded pagination", async () => {
    rpc.mockResolvedValue({ data: { meetings: [], has_more: false } });
    await list.handler({}, ctx);
    expect(rpc).toHaveBeenCalledWith("mcp_list_lender_claap_meetings", {
      p_lender_ids: null, p_updated_after: null, p_match_statuses: null, p_include_transcript: false, p_limit: 50, p_offset: 0,
    });
    expect(() => list.inputSchema.limit.parse(201)).toThrow();
    expect(() => list.inputSchema.offset.parse(-1)).toThrow();
  });
  it("passes refresh filters and explicit transcript opt-in", async () => {
    rpc.mockResolvedValue({ data: { meetings: [{ id, transcript: "content" }] } });
    await list.handler({ lender_ids: [id], updated_after: "2026-11-01T00:00:00Z", match_statuses: ["matched"], include_transcript: true, limit: 10, offset: 20 }, ctx);
    expect(rpc).toHaveBeenCalledWith("mcp_list_lender_claap_meetings", expect.objectContaining({ p_lender_ids: [id], p_updated_after: "2026-11-01T00:00:00Z", p_match_statuses: ["matched"], p_include_transcript: true, p_limit: 10, p_offset: 20 }));
  });
  it("propagates read errors", async () => {
    rpc.mockResolvedValue({ error: { message: "permission denied" } });
    expect((await list.handler({}, ctx)).isError).toBe(true);
  });
  it("refuses both tools before database access when signed out", async () => {
    for (const tool of [update, list]) expect((await tool.handler({}, { isAuthenticated: () => false })).isError).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(supabaseForUser).not.toHaveBeenCalled();
  });
});