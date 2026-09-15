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
    pipeline_id: z
      .string()
      .uuid()
      .optional()
      .describe("Restrict the funnel to deals in this pipeline (stage ids mean different things per pipeline)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage_path, consecutive_only, deal_id, pipeline_id }, ctx) => {
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

    if (pipeline_id) {
      // Pipeline-scoped funnel computed from stage history for deals in this pipeline.
      type Hist = { deal_id: string; to_stage: string; changed_at: string };
      const rows: Hist[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error: histErr } = await sb
          .from("deal_stage_history")
          .select("deal_id, to_stage, changed_at")
          .eq("pipeline_id", pipeline_id)
          .order("changed_at", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (histErr) return errorResult(histErr.message);
        const chunk = (page ?? []) as unknown as Hist[];
        rows.push(...chunk);
        if (chunk.length < pageSize) break;
      }

      // earliest entry per (deal, stage)
      const firstEntry = new Map<string, Map<string, string>>();
      for (const r of rows) {
        if (!r.to_stage || !r.changed_at) continue;
        const perDeal = firstEntry.get(r.deal_id) ?? new Map<string, string>();
        const prev = perDeal.get(r.to_stage);
        if (!prev || r.changed_at < prev) perDeal.set(r.to_stage, r.changed_at);
        firstEntry.set(r.deal_id, perDeal);
      }

      const dealIds = Array.from(firstEntry.keys());
      const steps = [] as Array<Record<string, unknown>>;
      for (let i = 0; i < stage_path.length - 1; i++) {
        const fromStage = stage_path[i];
        const toStage = stage_path[i + 1];
        const durations: number[] = [];
        let fromCount = 0;
        let toCount = 0;
        for (const id of dealIds) {
          const perDeal = firstEntry.get(id)!;
          const a = perDeal.get(fromStage);
          if (!a) continue;
          fromCount++;
          const b = perDeal.get(toStage);
          if (!b || b < a) continue;
          toCount++;
          durations.push((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
        }
        durations.sort((x, y) => x - y);
        const median = durations.length
          ? durations.length % 2
            ? durations[(durations.length - 1) / 2]
            : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
          : null;
        steps.push({
          from_stage: fromStage,
          to_stage: toStage,
          deals_reaching_from: fromCount,
          deals_reaching_to: toCount,
          conversion_rate: fromCount ? toCount / fromCount : null,
          median_days: median,
          avg_days: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
        });
      }
      const payload = { pipeline_id, stage_path, basis: "first entry per stage from deal_stage_history", steps };
      return textResult(payload, payload as unknown as Record<string, unknown>);
    }

    const { data, error } = await sb.rpc("get_funnel_velocity", {
      p_stage_path: stage_path,
      p_consecutive_only: consecutive_only,
    });
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { stage_path, consecutive_only, steps: data ?? [] });
  },
});
