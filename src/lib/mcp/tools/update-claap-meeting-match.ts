import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

const item = z.object({
  meeting_id: z.string().uuid(),
  matched_lender_id: z.string().uuid().nullable().describe("Visible master_lenders.id in the meeting's company, or null to clear."),
  match_status: z.enum(["matched", "needs_review", "unmatched"]),
  reason: z.string().max(10000).optional(),
  status: z.enum(["pending_review", "routed", "excluded", "awaiting_confirmation"]).optional(),
}).strict();

export default defineTool({
  name: "update_claap_meeting_match",
  title: "Update Claap funding-source match",
  description: "Confirm, reassign, or clear Claap meeting funding-source matches after user approval — one meeting via top-level fields, or up to 25 via `updates` (each applied in its own transaction with an independent result). Locks the manual decision and records an atomic audit entry; preserves transcript, summary, deal and other meeting fields. Existing organizer/admin update permissions and company membership apply. Optionally change review-queue status; this does not run deal routing.",
  inputSchema: {
    meeting_id: z.string().uuid().optional(),
    matched_lender_id: z.string().uuid().nullable().optional(),
    match_status: z.enum(["matched", "needs_review", "unmatched"]).optional(),
    reason: z.string().max(10000).optional(),
    status: z.enum(["pending_review", "routed", "excluded", "awaiting_confirmation"]).optional(),
    updates: z.array(item).min(1).max(25).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const { updates, ...single } = input;
    if (updates && single.meeting_id) return errorResult("Provide either updates or a single meeting_id, not both.");
    if (!updates && (!single.meeting_id || single.matched_lender_id === undefined || !single.match_status)) {
      return errorResult("meeting_id, matched_lender_id and match_status are required (or pass updates).");
    }
    const sb = supabaseForUser(ctx);
    const list = updates ?? [single as z.infer<typeof item>];
    const results = [];
    for (const u of list) {
      const { data, error } = await sb.rpc("mcp_update_claap_meeting_match", {
        p_meeting_id: u.meeting_id, p_matched_lender_id: u.matched_lender_id, p_match_status: u.match_status,
        p_reason: u.reason ?? null, p_status: u.status ?? null,
      });
      if (!updates) return error ? errorResult(error.message) : textResult(data);
      results.push(error ? { meeting_id: u.meeting_id, success: false, error: error.message } : { meeting_id: u.meeting_id, success: true, result: data });
    }
    const failed = results.filter((r) => !r.success).length;
    return textResult({ total: results.length, succeeded: results.length - failed, failed, results }, { failed });
  },
});
