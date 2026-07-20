import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description: "List tasks the signed-in user can see, optionally filtered by deal, status, or assignee.",
  inputSchema: {
    deal_id: z.string().uuid().optional(),
    status: z.enum(["not_started", "in_progress", "completed", "blocked", "cancelled"]).optional(),
    assignee: z.string().trim().max(200).optional(),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, status, assignee, query, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("tasks")
      .select("id, title, description, status, priority, due_date, assignee, deal_id, contact_id, company_id, created_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (deal_id) q = q.eq("deal_id", deal_id);
    if (status) q = q.eq("status", status);
    if (assignee) q = q.ilike("assignee", `%${assignee}%`);
    if (query) q = q.ilike("title", `%${query}%`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});