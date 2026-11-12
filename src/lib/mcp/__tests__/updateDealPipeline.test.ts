import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({
  supabaseForUser: vi.fn(), requireAuth: vi.fn(() => null),
  errorResult: (message: string) => ({ isError: true, message }),
  textResult: (data: unknown) => ({ data }),
  resolveStageInput: vi.fn(), withStageLabels: vi.fn(),
}));
vi.mock("../statusNotes", () => ({ writeDealStatusNote: vi.fn() }));
import tool from "../tools/update-deal";
import { requireAuth, resolveStageInput, supabaseForUser, withStageLabels } from "../supabase";
import { writeDealStatusNote } from "../statusNotes";

const deal_id = "11111111-1111-4111-8111-111111111111";
const pipeline_id = "22222222-2222-4222-8222-222222222222";
const ctx = {} as Parameters<typeof tool.handler>[1];
const rpc = vi.fn();
const from = vi.fn();
const invoke = (input: Record<string, unknown>) => tool.handler(input as Parameters<typeof tool.handler>[0], ctx);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabaseForUser).mockReturnValue({ rpc, from } as unknown as ReturnType<typeof supabaseForUser>);
});
describe("update_deal target pipeline", () => {
  it("requires stage before any write, including notes", async () => {
    expect(await invoke({ deal_id, pipeline_id, notes: "not written" })).toEqual({ isError: true, message: "stage is required when pipeline_id is passed." });
    expect(rpc).not.toHaveBeenCalled();
    expect(writeDealStatusNote).not.toHaveBeenCalled();
  });
  it("passes label to the atomic target-pipeline resolver, not current-pipeline resolution", async () => {
    const updated = { id: deal_id, pipeline_id, pipeline_name: "In Development", stage: "on-hold", stage_label: "Benched" };
    rpc.mockResolvedValue({ data: updated, error: null });
    expect(await invoke({ deal_id, pipeline_id, stage: "Benched", value: 200 })).toEqual({ data: updated });
    expect(rpc).toHaveBeenCalledWith("mcp_update_deal_pipeline", { p_deal_id: deal_id, p_pipeline_id: pipeline_id, p_patch: { stage: "Benched", value: 200 } });
    expect(resolveStageInput).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it.each(["Target pipeline not found or you do not have access", "Stage does not exist in target pipeline", "Deals cannot be moved into or out of the Distressed Debt pipeline"])("rejects %s without writing notes", async (message) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await invoke({ deal_id, pipeline_id, stage: "on-hold", notes: "not written" })).toEqual({ isError: true, message });
    expect(writeDealStatusNote).not.toHaveBeenCalled();
  });
  it("keeps omitted-pipeline stage resolution and direct update unchanged", async () => {
    const current = { pipeline_id: "current" };
    const updated = { id: deal_id, pipeline_id: "current", stage: "resolved-current" };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValueOnce({ data: current }).mockResolvedValueOnce({ data: updated }) };
    from.mockReturnValue(query);
    vi.mocked(resolveStageInput).mockResolvedValue("resolved-current");
    vi.mocked(withStageLabels).mockResolvedValue([{ ...updated, stage_label: "Current label", pipeline_name: "Current" }]);
    await invoke({ deal_id, stage: "Current label" });
    expect(resolveStageInput).toHaveBeenCalledWith(expect.anything(), "current", "Current label");
    expect(query.update).toHaveBeenCalledWith({ stage: "resolved-current" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated callers", async () => {
    vi.mocked(requireAuth).mockReturnValueOnce({ content: [{ type: "text", text: "Not authenticated" }], isError: true });
    expect(await invoke({ deal_id, pipeline_id, stage: "on-hold" })).toHaveProperty("isError", true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates pipeline UUIDs", () => {
    expect(tool.inputSchema.pipeline_id.safeParse("not-a-uuid").success).toBe(false);
    expect(tool.inputSchema.pipeline_id.safeParse(pipeline_id).success).toBe(true);
  });
});