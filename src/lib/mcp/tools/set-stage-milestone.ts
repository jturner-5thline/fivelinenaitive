import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { loadDealWithStages, stageMilestoneDefs } from "../stageMilestones";
import { writeControls } from "./_milestoneFields";

export default defineTool({
  name: "set_stage_milestone",
  title: "Set stage milestone",
  description: "Check or uncheck a stage checklist milestone on a deal. Creates the row if missing. completed=true stamps completed_at now; false clears it. Rejects milestone_key values not defined for that stage (see list_stage_milestones). Does not move the deal's stage. dry_run defaults true. Returns the row.",
  inputSchema: { deal_id: z.string().uuid(), stage: z.string().trim().min(1).max(100), milestone_key: z.string().trim().min(1).max(100), completed: z.boolean(), ...writeControls },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, stage, milestone_key, completed, expected_updated_at, dry_run }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const sb = supabaseForUser(ctx);
    try {
      const { stages } = await loadDealWithStages(sb, deal_id);
      const defs = stageMilestoneDefs(stage, stages);
      const def = defs.find((d) => d.key === milestone_key);
      if (!def) return errorResult(`'${milestone_key}' is not a milestone for stage '${stage}'. Valid keys: ${defs.map((d) => d.key).join(", ") || "(none)"}.`);
      const { data, error } = await sb.rpc("mcp_set_stage_milestone", { p_deal_id: deal_id, p_stage: stage, p_milestone_key: milestone_key, p_completed: completed, p_label: def.label, p_expected_updated_at: expected_updated_at, p_dry_run: dry_run });
      return error ? errorResult(error.message) : textResult(data);
    } catch (e) { return errorResult((e as Error).message); }
  },
});
