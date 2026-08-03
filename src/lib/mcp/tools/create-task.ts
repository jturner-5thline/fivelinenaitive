import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description: "Create a task, optionally tied to a deal, contact, or company. Returns the created row.",
  inputSchema: {
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).optional(),
    due_date: z.string().nullable().optional().describe("ISO date."),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assigned_to: z.string().uuid().optional().describe("User id to assign the task to."),
    deal_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    company_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const row: Record<string, unknown> = {
      title: input.title,
      status: "not_started",
      created_by: ctx.getUserId(),
    };
    for (const k of ["description", "due_date", "priority", "assigned_to", "deal_id", "contact_id", "company_id"] as const) {
      if (input[k] !== undefined) row[k] = input[k];
    }
    const { data, error } = await sb.from("tasks").insert(row).select().maybeSingle();
    if (error) return errorResult(error.message);
    return textResult(data, { task_id: data?.id });
  },
});