import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, withStageLabels, resolveStageInput } from "../supabase";

export default defineTool({
  name: "list_deals",
  title: "List deals",
  description:
    "List EVERY deal the signed-in user can see, across ALL pipelines. No implicit pipeline, owner, stage, or status filter is applied — results are only narrowed by the filters you pass explicitly. Returns full row records plus pipeline metadata: id, company, stage (raw pipeline-scoped stage id), stage_label (the human stage name from the deal's assigned pipeline — ALWAYS report this, never the raw id, because stage ids are overloaded across pipelines), pipeline_id, pipeline_name, value, closing_date, created_at, deal_owner, manager, status, updated_at. Pagination: pass `limit` and `offset`; the response includes `total_count` (matching rows regardless of limit), `returned`, `next_offset`, and `has_more` — keep calling with `next_offset` until `has_more` is false to walk the entire set across all pipelines. The response also includes `pipeline_breakdown` (distinct pipelines present in this page) so you can confirm coverage.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).optional().describe("Substring search across the company / deal name."),
    stage: z.string().trim().min(1).max(100).optional().describe("Stage id (e.g. 'nda-needs-list') or the stage's display label; requires pipeline_id when passing a label."),
    pipeline_id: z.string().uuid().optional().describe("Optional. Omit to include deals from every pipeline."),
    status: z.string().trim().min(1).max(60).optional(),
    owner_email: z.string().trim().min(1).max(200).optional().describe("Optional substring match on deal_owner."),
    created_from: z.string().trim().max(40).optional().describe("ISO date/timestamp lower bound on created_at (inclusive)."),
    created_to: z.string().trim().max(40).optional().describe("ISO date/timestamp upper bound on created_at (exclusive)."),
    closing_from: z.string().trim().max(40).optional().describe("ISO date lower bound on closing_date (inclusive)."),
    closing_to: z.string().trim().max(40).optional().describe("ISO date upper bound on closing_date (exclusive)."),
    limit: z.number().int().min(1).max(1000).default(200),
    offset: z.number().int().min(0).default(0).describe("Row offset for pagination; use `next_offset` from the previous response."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { query, stage, pipeline_id, status, owner_email, created_from, created_to, closing_from, closing_to, limit, offset },
    ctx,
  ) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const stageFilter = stage ? await resolveStageInput(sb, pipeline_id, stage) : undefined;

    // Stable ordering is required for correct cursoring across the whole set.
    let q = sb
      .from("deals")
      .select(
        "id, company, stage, status, value, closing_date, created_at, pipeline_id, deal_owner, manager, updated_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (stageFilter) q = q.eq("stage", stageFilter);
    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
    if (status) q = q.eq("status", status);
    if (owner_email) q = q.ilike("deal_owner", `%${owner_email}%`);
    if (query) q = q.ilike("company", `%${query}%`);
    if (created_from) q = q.gte("created_at", created_from);
    if (created_to) q = q.lt("created_at", created_to);
    if (closing_from) q = q.gte("closing_date", closing_from);
    if (closing_to) q = q.lt("closing_date", closing_to);

    const { data, error, count } = await q;
    if (error) return errorResult(error.message);
    const rows = await withStageLabels(sb, data ?? []);

    const breakdown = new Map<string, { pipeline_id: string | null; pipeline_name: string | null; deals: number }>();
    for (const r of rows) {
      const key = r.pipeline_id ?? "none";
      const entry = breakdown.get(key) ?? { pipeline_id: r.pipeline_id ?? null, pipeline_name: r.pipeline_name ?? null, deals: 0 };
      entry.deals += 1;
      breakdown.set(key, entry);
    }

    const total_count = count ?? rows.length;
    const next = offset + rows.length;
    const has_more = next < total_count;

    const payload = {
      total_count,
      returned: rows.length,
      offset,
      next_offset: has_more ? next : null,
      has_more,
      pipeline_breakdown: Array.from(breakdown.values()).sort((a, b) => b.deals - a.deals),
      deals: rows,
    };
    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
