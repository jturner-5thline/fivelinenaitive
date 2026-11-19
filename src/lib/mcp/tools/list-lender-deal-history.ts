import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_deal_history",
  title: "List outside deals for funding sources",
  description: "Read lender_deal_history rows (newest announced first) filtered by lender_id, status and since (announced_on on/after); paginated.",
  inputSchema: {
    lender_id: z.string().uuid().optional(),
    status: z.enum(["proposed", "confirmed", "rejected"]).optional(),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ...pagination,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    let q = supabaseForUser(ctx).from("lender_deal_history").select("*, master_lenders(name)", { count: "exact" });
    if (i.lender_id) q = q.eq("lender_id", i.lender_id);
    if (i.status) q = q.eq("status", i.status);
    if (i.since) q = q.gte("announced_on", i.since);
    const { data, error, count } = await q.order("announced_on", { ascending: false, nullsFirst: false }).range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    return textResult({ deals: data ?? [], ...pageInfo(i.offset, i.limit, data?.length ?? 0, count) }, { count: data?.length ?? 0, total_count: count ?? null });
  },
});
