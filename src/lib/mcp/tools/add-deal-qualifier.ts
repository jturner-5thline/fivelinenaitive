import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
const COLS = "id, deal_id, text, is_met, position, created_at, updated_at";

export default defineTool({
  name: "add_deal_qualifier",
  title: "Add deal qualifier",
  description: "Add one Qualifier to a deal (appended to the end unless position is given). Requires explicit user approval before calling.",
  inputSchema: {
    deal_id: z.string().uuid().describe("Deal id."),
    text: z.string().trim().min(1).max(5000).describe("Qualifier free text."),
    is_met: z.boolean().optional().describe("Whether it is already met in the term sheet (default false)."),
    position: z.number().int().min(0).optional().describe("Sort position; defaults to last."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ deal_id, text, is_met, position }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const sb = supabaseForUser(ctx);
    let pos = position;
    if (pos === undefined) {
      const { data: last, error: e } = await sb.from("deal_qualifiers").select("position").eq("deal_id", deal_id).order("position", { ascending: false }).limit(1);
      if (e) return errorResult(e.message);
      pos = last && last.length ? last[0].position + 1 : 0;
    }
    const { data, error } = await sb.from("deal_qualifiers").insert({ deal_id, text, is_met: is_met ?? false, position: pos }).select(COLS).single();
    return error ? errorResult(error.message) : textResult({ added: data });
  },
});
