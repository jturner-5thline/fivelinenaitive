import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, withStageLabels, resolveStageInput } from "../supabase";
import { writeDealStatusNote } from "../statusNotes";

export default defineTool({
  name: "update_deal",
  title: "Update deal",
  description:
    "Update a deal's stage and/or high-level fields (value, closing_date, deal_owner, manager, narrative, is_flagged, flag_notes, notes = the Status Note box, replaced). Optional crm_company_id links an accessible CRM company in the same workspace, with atomic MCP deal activity and no-op identical retries. Optional pipeline_id requires stage (id or display label) from the accessible target pipeline in the same workspace; pipeline and stage update atomically with history and activity. Only fields you pass are changed; omitted new fields retain existing behavior. Returns the updated deal with crm_company_id, pipeline_id, pipeline_name, stage and stage_label. Requires user approval.",
  inputSchema: {
    deal_id: z.string().uuid(),
    crm_company_id: z.string().uuid().optional().describe("Accessible CRM company UUID in this deal's workspace; only sets deals.crm_company_id."),
    pipeline_id: z.string().uuid().optional().describe("Target pipeline UUID. Requires stage in the same call, resolved only against this pipeline's stages."),
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
    const { deal_id, pipeline_id, crm_company_id, notes, ...rest } = input;
    if (pipeline_id !== undefined && input.stage === undefined) return errorResult("stage is required when pipeline_id is passed.");
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0 && notes === undefined && crm_company_id === undefined) return errorResult("No fields to update.");
    const sb = supabaseForUser(ctx);
    if (crm_company_id !== undefined) {
      if (pipeline_id === undefined && typeof patch.stage === "string") {
        const { data: current, error } = await sb.from("deals").select("pipeline_id").eq("id", deal_id).maybeSingle();
        if (error) return errorResult(error.message);
        if (!current) return errorResult("Deal not found or you do not have permission to update it.");
        patch.stage = await resolveStageInput(sb, current.pipeline_id, patch.stage);
      }
      const { data, error } = await sb.rpc("mcp_update_deal_company", {
        p_deal_id: deal_id, p_crm_company_id: crm_company_id, p_pipeline_id: pipeline_id ?? null, p_patch: patch,
      });
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Deal not found or you do not have permission to update it.");
      let result = data;
      if (notes !== undefined && data.notes !== notes) {
        const res = await writeDealStatusNote(sb, ctx, deal_id, notes, "replace", "mcp update_deal");
        if ("error" in res) return errorResult(`Deal updated, but Status Note update failed: ${res.error}`);
        result = { ...data, notes: res.notes, notes_updated_at: res.notes_updated_at };
      }
      const [updated] = await withStageLabels(sb, [result]);
      return textResult(updated, { deal_id });
    }
    if (pipeline_id !== undefined) {
      const { data, error } = await sb.rpc("mcp_update_deal_pipeline", {
        p_deal_id: deal_id,
        p_pipeline_id: pipeline_id,
        p_patch: patch,
      });
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Deal not found or you do not have permission to update it.");
      if (notes !== undefined) {
        const res = await writeDealStatusNote(sb, ctx, deal_id, notes, "replace", "mcp update_deal");
        if ("error" in res) return errorResult(`Pipeline/stage updated, but Status Note update failed: ${res.error}`);
        return textResult({ ...data, notes: res.notes, notes_updated_at: res.notes_updated_at }, { deal_id });
      }
      return textResult(data, { deal_id });
    }
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
