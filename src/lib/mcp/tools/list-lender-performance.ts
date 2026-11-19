import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_performance",
  title: "List funding-source performance scores",
  description: "Read-only: current lender_performance_scores rows with lender name, filtered by lender_ids and overall_label; most recently computed first; paginated.",
  inputSchema: {
    lender_ids: z.array(z.string().uuid()).max(200).optional(),
    overall_label: z.enum(["strong", "mixed", "weak"]).optional(),
    ...pagination,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    let q = supabaseForUser(ctx).from("lender_performance_scores").select("lender_id, computed_at, window_days, dimensions, overall_label, version, updated_at, master_lenders(name)", { count: "exact" });
    if (i.lender_ids?.length) q = q.in("lender_id", i.lender_ids);
    if (i.overall_label) q = q.eq("overall_label", i.overall_label);
    const { data, error, count } = await q.order("computed_at", { ascending: false }).order("lender_id").range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    return textResult({ scores: data ?? [], ...pageInfo(i.offset, i.limit, data?.length ?? 0, count) }, { count: data?.length ?? 0, total_count: count ?? null });
  },
});
