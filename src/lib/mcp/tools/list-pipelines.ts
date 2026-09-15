import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { isExcludedDealName } from "../insights";

type Stage = { id?: string; label?: string };

type DealRow = {
  id: string;
  company: string | null;
  stage: string | null;
  status: string | null;
  on_hold: boolean | null;
  pipeline_id: string | null;
};

export default defineTool({
  name: "list_pipelines",
  title: "List pipelines",
  description:
    "List every deal pipeline the signed-in user can see, with each pipeline's id, name, whether it is the default, and its ordered stages (stage id + human label). With deal counts enabled, each pipeline also reports total/active/on-hold/closed counts and a per-stage breakdown using that pipeline's own stage labels, and an extra `unassigned` bucket reports deals whose pipeline_id is null. Global test-deal exclusions (Test-Niki's Store, Example Deal, names starting with 'test ') are applied so counts agree with `get_pipeline_metrics` and the Insights UI.",
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
        active_deal_count: null as number | null,
        on_hold_deal_count: null as number | null,
        closed_deal_count: null as number | null,
        by_stage: null as Array<{ stage_id: string; stage_label: string; count: number }> | null,
      };
    });

    let unassigned: {
      deal_count: number;
      active_deal_count: number;
      on_hold_deal_count: number;
      closed_deal_count: number;
    } | null = null;
    let excludedTestDeals = 0;

    if (include_deal_counts) {
      const rows: DealRow[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error: dealErr } = await sb
          .from("deals")
          .select("id, company, stage, status, on_hold, pipeline_id")
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (dealErr) return errorResult(dealErr.message);
        const chunk = (page ?? []) as unknown as DealRow[];
        rows.push(...chunk);
        if (chunk.length < pageSize) break;
      }

      const kept = rows.filter((r) => !isExcludedDealName(r.company));
      excludedTestDeals = rows.length - kept.length;

      const isClosed = (r: DealRow) => {
        const s = `${r.status ?? ""} ${r.stage ?? ""}`.toLowerCase();
        return s.includes("closed") || s.includes("lost") || s.includes("dead");
      };

      const bucket = (subset: DealRow[]) => ({
        deal_count: subset.length,
        on_hold_deal_count: subset.filter((r) => r.on_hold).length,
        closed_deal_count: subset.filter((r) => isClosed(r)).length,
        active_deal_count: subset.filter((r) => !r.on_hold && !isClosed(r)).length,
      });

      for (const p of pipelines) {
        const subset = kept.filter((r) => r.pipeline_id === p.id);
        const b = bucket(subset);
        p.deal_count = b.deal_count;
        p.active_deal_count = b.active_deal_count;
        p.on_hold_deal_count = b.on_hold_deal_count;
        p.closed_deal_count = b.closed_deal_count;

        const labels = new Map(p.stages.map((s) => [s.id ?? "", s.label ?? s.id ?? ""]));
        const counts = new Map<string, number>();
        for (const r of subset) {
          const key = r.stage ?? "unknown";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        p.by_stage = Array.from(counts.entries()).map(([stage_id, count]) => ({
          stage_id,
          stage_label: labels.get(stage_id) ?? stage_id,
          count,
        }));
      }

      unassigned = bucket(kept.filter((r) => !r.pipeline_id));
    }

    const payload = {
      count: pipelines.length,
      pipelines,
      unassigned_deals: unassigned,
      excluded_test_deals: include_deal_counts ? excludedTestDeals : null,
      notes: include_deal_counts
        ? "Counts exclude global test deals; 'closed' is inferred from status/stage text containing closed/lost/dead."
        : null,
    };
    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
