import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_met_status",
  title: "List funding source met status",
  description: "Read the lender_met_status summary (first/last meeting, call+meeting count, last two-way email, last engagement, on a deal past Sent DRL, is_met). Filters is_met, last_engagement_before, lender_ids[]; paginated.",
  inputSchema: {
    is_met: z.boolean().optional(),
    last_engagement_before: z.string().optional().describe("ISO date; returns lenders whose last engagement is earlier (or none)."),
    lender_ids: z.array(z.string().uuid()).max(200).optional(),
    ...pagination,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    let q = supabaseForUser(ctx).from("lender_met_status").select("*", { count: "exact" });
    if (i.is_met !== undefined) q = q.eq("is_met", i.is_met);
    if (i.lender_ids?.length) q = q.in("lender_id", i.lender_ids);
    if (i.last_engagement_before) q = q.or(`last_engagement_at.lt.${i.last_engagement_before},last_engagement_at.is.null`);
    const { data, error, count } = await q.order("last_engagement_at", { ascending: false, nullsFirst: false }).range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    return textResult({ lenders: data ?? [], ...pageInfo(i.offset, i.limit, data?.length ?? 0, count) }, { count: data?.length ?? 0, total_count: count ?? null });
  },
});
