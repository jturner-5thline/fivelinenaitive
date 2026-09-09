import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

type Stage = { id?: string; label?: string };

export default defineTool({
  name: "list_pipelines",
  title: "List pipelines",
  description:
    "List every deal pipeline the signed-in user can see, with each pipeline's id, name, whether it is the default, and its ordered stages (stage id + human label). Optionally include a live deal count per pipeline. Use this to confirm that `list_deals` results span all pipelines and to translate raw stage ids into their pipeline-specific labels.",
  inputSchema: {
    include_deal_counts: z.boolean().default(true),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_deal_counts }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    const { data, error } = await sb
      .from("deal_pipelines")
      .select("id, name, is_default, company_id, stages, created_at")
      .order("created_at", { ascending: true });
    if (error) return errorResult(error.message);

    const pipelines = (data ?? []).map((p) => {
      const stages = Array.isArray((p as { stages?: Stage[] }).stages)
        ? ((p as { stages?: Stage[] }).stages as Stage[])
        : [];
      return {
        id: p.id as string,
        name: (p as { name?: string }).name ?? null,
        is_default: (p as { is_default?: boolean }).is_default ?? false,
        company_id: (p as { company_id?: string }).company_id ?? null,
        stages: stages.map((s) => ({ id: s?.id ?? null, label: s?.label ?? s?.id ?? null })),
        deal_count: null as number | null,
      };
    });

    if (include_deal_counts && pipelines.length > 0) {
      const counts = await Promise.all(
        pipelines.map(async (p) => {
          const { count } = await sb
            .from("deals")
            .select("id", { count: "exact", head: true })
            .eq("pipeline_id", p.id);
          return count ?? 0;
        }),
      );
      pipelines.forEach((p, i) => {
        p.deal_count = counts[i];
      });
    }

    const payload = { count: pipelines.length, pipelines };
    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
