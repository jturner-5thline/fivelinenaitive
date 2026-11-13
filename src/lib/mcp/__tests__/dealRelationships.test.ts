import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (tool: unknown) => tool }));
vi.mock("../supabase", () => ({ supabaseForUser: vi.fn(), requireAuth: vi.fn(() => null), errorResult: (message: string) => ({ isError: true, message }), textResult: (data: unknown) => ({ data }), withStageLabels: vi.fn(async (_sb, rows) => rows), resolveStageInput: vi.fn() }));
vi.mock("../statusNotes", () => ({ writeDealStatusNote: vi.fn() }));
import link from "../tools/link-deal-contact";
import unlink from "../tools/unlink-deal-contact";
import addAlias from "../tools/add-deal-alias";
import removeAlias from "../tools/remove-deal-alias";
import update from "../tools/update-deal";
import { supabaseForUser, requireAuth, resolveStageInput } from "../supabase";
import { writeDealStatusNote } from "../statusNotes";
const deal_id = "11111111-1111-4111-8111-111111111111";
const contact_id = "22222222-2222-4222-8222-222222222222";
const crm_company_id = "33333333-3333-4333-8333-333333333333";
const rpc = vi.fn();
const ctx = {} as Parameters<typeof link.handler>[1];
const callLink = (input: Record<string, unknown>) => link.handler(input as Parameters<typeof link.handler>[0], ctx);
const callUnlink = (input: Record<string, unknown>) => unlink.handler(input as Parameters<typeof unlink.handler>[0], ctx);
const callUpdate = (input: Record<string, unknown>) => update.handler(input as Parameters<typeof update.handler>[0], ctx);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(supabaseForUser).mockReturnValue({ rpc } as unknown as ReturnType<typeof supabaseForUser>); rpc.mockResolvedValue({ data: { changed: false }, error: null }); });
describe("deal relationships", () => {
 it("passes contact role to the atomic link operation", async () => {
  await callLink({ deal_id, contact_id, role: "Client – CFO" });
  expect(rpc).toHaveBeenCalledWith("mcp_mutate_deal_relationship", { p_deal_id: deal_id, p_action: "link_deal_contact", p_input: { contact_id, role: "Client – CFO" } });
 });
 it("omitted role is not sent, preserving an existing role", async () => {
  await callLink({ deal_id, email: "cfo@example.com" });
  expect(rpc.mock.calls[0][1].p_input).toEqual({ email: "cfo@example.com" });
 });
 it.each([{ deal_id }, { deal_id, contact_id, email: "cfo@example.com" }])("rejects missing or ambiguous selectors before writes", async (input) => {
  expect(await callLink(input)).toHaveProperty("isError", true); expect(rpc).not.toHaveBeenCalled();
 });
 it("unlinks through only the relationship operation", async () => {
  expect(await callUnlink({ deal_id, contact_id })).toEqual({ data: { changed: false } });
  expect(rpc.mock.calls[0][1].p_action).toBe("unlink_deal_contact");
 });
 it.each(["Contact not found", "Multiple contacts match this email", "Contact link update denied"])("surfaces %s without creating a contact", async message => {
  rpc.mockResolvedValue({ error: { message } }); expect(await callLink({ deal_id, contact_id })).toEqual({ isError: true, message }); expect(rpc).toHaveBeenCalledTimes(1);
 });
 it.each([[addAlias, "add_deal_alias"], [removeAlias, "remove_deal_alias"]] as const)("uses the atomic alias mutation", async (tool, action) => {
  await tool.handler({ deal_id, alias: "  Sample   Company " }, ctx);
  expect(rpc).toHaveBeenCalledWith("mcp_mutate_deal_relationship", { p_deal_id: deal_id, p_action: action, p_input: { alias: "  Sample   Company " } });
 });
 it("validates all advertised inputs", () => {
  expect(link.inputSchema.contact_id.safeParse("bad").success).toBe(false);
  expect(link.inputSchema.email.safeParse("bad").success).toBe(false);
  expect(link.inputSchema.role.safeParse("x".repeat(201)).success).toBe(false);
  expect(addAlias.inputSchema.alias.safeParse(" \t ").success).toBe(false);
  expect(update.inputSchema.crm_company_id.safeParse(crm_company_id).success).toBe(true);
  expect(update.inputSchema.crm_company_id.safeParse("bad").success).toBe(false);
 });
 it.each([link, unlink, addAlias, removeAlias])("requires authenticated caller", async tool => {
  vi.mocked(requireAuth).mockReturnValueOnce({ isError: true, content: [] });
  if (tool === link) await callLink({ deal_id, contact_id });
  else if (tool === unlink) await callUnlink({ deal_id, contact_id });
  else await tool.handler({ deal_id, contact_id: undefined, email: undefined, alias: "Sample" }, ctx);
  expect(rpc).not.toHaveBeenCalled();
 });
 it("updates just CRM company transactionally", async () => {
  rpc.mockResolvedValue({ data: { id: deal_id, crm_company_id }, error: null });
  expect(await callUpdate({ deal_id, crm_company_id })).toEqual({ data: { id: deal_id, crm_company_id } });
  expect(rpc).toHaveBeenCalledWith("mcp_update_deal_company", { p_deal_id: deal_id, p_crm_company_id: crm_company_id, p_pipeline_id: null, p_patch: {} });
 });
 it("passes target stage label and company into one transaction", async () => {
  await callUpdate({ deal_id, crm_company_id, pipeline_id: contact_id, stage: "Benched" });
  expect(rpc.mock.calls[0][1]).toEqual({ p_deal_id: deal_id, p_crm_company_id: crm_company_id, p_pipeline_id: contact_id, p_patch: { stage: "Benched" } });
  expect(resolveStageInput).not.toHaveBeenCalled();
 });
 it("rejects inaccessible company before notes", async () => {
  rpc.mockResolvedValue({ error: { message: "CRM company not found" } });
  expect(await callUpdate({ deal_id, crm_company_id, notes: "not written" })).toHaveProperty("isError", true);
  expect(writeDealStatusNote).not.toHaveBeenCalled();
 });
 it("does not rewrite identical status notes on company retries", async () => {
  rpc.mockResolvedValue({ data: { id: deal_id, crm_company_id, notes: "existing" }, error: null });
  await callUpdate({ deal_id, crm_company_id, notes: "existing" });
  expect(writeDealStatusNote).not.toHaveBeenCalled();
 });
});
