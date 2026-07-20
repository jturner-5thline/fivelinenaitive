import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_deals",
  title: "List deals",
  description:
    "List the naitive deals the signed-in user can see. Optionally filter by stage, pipeline_id, or a text query against the company/deal name. Returns id, company, stage, value, closing_date, pipeline_id, deal_owner, updated_at.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).optional().describe("Substring search across the company / deal name."),
    stage: z.string().trim().min(1).max(100).optional().describe("Exact stage id (e.g. 'nda-needs-list', 'on-deck')."),
    pipeline_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, stage, pipeline_id, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("deals")
      .select("id, company, stage, value, closing_date, pipeline_id, deal_owner, manager, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (stage) q = q.eq("stage", stage);
    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
    if (query) q = q.ilike("company", `%${query}%`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});