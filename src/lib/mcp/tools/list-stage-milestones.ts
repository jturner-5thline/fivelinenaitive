import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { loadDealWithStages, mergeStageMilestones, stageMilestoneDefs, type StageMilestoneRow } from "../stageMilestones";

export default defineTool({
  name: "list_stage_milestones",
  title: "List stage milestones",
  description: "List a deal's stage checklist milestones (stage, milestone_key, label, completed, completed_at). Includes defined milestones with no saved row as not completed. Defaults to every stage with milestones or saved rows; pass stage (id) to narrow.",
  inputSchema: { deal_id: z.string().uuid(), stage: z.string().trim().min(1).max(100).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, stage }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const sb = supabaseForUser(ctx);
    try {
      const { deal, stages } = await loadDealWithStages(sb, deal_id);
      const { data, error } = await sb.from("naitive_stage_milestones").select("id, stage, milestone_key, completed, completed_at, updated_at").eq("deal_id", deal_id);
      if (error) return errorResult(error.message);
      const rows = (data ?? []) as StageMilestoneRow[];
      const stageIds = stage ? [stage] : [...new Set([...stages.map((s) => s.id), ...rows.map((r) => r.stage)])];
      const result = stageIds.map((id) => ({
        stage: id,
        stage_label: stages.find((s) => s.id === id)?.label ?? id,
        milestones: mergeStageMilestones(id, stageMilestoneDefs(id, stages), rows),
      })).filter((s) => s.milestones.length > 0 || stage);
      return textResult({ deal_id, deal_name: deal.company, current_stage: deal.stage, stages: result });
    } catch (e) { return errorResult((e as Error).message); }
  },
});
