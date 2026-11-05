import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), authenticated: true }));
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({
  supabaseForUser: () => ({ from: mocks.from }),
  requireAuth: () => mocks.authenticated ? null : { isError: true, content: [] },
  errorResult: (message: string) => ({ isError: true, content: [{ text: message }] }),
  textResult: (payload: unknown, structuredContent: unknown) => ({ payload, structuredContent }),
}));
import tool from "../tools/add-lender-to-deal";

const dealId = "54144cb1-f89f-423b-9a47-847542439d01";
const saas = "3a9bb926-f60a-4bf1-8aeb-62a3fadd3c25";
const revtek = "4ffa349f-f593-4510-9a68-3d580c384a6f";
const lago = "4765ba06-44b9-4403-aad6-f40e27eea8ec";
const ctx = { getUserId: () => "caller", getUserEmail: () => "caller@example.invalid" };
type Response = { data?: Record<string, unknown> | null; error?: { code?: string; message: string } | null };
const calls: { table: string; payload?: unknown; filters: Record<string, unknown> }[] = [];
let responses: Response[];

beforeEach(() => {
  mocks.authenticated = true;
  calls.length = 0;
  responses = [];
  mocks.from.mockReset().mockImplementation((table: string) => {
    const call: typeof calls[number] = { table, filters: {} };
    calls.push(call);
    const response = responses.shift() ?? { data: null, error: null };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { call.filters[key] = value; return builder; },
      insert: (payload: unknown) => { call.payload = payload; return builder; },
      single: async () => response,
      maybeSingle: async () => response,
      then: (resolve: (value: Response) => unknown) => Promise.resolve(response).then(resolve),
    };
    return builder;
  });
});

async function run(input: Record<string, unknown>) {
  const parsed = Object.fromEntries(Object.entries(tool.inputSchema).map(([key, schema]) => [key, schema.parse(input[key])]));
  // SDK/context are isolated here; the production handler itself is exercised.
  return tool.handler(parsed as Parameters<typeof tool.handler>[0], ctx as Parameters<typeof tool.handler>[1]);
}
const parent = { data: { id: dealId, company_id: "tenant" } };
const absent = { data: null };
const lender = { data: { id: saas, name: "SaaS Capital" } };
const added = { data: { id: "new-link", master_lender_id: saas, stage: "on-deck", tracking_status: "active" } };

describe("add_lender_to_deal", () => {
  it("uses real UI fields, on-deck/active and both timestamps, never the nonexistent columns", async () => {
    responses = [parent, absent, lender, added, {}, {}];
    const result = await run({ deal_id: dealId, lender_id: saas });
    const payload = calls.find(call => call.table === "deal_lenders" && call.payload)?.payload;
    expect(payload).toEqual({ deal_id: dealId, name: "SaaS Capital", master_lender_id: saas, stage: "on-deck", tracking_status: "active", on_deck_at: expect.any(String), last_status_change_at: expect.any(String) });
    expect(result).toMatchObject({ structuredContent: { deal_lender_id: "new-link", results: [{ outcome: "added" }] } });
    expect(calls.find(call => call.table === "master_lenders")?.filters).toEqual({ id: saas, company_id: "tenant" });
  });
  it("honors explicit stage and tracking status", async () => {
    responses = [parent, absent, lender, added, {}, {}];
    await run({ deal_id: dealId, lender_id: saas, stage: "custom-stage", status: "on-hold" });
    const payload = calls.find(call => call.table === "deal_lenders" && call.payload)?.payload;
    expect(payload).toMatchObject({ stage: "custom-stage", tracking_status: "on-hold" });
    expect(payload).not.toHaveProperty("on_deck_at");
  });
  it("returns existing rows unchanged without inserts or activity", async () => {
    const existing = { id: "lago-link", stage: "passed", notes: "preserve", on_deck_at: "old" };
    responses = [parent, { data: existing }];
    const result = await run({ deal_id: dealId, lender_id: lago });
    expect(result).toMatchObject({ structuredContent: { results: [{ outcome: "already_on_deal", deal_lender: existing }] } });
    expect(calls.some(call => call.payload)).toBe(false);
  });
  it("handles a concurrent unique-pair insert as already on deal without an upsert", async () => {
    responses = [parent, absent, lender, { error: { code: "23505", message: "duplicate" } }, added];
    expect(await run({ deal_id: dealId, lender_id: saas })).toMatchObject({ structuredContent: { results: [{ outcome: "already_on_deal" }] } });
    expect(calls.filter(call => call.table === "deal_lenders" && call.payload)).toHaveLength(1);
    expect(calls.some(call => call.table === "deal_activity")).toBe(false);
  });
  it("adds the requested Odie shortlist and reports LAGO as existing independently", async () => {
    responses = [parent, absent, lender, added, {}, {}, absent, { data: { id: revtek, name: "Revtek" } }, { data: { id: "revtek-link" } }, {}, {}, { data: { id: "lago-link" } }];
    expect(await run({ deal_id: dealId, lender_ids: [saas, revtek, lago] })).toMatchObject({ structuredContent: { results: [{ lender_id: saas, outcome: "added" }, { lender_id: revtek, outcome: "added" }, { lender_id: lago, outcome: "already_on_deal" }] } });
    expect(calls.filter(call => call.table === "deal_activity" && call.payload)).toHaveLength(2);
    expect(calls.filter(call => call.table === "activity_logs" && call.payload)).toHaveLength(2);
  });
  it("continues after an inaccessible lender and logs successful additions only", async () => {
    responses = [parent, absent, absent, absent, lender, added, {}, {}];
    expect(await run({ deal_id: dealId, lender_ids: [revtek, saas] })).toMatchObject({ structuredContent: { results: [{ outcome: "error", reason: expect.stringContaining("inaccessible") }, { outcome: "added" }] } });
    expect(calls.filter(call => call.table === "deal_activity")).toHaveLength(1);
  });
  it("reports audit failures as warnings without misreporting a successful add", async () => {
    responses = [parent, absent, lender, added, { error: { message: "audit denied" } }, {}];
    expect(await run({ deal_id: dealId, lender_id: saas })).toMatchObject({ structuredContent: { results: [{ outcome: "added", warnings: ["activity_logs logging failed: audit denied"] }] } });
  });
  it("blocks unauthenticated callers before database access", async () => {
    mocks.authenticated = false;
    expect(await run({ deal_id: dealId, lender_id: saas })).toMatchObject({ isError: true });
    expect(calls).toHaveLength(0);
  });
  it("blocks invisible deals before lender reads or writes", async () => {
    responses = [absent];
    expect(await run({ deal_id: dealId, lender_id: saas })).toMatchObject({ isError: true });
    expect(calls.map(call => call.table)).toEqual(["deals"]);
  });
  it("requires exactly one single or bulk argument", async () => {
    for (const input of [{ deal_id: dealId }, { deal_id: dealId, lender_id: saas, lender_ids: [saas] }]) {
      expect(await run(input)).toMatchObject({ isError: true });
    }
    expect(calls).toHaveLength(0);
  });
  it("accepts 25 IDs but rejects 26, empty arrays, invalid UUIDs and invalid tracking status", () => {
    expect(tool.inputSchema.lender_ids.safeParse(Array(25).fill(saas)).success).toBe(true);
    for (const value of [Array(26).fill(saas), [], ["bad-id"]]) {
      expect(tool.inputSchema.lender_ids.safeParse(value).success).toBe(false);
    }
    expect(tool.inputSchema.status.safeParse("invalid").success).toBe(false);
  });
});