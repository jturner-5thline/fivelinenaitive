import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, withStageLabels, resolveStageInput } from "../supabase";

export default defineTool({
  name: "list_deals",
  title: "List deals",
  description:
    "List the naitive deals the signed-in user can see, returning full row records (not just a count). Optionally filter by stage, pipeline_id, a text query against the company/deal name, or a created_at/closing_date window (use created_from/created_to for questions like 'deals created in August'). Returns id, company, stage (the raw pipeline-scoped stage id), stage_label (the human stage name from the deal's assigned pipeline \u2014 ALWAYS report this to users, never the raw id, because stage ids are overloaded across pipelines, e.g. 'agreement-pending' is labelled 'Deal Had to be Benched' in the In Development pipeline), pipeline_name, value, closing_date, created_at, pipeline_id, deal_owner, manager, status, updated_at.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).optional().describe("Substring search across the company / deal name."),
    stage: z.string().trim().min(1).max(100).optional().describe("Stage id (e.g. 'nda-needs-list') or the stage's display label; requires pipeline_id when passing a label."),
    pipeline_id: z.string().uuid().optional(),
    created_from: z.string().trim().max(40).optional().describe("ISO date/timestamp lower bound on created_at (inclusive)."),
    created_to: z.string().trim().max(40).optional().describe("ISO date/timestamp upper bound on created_at (exclusive)."),
    closing_from: z.string().trim().max(40).optional().describe("ISO date lower bound on closing_date (inclusive)."),
    closing_to: z.string().trim().max(40).optional().describe("ISO date upper bound on closing_date (exclusive)."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, stage, pipeline_id, created_from, created_to, closing_from, closing_to, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("deals")
      .select(
        "id, company, stage, status, value, closing_date, created_at, pipeline_id, deal_owner, manager, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);
    const stageFilter = stage ? await resolveStageInput(sb, pipeline_id, stage) : undefined;
    if (stageFilter) q = q.eq("stage", stageFilter);
    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
    if (query) q = q.ilike("company", `%${query}%`);
    if (created_from) q = q.gte("created_at", created_from);
    if (created_to) q = q.lt("created_at", created_to);
    if (closing_from) q = q.gte("closing_date", closing_from);
    if (closing_to) q = q.lt("closing_date", closing_to);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    const rows = await withStageLabels(sb, data ?? []);
    return textResult(rows, { count: rows.length, deals: rows });
  },
});