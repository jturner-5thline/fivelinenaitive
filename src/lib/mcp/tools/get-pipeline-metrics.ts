import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { groupAggregate, isExcludedDealName, monthKey, sum } from "../insights";

type Row = {
  id: string;
  company: string | null;
  value: number | null;
  total_fee: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  status: string | null;
  stage: string | null;
  deal_type: string | null;
  manager: string | null;
  deal_owner: string | null;
  on_hold: boolean | null;
  pipeline_id: string | null;
  created_at: string;
  updated_at: string;
  closing_date: string | null;
  dashboard_closing_date: string | null;
};

export default defineTool({
  name: "get_pipeline_metrics",
  title: "Get pipeline metrics (Insights)",
  description:
    "Compute the deal-pipeline metrics that power the Insights dashboards: total and average deal value, fee totals (total/retainer/milestone), deal counts, and breakdowns by stage, status, deal type, manager, owner, pipeline, and month. Supports a timeframe window on created_at, updated_at, or closing date, plus optional pipeline/manager/status filters. Global test-deal exclusions (Test-Niki's Store, Example Deal, names starting with 'test ') are applied exactly as in the UI.",
  inputSchema: {
    date_field: z
      .enum(["created_at", "updated_at", "closing_date", "dashboard_closing_date"])
      .default("created_at")
      .describe("Which date column the timeframe window applies to."),
    from: z.string().trim().max(40).optional().describe("ISO date/timestamp lower bound (inclusive)."),
    to: z.string().trim().max(40).optional().describe("ISO date/timestamp upper bound (exclusive)."),
    pipeline_id: z.string().uuid().optional(),
    manager: z.string().trim().max(120).optional(),
    status: z.string().trim().max(60).optional(),
    stage: z.string().trim().max(100).optional(),
    include_deals: z.boolean().default(false).describe("Also return the underlying deal rows used in the aggregation."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date_field, from, to, pipeline_id, manager, status, stage, include_deals }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    const select =
      "id, company, value, total_fee, retainer_fee, milestone_fee, status, stage, deal_type, manager, deal_owner, on_hold, pipeline_id, created_at, updated_at, closing_date, dashboard_closing_date";

    const rows: Row[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      let q = sb.from("deals").select(select).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (from) q = q.gte(date_field, from);
      if (to) q = q.lt(date_field, to);
      if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
      if (manager) q = q.eq("manager", manager);
      if (status) q = q.eq("status", status);
      if (stage) q = q.eq("stage", stage);
      const { data, error } = await q;
      if (error) return errorResult(error.message);
      const page = (data ?? []) as unknown as Row[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    const deals = rows.filter((r) => !isExcludedDealName(r.company));
    const value = (r: Row) => Number(r.value) || 0;

    const summary = {
      deal_count: deals.length,
      total_value: sum(deals.map(value)),
      avg_deal_size: deals.length ? sum(deals.map(value)) / deals.length : 0,
      total_fees: sum(deals.map((d) => d.total_fee)),
      retainer_fees: sum(deals.map((d) => d.retainer_fee)),
      milestone_fees: sum(deals.map((d) => d.milestone_fee)),
      on_hold_count: deals.filter((d) => d.on_hold).length,
    };

    const payload = {
      timeframe: { date_field, from: from ?? null, to: to ?? null },
      filters: { pipeline_id: pipeline_id ?? null, manager: manager ?? null, status: status ?? null, stage: stage ?? null },
      summary,
      by_stage: groupAggregate(deals, (d) => d.stage ?? "unknown", value),
      by_status: groupAggregate(deals, (d) => d.status ?? "unknown", value),
      by_type: groupAggregate(deals, (d) => d.deal_type ?? "unknown", value),
      by_manager: groupAggregate(deals, (d) => d.manager ?? "unassigned", value),
      by_owner: groupAggregate(deals, (d) => d.deal_owner ?? "unassigned", value),
      by_pipeline: groupAggregate(deals, (d) => d.pipeline_id ?? "none", value),
      by_month: groupAggregate(deals, (d) => monthKey(d[date_field] as string) ?? "unknown", value).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      excluded_test_deals: rows.length - deals.length,
      ...(include_deals ? { deals } : {}),
    };

    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
