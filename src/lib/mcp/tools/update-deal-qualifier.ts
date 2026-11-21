import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
const COLS = "id, deal_id, text, is_met, position, created_at, updated_at";

export default defineTool({
  name: "update_deal_qualifier",
  title: "Update deal qualifier",
  description: "Edit a Qualifier's text, check/uncheck it (is_met), or move it (position). Only supplied fields change. Requires explicit user approval before calling.",
  inputSchema: {
    id: z.string().uuid().describe("Qualifier id from list_deal_qualifiers."),
    text: z.string().trim().min(1).max(5000).optional().describe("New text."),
    is_met: z.boolean().optional().describe("true = met in the term sheet (checked), false = unchecked."),
    position: z.number().int().min(0).optional().describe("New sort position."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, text, is_met, position }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const patch: { text?: string; is_met?: boolean; position?: number } = {};
    if (text !== undefined) patch.text = text;
    if (is_met !== undefined) patch.is_met = is_met;
    if (position !== undefined) patch.position = position;
    if (!Object.keys(patch).length) return errorResult("Provide at least one of text, is_met or position.");
    const { data, error } = await supabaseForUser(ctx).from("deal_qualifiers").update(patch).eq("id", id).select(COLS);
    if (error) return errorResult(error.message);
    if (!data || !data.length) return errorResult("Qualifier not found or not accessible.");
    return textResult({ updated: data[0] });
  },
});
