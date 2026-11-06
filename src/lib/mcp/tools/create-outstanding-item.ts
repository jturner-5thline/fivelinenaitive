import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { outstandingCreateFields } from "../outstandingItemFields";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "create_outstanding_item", title: "Create Open Item",
  description: "After user approval, create an Open Item on an accessible deal. Defaults to Requested/normal, appends to the active list, validates deal_lenders.id, stores provenance and deduplicates idempotency keys even for archived items. Returns the full item and created flag; logs an MCP-attributed activity atomically. No email is sent.",
  inputSchema: { deal_id: z.string().uuid(), ...outstandingCreateFields },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { deal_id, ...payload } = input;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_outstanding_item", { p_action: "create", p_deal_id: deal_id, p_id: null, p_payload: payload });
    return error ? errorResult(error.message) : textResult(data);
  },
});