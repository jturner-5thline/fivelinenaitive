import { describe, it, expect, vi } from "vitest";
const rpc = vi.fn();
vi.mock("../supabase", async (orig) => ({ ...(await orig<object>()), supabaseForUser: () => ({ rpc }), requireAuth: () => null }));
import tool from "../tools/update-claap-meeting-deal";
const M = "6f2e8303-e1d8-4b71-9edf-8e7f606f0e99";
const call = (input: unknown) => (tool as unknown as { handler: (i: unknown, c: unknown) => Promise<{ isError?: boolean }> }).handler(input, {});
describe("update_claap_meeting_deal", () => {
  it("passes null to clear the deal link", async () => {
    rpc.mockResolvedValueOnce({ data: { deal_id: null }, error: null });
    await call({ meeting_id: M, deal_id: null });
    expect(rpc).toHaveBeenCalledWith("mcp_update_claap_meeting_deal", { p_meeting_id: M, p_deal_id: null, p_reason: null });
  });
  it("surfaces permission errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Deal not found in the meeting workspace" } });
    const r = await call({ meeting_id: M, deal_id: M });
    expect(r.isError).toBe(true);
  });
});
describe("whole-word deal matching", () => {
  const hit = (title: string, name: string) => ` ${title} `.includes(` ${name} `);
  it("does not match Otto inside Elliotto", () => expect(hit("scott elliotto james turner connect", "otto")).toBe(false));
  it("matches Otto as a word", () => expect(hit("otto kickoff call", "otto")).toBe(true));
});
