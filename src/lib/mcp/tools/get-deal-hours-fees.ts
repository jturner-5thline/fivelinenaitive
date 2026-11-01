import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, withStageLabels } from "../supabase";
import { isExcludedDealName } from "../insights";
import { computeDealHoursFees, rollupHoursFees, type DealHoursFees } from "../dealHoursFees";

type Row = {
  id: string;
  company: string | null;
  stage: string | null;
  status: string | null;
  pipeline_id: string | null;
  manager: string | null;
  value: number | null;
  total_fee: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  success_fee_percent: number | null;
  pre_signing_hours: number | null;
  post_signing_hours: number | null;
};

export default defineTool({
  name: "get_deal_hours_fees",
  title: "Get deal hours & fees",
  description:
    "Hours & Fees for each deal (matches the deal page widget): retainer_fee, milestone_fee, success_fee_percent, closing_fee (total minus retainer and milestone, floored at 0), total_fee, pre/post-signing and total hours, revenue_per_hour, and missing_fee_information. Also returns rollups per pipeline and overall. Filter by deal_id, pipeline_id, stage or company query. Set include_weekly_hours=true for the weekly logged-hours entries (week, phase, hours) behind each deal's totals. Test deals are excluded.",
  inputSchema: {
    deal_id: z.string().uuid().optional(),
    pipeline_id: z.string().uuid().optional(),
    stage: z.string().trim().max(100).optional().describe("Raw stage id."),
    query: z.string().trim().min(1).max(200).optional().describe("Substring match on deal/company name."),
    only_missing_fees: z.boolean().default(false),
    include_weekly_hours: z.boolean().default(false),
    limit: z.number().int().min(1).max(2000).default(500).describe("Max deals listed (rollups always cover all matches)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, pipeline_id, stage, query, only_missing_fees, include_weekly_hours, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const select =
      "id, company, stage, status, pipeline_id, manager, value, total_fee, retainer_fee, milestone_fee, success_fee_percent, pre_signing_hours, post_signing_hours";

    const rows: Row[] = [];
    for (let offset = 0; ; offset += 1000) {
      let q = sb.from("deals").select(select).order("created_at", { ascending: false }).range(offset, offset + 999);
      if (deal_id) q = q.eq("id", deal_id);
      if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
      if (stage) q = q.eq("stage", stage);
      if (query) q = q.ilike("company", `%${query}%`);
      const { data, error } = await q;
      if (error) return errorResult(error.message);
      const page = (data ?? []) as unknown as Row[];
      rows.push(...page);
      if (page.length < 1000) break;
    }

    const labelled = await withStageLabels(sb, rows.filter((r) => deal_id || !isExcludedDealName(r.company)));
    let deals = labelled.map((r) => ({
      deal_id: r.id,
      company: r.company,
      stage_label: (r as { stage_label?: string | null }).stage_label ?? r.stage,
      status: r.status,
      pipeline_id: r.pipeline_id,
      pipeline_name: (r as { pipeline_name?: string | null }).pipeline_name ?? null,
      manager: r.manager,
      deal_value: Number(r.value) || 0,
      ...computeDealHoursFees(r),
    }));
    if (only_missing_fees) deals = deals.filter((d) => d.missing_fee_information);

    const groups = new Map<string, { name: string | null; rows: DealHoursFees[] }>();
    for (const d of deals) {
      const key = d.pipeline_id ?? "none";
      const g = groups.get(key) ?? { name: d.pipeline_name, rows: [] };
      g.rows.push(d);
      groups.set(key, g);
    }

    let weekly: Record<string, Array<{ week_start_date: string; phase: string; hours: number }>> | undefined;
    if (include_weekly_hours && deals.length) {
      weekly = {};
      const ids = deals.slice(0, limit).map((d) => d.deal_id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await sb
          .from("weekly_time_entries")
          .select("deal_id, week_start_date, phase, hours")
          .in("deal_id", ids.slice(i, i + 200))
          .order("week_start_date", { ascending: true });
        if (error) return errorResult(error.message);
        for (const e of (data ?? []) as Array<{ deal_id: string; week_start_date: string; phase: string; hours: number }>) {
          (weekly[e.deal_id] ??= []).push({ week_start_date: e.week_start_date, phase: e.phase, hours: Number(e.hours) || 0 });
        }
      }
    }

    const payload = {
      overall: rollupHoursFees(deals),
      by_pipeline: [...groups.entries()].map(([key, g]) => ({
        pipeline_id: key === "none" ? null : key,
        pipeline_name: key === "none" ? "Unassigned" : g.name,
        ...rollupHoursFees(g.rows),
      })),
      deal_count: deals.length,
      returned: Math.min(deals.length, limit),
      deals: deals.slice(0, limit).map((d) => ({ ...d, ...(weekly ? { weekly_hours: weekly[d.deal_id] ?? [] } : {}) })),
      notes:
        "closing_fee = max(0, total_fee - retainer_fee - milestone_fee). revenue_per_hour = total_fee / (pre + post signing hours). Hours totals come from the deal's logged hours.",
    };
    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
