import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { outstandingCreateFields } from "../outstandingItemFields";
import { supabaseForUser, requireAuth, textResult } from "../supabase";

export default defineTool({
  name: "batch_create_outstanding_items", title: "Create Open Items batch",
  description: "After user approval, create up to 25 Open Items on one deal, with per-item idempotency and independent created/existing/error results. Same defaults and permissions as create_outstanding_item. No delete or email actions.",
  inputSchema: { deal_id: z.string().uuid(), items: z.array(z.object(outstandingCreateFields).strict()).min(1).max(25) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const sb = supabaseForUser(ctx);
    const results = [];
    for (const [index, payload] of input.items.entries()) {
      try {
        const { data, error } = await sb.rpc("mcp_write_outstanding_item", { p_action: "create", p_deal_id: input.deal_id, p_id: null, p_payload: payload });
        results.push(error ? { index, outcome: "error", error: error.message } : { index, outcome: data?.created ? "created" : "existing", result: data });
      } catch (error) {
        results.push({ index, outcome: "error", error: error instanceof Error ? error.message : "Item creation failed" });
      }
    }
    return textResult({ results });
  },
});