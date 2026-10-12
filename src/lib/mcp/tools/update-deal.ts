import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, withStageLabels, resolveStageInput } from "../supabase";
import { writeDealStatusNote } from "../statusNotes";

export default defineTool({
  name: "update_deal",
  title: "Update deal",
  description:
    "Update a deal's stage and/or high-level fields (value, closing_date, deal_owner, manager, narrative, is_flagged, flag_notes, notes = the Status Note box, replaced). Only fields you pass are changed. Returns the updated deal row.",
  inputSchema: {
    deal_id: z.string().uuid(),
    stage: z.string().trim().min(1).max(100).optional().describe("Stage id or the stage display label from the deal's pipeline; labels are resolved to the correct id."),
    value: z.number().nonnegative().optional(),
    closing_date: z.string().nullable().optional().describe("ISO date, or null to clear."),
    deal_owner: z.string().trim().max(200).optional(),
    manager: z.string().trim().max(200).optional(),
    narrative: z.string().max(20000).optional(),
    is_flagged: z.boolean().optional(),
    flag_notes: z.string().max(2000).nullable().optional(),
    notes: z.string().trim().min(1).max(2000).optional().describe("Replaces the Status Note text; previous note is archived and the change is logged. Use add_deal_status_note to prepend."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { deal_id, notes, ...rest } = input;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0 && notes === undefined) return errorResult("No fields to update.");
    const sb = supabaseForUser(ctx);
    if (notes !== undefined) {
      const res = await writeDealStatusNote(sb, ctx, deal_id, notes, "replace", "mcp update_deal");
      if ("error" in res) return errorResult(res.error);
    }
    if (typeof patch.stage === "string") {
      const { data: current } = await sb.from("deals").select("pipeline_id").eq("id", deal_id).maybeSingle();
      patch.stage = await resolveStageInput(sb, (current as { pipeline_id?: string | null } | null)?.pipeline_id, patch.stage);
    }
    const q = Object.keys(patch).length
      ? sb.from("deals").update(patch).eq("id", deal_id).select().maybeSingle()
      : sb.from("deals").select().eq("id", deal_id).maybeSingle();
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Deal not found or you do not have permission to update it.");
    const [updated] = await withStageLabels(sb, [data as Record<string, unknown> & { stage?: string | null; pipeline_id?: string | null }]);
    return textResult(updated, { deal_id });
  },
});
