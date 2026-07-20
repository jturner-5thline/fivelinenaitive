import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "update_deal",
  title: "Update deal",
  description:
    "Update a deal's stage and/or high-level fields (value, closing_date, deal_owner, manager, narrative, is_flagged, flag_notes). Only fields you pass are changed. Returns the updated deal row.",
  inputSchema: {
    deal_id: z.string().uuid(),
    stage: z.string().trim().min(1).max(100).optional(),
    value: z.number().nonnegative().optional(),
    closing_date: z.string().nullable().optional().describe("ISO date, or null to clear."),
    deal_owner: z.string().trim().max(200).optional(),
    manager: z.string().trim().max(200).optional(),
    narrative: z.string().max(20000).optional(),
    is_flagged: z.boolean().optional(),
    flag_notes: z.string().max(2000).nullable().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { deal_id, ...rest } = input;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0) return errorResult("No fields to update.");
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.from("deals").update(patch).eq("id", deal_id).select().maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Deal not found or you do not have permission to update it.");
    return textResult(data, { deal_id });
  },
});