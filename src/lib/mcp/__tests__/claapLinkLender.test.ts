import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({
  supabaseForUser: vi.fn(),
  requireAuth: (ctx: { isAuthenticated: () => boolean }) => (ctx.isAuthenticated() ? null : { isError: true, content: [{ text: "auth" }] }),
  textResult: (payload: unknown) => ({ content: [{ text: JSON.stringify(payload) }] }),
  errorResult: (message: string) => ({ isError: true, content: [{ text: message }] }),
}));
import linkTool from "../tools/link-claap-meeting-to-lender";
import { supabaseForUser } from "../supabase";

type Res = { isError?: boolean; content: { text: string }[] };
const tool = linkTool as unknown as { handler: (i: Record<string, unknown>, c: unknown) => Promise<Res> };
const MEETING = "397fa224-3db0-431e-8255-0a98c8bcafad";
const LENDER = "1a1c71df-c245-4bcc-91d6-b59835fa8d8a";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const REC = "44444444-4444-4444-8444-444444444444";
const WS = "44556c46-9127-4b12-b14e-d6fee784afcf";
const ctx = { isAuthenticated: () => true };

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "limit", "update"]) c[k] = vi.fn(() => c);
  c.maybeSingle = vi.fn(async () => result);
  c.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
  return c;
}
let rpc: ReturnType<typeof vi.fn>;
let tables: Record<string, unknown[]>;
beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ data: { ok: true } });
  tables = {};
  const from = vi.fn((t: string) => chain((tables[t] ?? []).shift() ?? { data: null }));
  (supabaseForUser as ReturnType<typeof vi.fn>).mockReturnValue({ rpc, from });
});

describe("link_claap_meeting_to_lender", () => {
  it("refuses signed-out callers before any database access", async () => {
    expect((await tool.handler({ meeting_id: MEETING, lender_id: LENDER }, { isAuthenticated: () => false })).isError).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires exactly one of meeting_id or recording_id", async () => {
    expect((await tool.handler({ lender_id: LENDER }, ctx)).isError).toBe(true);
    expect((await tool.handler({ meeting_id: MEETING, recording_id: REC, lender_id: LENDER }, ctx)).isError).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("confirms the match through the caller-scoped RPC", async () => {
    const res = await tool.handler({ meeting_id: MEETING, lender_id: LENDER }, ctx);
    expect(res.isError).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("mcp_update_claap_meeting_match", {
      p_meeting_id: MEETING, p_matched_lender_id: LENDER, p_match_status: "matched", p_reason: "Manually linked via connector", p_status: null,
    });
  });
  it("returns the permission error instead of success", async () => {
    rpc.mockResolvedValue({ error: { message: "Meeting not found or caller lacks company/update permission" } });
    const res = await tool.handler({ meeting_id: MEETING, lender_id: LENDER }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("lacks company/update permission");
  });
  it("resolves a recording id to its meeting", async () => {
    tables.claap_recordings = [{ data: { id: REC, external_id: "yzUDgtCTr8vy" } }];
    tables.claap_meetings = [{ data: { id: MEETING } }];
    await tool.handler({ recording_id: REC, lender_id: LENDER }, ctx);
    expect(rpc).toHaveBeenCalledWith("mcp_update_claap_meeting_match", expect.objectContaining({ p_meeting_id: MEETING }));
  });
  it("errors when the recording has no meeting yet", async () => {
    tables.claap_recordings = [{ data: { id: REC, external_id: "x" } }];
    tables.claap_meetings = [{ data: null }];
    expect((await tool.handler({ recording_id: REC, lender_id: LENDER }, ctx)).isError).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses to set a contact from another workspace", async () => {
    tables.claap_meetings = [{ data: { company_id: WS } }];
    tables.contacts = [{ data: { id: CONTACT, org_company_id: "99999999-9999-4999-8999-999999999999" } }];
    const res = await tool.handler({ meeting_id: MEETING, lender_id: LENDER, contact_id: CONTACT }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("not in the meeting's workspace");
  });
  it("sets a same-workspace contact", async () => {
    tables.claap_meetings = [{ data: { company_id: WS } }, { data: [{ id: MEETING }] }];
    tables.contacts = [{ data: { id: CONTACT, org_company_id: WS } }];
    const res = await tool.handler({ meeting_id: MEETING, lender_id: LENDER, contact_id: CONTACT }, ctx);
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text).contact.id).toBe(CONTACT);
  });
});
