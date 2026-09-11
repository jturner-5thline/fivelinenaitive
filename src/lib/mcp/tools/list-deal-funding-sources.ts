import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "list_deal_funding_sources",
  title: "List deal funding sources / lenders",
  description:
    "List funding sources (lenders) attached to deals — the same records shown in a deal's Funding Sources tab. Pass deal_id to scope to one deal, or omit it to return funding sources across ALL deals and ALL pipelines the caller can see (RLS scoped). Optional filters: deal_query (substring of the deal/company name), pipeline_id, tracking_status, stage, lender_name. Each row returns the funding source name, funding_source_type (lender_type from the master directory, e.g. senior debt / sub debt / mezzanine / equity), loan_types, commitment/quote amount, rate and term, stage + tracking bucket (active, on-deck, on-hold, passed, excluded) as status, pass reason, status-change timestamps, and the linked deal_id / deal_name / pipeline_id. Capital-stack position is not tracked as a discrete field; funding_source_type and loan_types are the closest available signal.",
  inputSchema: {
    deal_id: z.string().uuid().optional().describe("Optional. Omit to return funding sources across all deals."),
    deal_query: z.string().trim().min(1).max(200).optional().describe("Substring filter on the deal/company name."),
    pipeline_id: z.string().uuid().optional(),
    tracking_status: z.string().trim().min(1).max(60).optional(),
    stage: z.string().trim().min(1).max(100).optional(),
    lender_name: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).default(0).describe("Row offset for pagination; use next_offset from the previous page."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, deal_query, pipeline_id, tracking_status, stage, lender_name, limit, offset }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    if (deal_id) {
      const denied = await assertDealAccess(sb, ctx, deal_id, "list_deal_funding_sources");
      if (denied) return denied;
    }

    // Resolve deal scope when filtering by name/pipeline (no implicit default scope).
    let dealIds: string[] | null = null;
    if (deal_query || pipeline_id) {
      // Page through every matching deal — a single 1000-row page silently drops matches.
      const PAGE = 1000;
      const collected: string[] = [];
      for (let page = 0; page < 50; page++) {
        let dq = sb.from("deals").select("id").order("id", { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
        if (deal_query) dq = dq.ilike("company", `%${deal_query}%`);
        if (pipeline_id) dq = dq.eq("pipeline_id", pipeline_id);
        const { data: dealRows, error: dealErr } = await dq;
        if (dealErr) return errorResult(dealErr.message);
        const ids = (dealRows ?? []).map((d: { id: string }) => d.id);
        collected.push(...ids);
        if (ids.length < PAGE) break;
      }
      dealIds = collected;
      if (dealIds.length === 0) return textResult([], { count: 0, total_count: 0, has_more: false, next_offset: null });
    }

    let q = sb
      .from("deal_lenders")
      .select(
        "id, deal_id, name, stage, substage, tracking_status, tags, score, notes, pass_reason, quote_amount, quote_rate, quote_term, submitted_at, approved_at, declined_at, passed_at, on_deck_at, on_hold_at, excluded_at, last_status_change_at, last_contact_at, master_lender_id, selected_contact_id, created_at, updated_at, master_lenders:master_lender_id(id, name, lender_type, tier, loan_types), deals:deal_id(id, company, pipeline_id, stage, status)",
        { count: "exact" },
      )
      .order("last_status_change_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (deal_id) q = q.eq("deal_id", deal_id);
    if (dealIds) q = q.in("deal_id", dealIds);
    if (tracking_status) q = q.eq("tracking_status", tracking_status);
    if (stage) q = q.eq("stage", stage);
    if (lender_name) q = q.ilike("name", `%${lender_name}%`);

    const { data, error } = await q;
    if (error) {
      console.error("[list_deal_funding_sources] query error", {
        deal_id,
        user_id: ctx.getUserId?.(),
        message: error.message,
      });
      return errorResult(error.message);
    }
    const rows = (data ?? []).map((r: Record<string, any>) => ({
      ...r,
      funding_source_type: r.master_lenders?.lender_type ?? null,
      loan_types: r.master_lenders?.loan_types ?? null,
      lender_tier: r.master_lenders?.tier ?? null,
      commitment_amount: r.quote_amount ?? null,
      status: r.tracking_status ?? r.stage ?? null,
      deal_name: r.deals?.company ?? null,
      pipeline_id: r.deals?.pipeline_id ?? null,
    }));
    console.log("[list_deal_funding_sources] ok", {
      deal_id: deal_id ?? "all",
      user_id: ctx.getUserId?.(),
      count: rows.length,
    });
    return textResult(rows, { count: rows.length, deal_id: deal_id ?? null, scope: deal_id ? "single_deal" : "all_deals" });
  },
});
