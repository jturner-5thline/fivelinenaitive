import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "delete_deal_lender",
  title: "Remove funding source from deal",
  description: "Permanently remove one funding source from a deal (the deal_lenders row only; the master directory entry is untouched). Target by deal_lender_id or lender_id (master lender id). Requires confirm: true and explicit user approval. Logged to the deal audit log and the lender audit log with source and reason.",
  inputSchema: {
    deal_id: z.string().uuid(),
    deal_lender_id: z.string().uuid().optional(),
    lender_id: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(2000).describe("Why it is being removed (stored in the audit logs)."),
    confirm: z.literal(true),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ deal_id, deal_lender_id, lender_id, reason }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    if (Boolean(deal_lender_id) === Boolean(lender_id)) return errorResult("Provide exactly one of deal_lender_id or lender_id.");
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_delete_deal_lender", {
      p_deal_id: deal_id, p_deal_lender_id: deal_lender_id ?? null, p_master_lender_id: lender_id ?? null, p_reason: reason, p_source: "mcp",
    } as never);
    return error ? errorResult(error.message) : textResult(data);
  },
});
