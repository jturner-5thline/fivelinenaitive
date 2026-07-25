import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_deal_activity",
  title: "List deal activity",
  description:
    "List recent activity/timeline events for a deal — stage changes, field updates, emails, calls, notes, and other logged actions. Combines deal_activity (structured field changes) with activity_logs (rich events including emails). Returns items ordered by most recent first.",
  inputSchema: {
    deal_id: z.string().uuid(),
    activity_type: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe("Optional activity_type filter for activity_logs (e.g. 'email', 'call', 'note', 'stage_change')."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, activity_type, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let logsQ = sb
      .from("activity_logs")
      .select(
        "id, activity_type, description, user_display_name, direction, subject, from_address, to_addresses, sent_at, thread_id, provider, metadata, created_at"
      )
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (activity_type) logsQ = logsQ.eq("activity_type", activity_type);
    const [logsRes, changesRes] = await Promise.all([
      logsQ,
      sb
        .from("deal_activity")
        .select("id, source, action_type, before, after, user_id, created_at")
        .eq("deal_id", deal_id)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);
    if (logsRes.error) return errorResult(logsRes.error.message);
    if (changesRes.error) return errorResult(changesRes.error.message);
    return textResult({
      activity_logs: logsRes.data ?? [],
      field_changes: changesRes.data ?? [],
    });
  },
});