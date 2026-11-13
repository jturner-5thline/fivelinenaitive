import { z } from "zod";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { errorResult, requireAuth, supabaseForUser, textResult } from "./supabase";

export const contactLinkSchema = {
  deal_id: z.string().uuid(),
  contact_id: z.string().uuid().optional().describe("Existing contact UUID; provide this or email, not both."),
  email: z.string().trim().email().max(320).optional().describe("Existing contact email in the deal workspace; never creates contacts."),
};
export const aliasSchema = {
  deal_id: z.string().uuid(),
  alias: z.string().trim().min(1).max(500).describe("Deal alias; matching ignores case and collapses whitespace."),
};

type RelationshipAction = "link_deal_contact" | "unlink_deal_contact" | "add_deal_alias" | "remove_deal_alias";
export async function mutateDealRelationship(action: RelationshipAction, input: { deal_id: string; contact_id?: string; email?: string; role?: string; alias?: string }, ctx: ToolContext) {
  const denied = requireAuth(ctx);
  if (denied) return denied;
  if (action.endsWith("contact") && Boolean(input.contact_id) === Boolean(input.email)) {
    return errorResult("Provide contact_id or email, not both.");
  }
  const { deal_id, ...fields } = input;
  const p_input = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  const { data, error } = await supabaseForUser(ctx).rpc("mcp_mutate_deal_relationship", { p_deal_id: deal_id, p_action: action, p_input });
  if (error) return errorResult(error.message);
  return textResult(data, { deal_id });
}