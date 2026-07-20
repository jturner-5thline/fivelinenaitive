import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "complete_task",
  title: "Complete task",
  description: "Mark a task as completed.",
  inputSchema: { task_id: z.string().uuid() },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task_id)
      .select()
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Task not found or not accessible.");
    return textResult(data);
  },
});