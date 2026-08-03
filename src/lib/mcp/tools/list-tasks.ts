import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description:
    "List tasks the signed-in user can see, optionally filtered by deal, status, or assignee (assigned_to user id). Returns full row records.",
  inputSchema: {
    deal_id: z.string().uuid().optional(),
    status: z.enum(["not_started", "pending", "in_progress", "completed", "complete"]).optional(),
    assigned_to: z.string().uuid().optional().describe("User id the task is assigned to."),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, status, assigned_to, query, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, completed_at, assigned_to, assigned_by, task_type, deal_id, contact_id, crm_company_id, company_id, created_at",
      )
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (deal_id) q = q.eq("deal_id", deal_id);
    if (status) q = q.eq("status", status);
    if (assigned_to) q = q.eq("assigned_to", assigned_to);
    if (query) q = q.ilike("title", `%${query}%`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    const rows = data ?? [];
    return textResult(rows, { count: rows.length, tasks: rows });
  },
});