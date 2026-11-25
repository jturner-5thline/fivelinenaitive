import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, withStageLabels } from "../supabase";

export default defineTool({
  name: "list_milestones",
  title: "List milestones across deals",
  description: "Dated milestones across every deal the user can see, ordered by due_date, with deal name, stage and stage_label. Filter by due_date range (from inclusive, to exclusive), completed, pipeline_id, owner_email (substring of deal_owner). Paginate with limit/offset; response has total_count, next_offset, has_more.",
  inputSchema: {
    from: z.string().trim().max(40).optional(), to: z.string().trim().max(40).optional(),
    completed: z.boolean().optional(), pipeline_id: z.string().uuid().optional(),
    owner_email: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(1000).default(200), offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, completed, pipeline_id, owner_email, limit, offset }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const sb = supabaseForUser(ctx);
    let q = sb.from("deal_milestones")
      .select("id, deal_id, title, due_date, completed, completed_at, status, position, updated_at, deals!inner(company, stage, pipeline_id, deal_owner)", { count: "exact" })
      .order("due_date", { ascending: true, nullsFirst: false }).order("id").range(offset, offset + limit - 1);
    if (from) q = q.gte("due_date", from);
    if (to) q = q.lt("due_date", to);
    if (completed !== undefined) q = q.eq("completed", completed);
    if (pipeline_id) q = q.eq("deals.pipeline_id", pipeline_id);
    if (owner_email) q = q.ilike("deals.deal_owner", `%${owner_email}%`);
    const { data, error, count } = await q;
    if (error) return errorResult(error.message);
    type Row = { deals: { company: string | null; stage: string | null; pipeline_id: string | null; deal_owner: string | null } | null } & Record<string, unknown>;
    const flat = ((data ?? []) as unknown as Row[]).map(({ deals, ...m }) => ({ ...m, deal_name: deals?.company ?? null, stage: deals?.stage ?? null, pipeline_id: deals?.pipeline_id ?? null, deal_owner: deals?.deal_owner ?? null }));
    const rows = await withStageLabels(sb, flat);
    const total = count ?? rows.length;
    return textResult({ total_count: total, returned: rows.length, next_offset: offset + rows.length, has_more: offset + rows.length < total, milestones: rows });
  },
});
