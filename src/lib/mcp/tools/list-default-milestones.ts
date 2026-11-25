import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_default_milestones",
  title: "List default milestone templates",
  description: "Read-only milestone templates for the user's workspace(s): title, timing_type, days_from_creation, trigger_stage, days_from_stage, position.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).from("default_milestones")
      .select("id, company_id, title, timing_type, days_from_creation, trigger_stage, days_from_stage, position").order("company_id").order("position");
    return error ? errorResult(error.message) : textResult({ templates: data ?? [] });
  },
});
