import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "list_deal_activity",
  title: "List deal activity",
  description:
    "List recent activity/timeline events — stage changes, field updates, emails, calls, notes, and other logged actions. Pass deal_id to scope to one deal, or omit it to return activity across ALL deals and pipelines the caller can see (RLS scoped). Combines activity_logs (rich events including emails) with deal_activity (structured field changes). Ordered most recent first.",
  inputSchema: {
    deal_id: z.string().uuid().optional().describe("Optional. Omit to return activity across all deals."),
    activity_type: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe("Optional activity_type filter for activity_logs (e.g. 'email', 'call', 'note', 'stage_change')."),
    since: z.string().trim().max(40).optional().describe("ISO timestamp lower bound on created_at (inclusive)."),
    until: z.string().trim().max(40).optional().describe("ISO timestamp upper bound on created_at (exclusive)."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, activity_type, since, until, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    if (deal_id) {
      const denied = await assertDealAccess(sb, ctx, deal_id, "list_deal_activity");
      if (denied) return denied;
    }
    let logsQ = sb
      .from("activity_logs")
      .select(
        "id, deal_id, activity_type, description, user_display_name, direction, subject, from_address, to_addresses, sent_at, thread_id, provider, metadata, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    let changesQ = sb
      .from("deal_activity")
      .select("id, deal_id, source, action_type, before, after, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (deal_id) {
      logsQ = logsQ.eq("deal_id", deal_id);
      changesQ = changesQ.eq("deal_id", deal_id);
    }
    if (activity_type) logsQ = logsQ.eq("activity_type", activity_type);
    if (since) {
      logsQ = logsQ.gte("created_at", since);
      changesQ = changesQ.gte("created_at", since);
    }
    if (until) {
      logsQ = logsQ.lt("created_at", until);
      changesQ = changesQ.lt("created_at", until);
    }
    const [logsRes, changesRes] = await Promise.all([logsQ, changesQ]);
    if (logsRes.error) return errorResult(logsRes.error.message);
    if (changesRes.error) return errorResult(changesRes.error.message);
    return textResult({
      scope: deal_id ? "single_deal" : "all_deals",
      activity_logs: logsRes.data ?? [],
      field_changes: changesRes.data ?? [],
    });
  },
});
