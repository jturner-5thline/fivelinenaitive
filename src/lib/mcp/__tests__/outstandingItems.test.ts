import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({
  supabaseForUser: vi.fn(), requireAuth: (ctx: { isAuthenticated: () => boolean }) => ctx.isAuthenticated() ? null : { isError: true },
  textResult: (data: unknown) => ({ content: [{ text: JSON.stringify(data) }] }),
  errorResult: (text: string) => ({ isError: true, content: [{ text }] }),
}));
import createTool from "../tools/create-outstanding-item";
import updateTool from "../tools/update-outstanding-item";
import listTool from "../tools/list-outstanding-items";
import batchTool from "../tools/batch-create-outstanding-items";
import { supabaseForUser } from "../supabase";
import { outstandingCreateFields, outstandingUpdateFields } from "../outstandingItemFields";
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { isAuthenticated: () => true };
const rpc = vi.fn();
type Tool = { handler: (args: Record<string, unknown>, ctx: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }> };
const create = createTool as unknown as Tool, update = updateTool as unknown as Tool, list = listTool as unknown as Tool, batch = batchTool as unknown as Tool;
beforeEach(() => { vi.clearAllMocks(); rpc.mockReset(); vi.mocked(supabaseForUser).mockReturnValue({ rpc } as unknown as ReturnType<typeof supabaseForUser>); });
describe("Open Items input rules", () => {
  it("defaults exactly to Requested and normal", () => { expect(z.object(outstandingCreateFields).parse({ description: "Need statements" })).toEqual({ description: "Need statements", status: "requested", priority: "normal" }); });
  for (const status of ["requested", "received", "submitted"]) it(`accepts UI state ${status}`, () => { expect(outstandingCreateFields.status.parse(status)).toBe(status); });
  for (const priority of ["normal", "high", "urgent"]) it(`accepts priority ${priority}`, () => { expect(outstandingCreateFields.priority.parse(priority)).toBe(priority); });
  it("rejects invented status and task-only priorities", () => { expect(() => outstandingCreateFields.status.parse("done")).toThrow(); expect(() => outstandingCreateFields.priority.parse("medium")).toThrow(); });
  it("enforces description and note limits", () => { expect(() => outstandingCreateFields.description.parse("x".repeat(2001))).toThrow(); expect(() => outstandingCreateFields.notes.parse("x".repeat(10001))).toThrow(); });
  it("validates actual calendar dates and nullable clears", () => { expect(() => outstandingCreateFields.eta.parse("2026-02-30")).toThrow(); expect(outstandingUpdateFields.eta.parse(null)).toBeNull(); });
  it("accepts opaque assignments and metadata", () => { expect(outstandingCreateFields.assigned_to.parse("Analyst")).toBe("Analyst"); expect(outstandingCreateFields.source_metadata.parse({ source: "agent", unknown: { a: true } })).toEqual({ source: "agent", unknown: { a: true } }); });
  it("rejects unknown input fields and batches over 25", () => { expect(() => z.object(outstandingCreateFields).strict().parse({ description: "item", user_id: id })).toThrow(); expect(() => batchTool.inputSchema.items.parse(Array.from({ length: 26 }, () => ({ description: "item" })))).toThrow(); });
  it("bounds lists at 500 and defaults open_only false", () => { expect(listTool.inputSchema.open_only.parse(undefined)).toBe(false); expect(listTool.inputSchema.limit.parse(undefined)).toBe(100); expect(() => listTool.inputSchema.limit.parse(501)).toThrow(); });
});
describe("caller-scoped Open Items tools", () => {
  it("sends creation and metadata to the atomic RPC", async () => { rpc.mockResolvedValue({ data: { item: { id }, created: true } }); const payload = { description: "Item", lender_id: id, idempotency_key: "recording" }; await create.handler({ deal_id: id, ...payload }, ctx); expect(rpc).toHaveBeenCalledWith("mcp_write_outstanding_item", { p_action: "create", p_deal_id: id, p_id: null, p_payload: payload }); });
  it("returns existing rows without pretending they were created", async () => { rpc.mockResolvedValue({ data: { item: { id }, created: false } }); expect(JSON.parse((await create.handler({ deal_id: id, description: "Item" }, ctx)).content[0].text).created).toBe(false); });
  it("preserves omission, null clears, append and archive fields", async () => { rpc.mockResolvedValue({ data: { item: { id } } }); const payload = { eta: null, append_note: "Asked lender", is_archived: true, source_metadata_merge: { email_thread_id: "thread" } }; await update.handler({ id, ...payload }, ctx); expect(rpc).toHaveBeenCalledWith("mcp_write_outstanding_item", { p_action: "update", p_deal_id: null, p_id: id, p_payload: payload }); });
  it("rejects conflicting notes and empty updates before writes", async () => { expect((await update.handler({ id, notes: "replace", append_note: "append" }, ctx)).isError).toBe(true); expect((await update.handler({ id }, ctx)).isError).toBe(true); expect(rpc).not.toHaveBeenCalled(); });
  it("passes open-only and pagination filters", async () => { rpc.mockResolvedValue({ data: { items: [], total_count: 0, has_more: false } }); const args = { deal_id: id, open_only: true, offset: 100, limit: 100 }; await list.handler(args, ctx); expect(rpc).toHaveBeenCalledWith("mcp_list_outstanding_items", { p_deal_id: id, p_filters: args }); });
  it("returns per-item errors without blocking a batch", async () => { rpc.mockResolvedValueOnce({ data: { item: { id }, created: true } }).mockResolvedValueOnce({ error: { message: "Not attached" } }).mockResolvedValueOnce({ data: { item: { id }, created: false } }); const result = await batch.handler({ deal_id: id, items: [{ description: "one" }, { description: "two" }, { description: "three" }] }, ctx); expect(JSON.parse(result.content[0].text).results.map((r: { outcome: string }) => r.outcome)).toEqual(["created", "error", "existing"]); });
  it("reports RLS failures", async () => { rpc.mockResolvedValue({ error: { message: "Deal not found or inaccessible" } }); expect((await create.handler({ deal_id: id, description: "Item" }, ctx)).isError).toBe(true); });
  it("refuses every tool when signed out", async () => { for (const tool of [create, update, list, batch]) expect((await tool.handler({}, { isAuthenticated: () => false })).isError).toBe(true); expect(supabaseForUser).not.toHaveBeenCalled(); });
});
