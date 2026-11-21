import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
const COLS = "id, deal_id, text, is_met, position, created_at, updated_at";

export default defineTool({
  name: "delete_deal_qualifier",
  title: "Delete deal qualifier",
  description: "Permanently delete one Qualifier by id. Requires confirm: true and explicit user approval.",
  inputSchema: { id: z.string().uuid().describe("Qualifier id."), confirm: z.literal(true) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).from("deal_qualifiers").delete().eq("id", id).select(COLS);
    if (error) return errorResult(error.message);
    if (!data || !data.length) return errorResult("Qualifier not found or not accessible.");
    return textResult({ deleted: data[0] });
  },
});
