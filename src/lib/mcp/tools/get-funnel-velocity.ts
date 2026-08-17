import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_funnel_velocity",
  title: "Get funnel velocity / stage durations",
  description:
    "Return stage-conversion and time-in-stage analytics used by the Insights funnel and velocity widgets. Provide an ordered stage_path (stage ids) to get conversion counts and median/average days between those stages; set consecutive_only to require direct stage-to-stage transitions. Optionally pass deal_id instead to get that single deal's per-stage durations.",
  inputSchema: {
    stage_path: z
      .array(z.string().trim().min(1).max(100))
      .min(2)
      .max(20)
      .optional()
      .describe("Ordered list of stage ids, e.g. ['nda-needs-list','on-deck','closed-won']."),
    consecutive_only: z.boolean().default(false),
    deal_id: z.string().uuid().optional().describe("When set, returns per-stage durations for this deal instead."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage_path, consecutive_only, deal_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    if (deal_id) {
      const { data, error } = await sb.rpc("get_deal_stage_durations", { p_deal_id: deal_id });
      if (error) return errorResult(error.message);
      return textResult(data ?? [], { deal_id, stages: data ?? [] });
    }

    if (!stage_path || stage_path.length < 2) {
      return errorResult("Provide either stage_path (2+ stage ids) or deal_id.");
    }

    const { data, error } = await sb.rpc("get_funnel_velocity", {
      p_stage_path: stage_path,
      p_consecutive_only: consecutive_only,
    });
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { stage_path, consecutive_only, steps: data ?? [] });
  },
});
