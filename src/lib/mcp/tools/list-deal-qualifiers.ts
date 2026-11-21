import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
const COLS = "id, deal_id, text, is_met, position, created_at, updated_at";

export default defineTool({
  name: "list_deal_qualifiers",
  title: "List deal qualifiers",
  description: "List a deal's Qualifiers (agreement requirements that trigger the milestone fee) in display order, with is_met showing whether each has been met in the term sheet.",
  inputSchema: { deal_id: z.string().uuid().describe("Deal id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).from("deal_qualifiers").select(COLS).eq("deal_id", deal_id).order("position").order("created_at");
    if (error) return errorResult(error.message);
    const rows = data ?? [];
    return textResult({ deal_id, total: rows.length, met: rows.filter((r) => r.is_met).length, qualifiers: rows });
  },
});
