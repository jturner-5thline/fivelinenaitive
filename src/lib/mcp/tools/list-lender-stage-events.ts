import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_stage_events",
  title: "List funding-source stage history",
  description: "Read-only: deal_lender_stage_events (from/to stage, changed_at, changed_by, source = trigger | seed_from_timestamps | seed_from_activity_logs) filtered by lender_id (master lender), deal_id and since; newest first; paginated.",
  inputSchema: {
    lender_id: z.string().uuid().optional().describe("master_lenders id."),
    deal_id: z.string().uuid().optional(),
    since: z.string().optional().describe("ISO date/time; events on or after."),
    ...pagination,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    if (i.since && Number.isNaN(Date.parse(i.since))) return errorResult("since must be an ISO date or date-time.");
    let q = supabaseForUser(ctx).from("deal_lender_stage_events").select("id, deal_lender_id, deal_id, master_lender_id, from_stage, to_stage, changed_at, changed_by, source", { count: "exact" });
    if (i.lender_id) q = q.eq("master_lender_id", i.lender_id);
    if (i.deal_id) q = q.eq("deal_id", i.deal_id);
    if (i.since) q = q.gte("changed_at", i.since);
    const { data, error, count } = await q.order("changed_at", { ascending: false }).order("id").range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    return textResult({ events: data ?? [], ...pageInfo(i.offset, i.limit, data?.length ?? 0, count) }, { count: data?.length ?? 0, total_count: count ?? null });
  },
});
