import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({ requireAuth: vi.fn(() => null), assertDealAccess: vi.fn(async () => null), supabaseForUser: vi.fn(), withStageLabels: vi.fn(async (_sb, rows) => rows), textResult: (data: unknown, metadata: unknown) => ({ data, metadata }), errorResult: (message: string) => ({ isError: true, message }) }));
import tool from "../tools/get-deal";
import { assertDealAccess, supabaseForUser } from "../supabase";
const deal_id = "11111111-1111-4111-8111-111111111111";
const fixtures: Record<string, unknown> = {};
const from = vi.fn((table: string) => {
 const result = { data: fixtures[table] ?? [], error: null };
 const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
 return q;
});
const invoke = () => tool.handler({ deal_id, include_tasks: false, include_lenders: false, include_related: false, include_task_detail: false }, {} as Parameters<typeof tool.handler>[1]);
beforeEach(() => {
 vi.clearAllMocks(); for (const key of Object.keys(fixtures)) delete fixtures[key];
 fixtures.deals = { id: deal_id, crm_company_id: "company", company_id: "workspace" };
 fixtures.contact_deals = [{ contact_id: "contact", role: "Client – CFO", created_at: "2026-11-01" }];
 fixtures.contacts = [{ id: "contact", first_name: "Jane", last_name: "Doe", email: "jane@example.com", job_title: "CFO" }];
 fixtures.crm_companies = { id: "company", name: "Example", domain: "example.com" };
 fixtures.deal_aliases = [{ alias: "Example alias" }];
 vi.mocked(supabaseForUser).mockReturnValue({ from } as unknown as ReturnType<typeof supabaseForUser>);
});
describe("get_deal relationships", () => {
 it("returns contact role, CRM company and aliases without include_related", async () => {
  expect(await invoke()).toMatchObject({ data: { client_contacts: [{ name: "Jane Doe", role: "Client – CFO", email: "jane@example.com" }], crm_company: { id: "company", name: "Example", domain: "example.com" }, aliases: ["Example alias"] }, metadata: { deal_id } });
 });
 it("returns empty relationships consistently", async () => {
  fixtures.deals = { id: deal_id }; fixtures.contact_deals = []; fixtures.deal_aliases = [];
  expect(await invoke()).toMatchObject({ data: { client_contacts: [], crm_company: null, aliases: [] } });
  expect(from).not.toHaveBeenCalledWith("crm_companies");
 });
 it("does not expose relationships for a denied deal", async () => {
  vi.mocked(assertDealAccess).mockResolvedValueOnce({ content: [], structuredContent: { error: "forbidden", reason: "denied", deal_id }, isError: true });
  expect(await invoke()).toHaveProperty("isError", true); expect(from).not.toHaveBeenCalled();
 });
});
