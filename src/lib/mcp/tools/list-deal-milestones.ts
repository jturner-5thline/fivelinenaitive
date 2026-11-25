import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_deal_milestones",
  title: "List deal milestones",
  description: "List a deal's dated milestones ordered by position (id, title, due_date, completed, completed_at, status, position, updated_at). Use updated_at as expected_updated_at for edits.",
  inputSchema: { deal_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).from("deal_milestones")
      .select("id, title, due_date, completed, completed_at, status, position, updated_at")
      .eq("deal_id", deal_id).order("position").order("created_at");
    return error ? errorResult(error.message) : textResult({ deal_id, milestones: data ?? [] });
  },
});
