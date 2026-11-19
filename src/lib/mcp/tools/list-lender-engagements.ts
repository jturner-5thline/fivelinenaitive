import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_engagements",
  title: "List funding source engagements",
  description: "Read lender_engagements (newest first) filtered by lender_id, contact_id, crm_company_id, deal_id, activity_type[], since, until; paginated with total_count/next_offset.",
  inputSchema: {
    lender_id: z.string().uuid().optional(), contact_id: z.string().uuid().optional(),
    crm_company_id: z.string().uuid().optional(), deal_id: z.string().uuid().optional(),
    activity_type: z.array(z.string()).max(20).optional(),
    since: z.string().optional().describe("ISO date/time, inclusive"), until: z.string().optional().describe("ISO date/time, exclusive"),
    ...pagination,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    let q = supabaseForUser(ctx).from("lender_engagements").select("*, master_lenders(name)", { count: "exact" });
    for (const k of ["lender_id", "contact_id", "crm_company_id", "deal_id"] as const) if (i[k]) q = q.eq(k, i[k]!);
    if (i.activity_type?.length) q = q.in("activity_type", i.activity_type);
    if (i.since) q = q.gte("occurred_at", i.since);
    if (i.until) q = q.lt("occurred_at", i.until);
    const { data, error, count } = await q.order("occurred_at", { ascending: false }).range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    const p = pageInfo(i.offset, i.limit, data?.length ?? 0, count);
    return textResult({ engagements: data ?? [], ...p }, { count: data?.length ?? 0, total_count: count ?? null });
  },
});
