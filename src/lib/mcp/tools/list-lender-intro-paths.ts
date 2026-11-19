import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_intro_paths",
  title: "List intro paths for funding sources",
  description: "Read lender_intro_paths rows (newest first) filtered by lender_id, lender_contact_id and status; paginated.",
  inputSchema: {
    lender_id: z.string().uuid().optional(), lender_contact_id: z.string().uuid().optional(),
    status: z.enum(["proposed", "confirmed", "rejected"]).optional(),
    ...pagination,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    let q = supabaseForUser(ctx).from("lender_intro_paths").select("*, master_lenders(name), lender_contacts(name)", { count: "exact" });
    if (i.lender_id) q = q.eq("lender_id", i.lender_id);
    if (i.lender_contact_id) q = q.eq("lender_contact_id", i.lender_contact_id);
    if (i.status) q = q.eq("status", i.status);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    return textResult({ intro_paths: data ?? [], ...pageInfo(i.offset, i.limit, data?.length ?? 0, count) }, { count: data?.length ?? 0, total_count: count ?? null });
  },
});
