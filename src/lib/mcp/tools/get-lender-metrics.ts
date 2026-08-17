import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { groupAggregate, isExcludedDealName, sum } from "../insights";

type LenderRow = {
  id: string;
  deal_id: string;
  name: string | null;
  stage: string | null;
  tracking_status: string | null;
  quote_amount: number | null;
  pass_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  passed_at: string | null;
  created_at: string;
  last_status_change_at: string | null;
};

export default defineTool({
  name: "get_lender_metrics",
  title: "Get lender / funding-source metrics (Lender Intelligence dashboard)",
  description:
    "Return the funding-source analytics behind the Lender Intelligence and funnel widgets: counts and quoted amounts by lender stage, tracking bucket (active / on-deck / on-hold / passed / excluded), and by lender name, plus top pass reasons and submission-to-approval conversion. Timeframe bounds apply to created_at or last_status_change_at; test deals are excluded.",
  inputSchema: {
    date_field: z.enum(["created_at", "last_status_change_at", "submitted_at"]).default("created_at"),
    from: z.string().trim().max(40).optional(),
    to: z.string().trim().max(40).optional(),
    deal_id: z.string().uuid().optional().describe("Scope to a single deal."),
    lender_name: z.string().trim().max(160).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date_field, from, to, deal_id, lender_name }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    const rows: LenderRow[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      let q = sb
        .from("deal_lenders")
        .select(
          "id, deal_id, name, stage, tracking_status, quote_amount, pass_reason, submitted_at, approved_at, declined_at, passed_at, created_at, last_status_change_at",
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (from) q = q.gte(date_field, from);
      if (to) q = q.lt(date_field, to);
      if (deal_id) q = q.eq("deal_id", deal_id);
      if (lender_name) q = q.ilike("name", `%${lender_name}%`);
      const { data, error } = await q;
      if (error) return errorResult(error.message);
      const page = (data ?? []) as unknown as LenderRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    // Drop entries belonging to excluded test deals.
    const dealIds = [...new Set(rows.map((r) => r.deal_id))];
    const excluded = new Set<string>();
    for (let i = 0; i < dealIds.length; i += 200) {
      const { data, error } = await sb.from("deals").select("id, company").in("id", dealIds.slice(i, i + 200));
      if (error) return errorResult(error.message);
      for (const d of data ?? []) {
        if (isExcludedDealName((d as { company: string | null }).company)) excluded.add((d as { id: string }).id);
      }
    }
    const lenders = rows.filter((r) => !excluded.has(r.deal_id));
    const quote = (r: LenderRow) => Number(r.quote_amount) || 0;

    const submitted = lenders.filter((l) => l.submitted_at).length;
    const approved = lenders.filter((l) => l.approved_at).length;

    const payload = {
      timeframe: { date_field, from: from ?? null, to: to ?? null },
      filters: { deal_id: deal_id ?? null, lender_name: lender_name ?? null },
      summary: {
        entry_count: lenders.length,
        distinct_lenders: new Set(lenders.map((l) => l.name ?? "unknown")).size,
        distinct_deals: new Set(lenders.map((l) => l.deal_id)).size,
        total_quoted: sum(lenders.map(quote)),
        submitted,
        approved,
        passed: lenders.filter((l) => l.passed_at).length,
        declined: lenders.filter((l) => l.declined_at).length,
        submit_to_approve_rate: submitted ? approved / submitted : 0,
      },
      by_stage: groupAggregate(lenders, (l) => l.stage ?? "unknown", quote),
      by_tracking_status: groupAggregate(lenders, (l) => l.tracking_status ?? "unknown", quote),
      by_lender: groupAggregate(lenders, (l) => l.name ?? "unknown", quote).slice(0, 100),
      top_pass_reasons: groupAggregate(
        lenders.filter((l) => l.pass_reason),
        (l) => (l.pass_reason ?? "").slice(0, 120),
        () => 0,
      )
        .sort((a, b) => b.count - a.count)
        .slice(0, 25),
    };

    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
