import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "update_claap_meeting_match",
  title: "Update Claap funding-source match",
  description: "Confirm, reassign, or clear one Claap meeting's funding-source match after user approval. Locks the manual decision and records an atomic audit entry; preserves transcript, summary, deal and other meeting fields. Existing organizer/admin update permissions and company membership apply. Optionally change review-queue status; this does not run deal routing.",
  inputSchema: {
    meeting_id: z.string().uuid(),
    matched_lender_id: z.string().uuid().nullable().describe("Visible master_lenders.id in the meeting's company, or null to clear."),
    match_status: z.enum(["matched", "needs_review", "unmatched"]),
    reason: z.string().max(10000).optional(),
    status: z.enum(["pending_review", "routed", "excluded", "awaiting_confirmation"]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_update_claap_meeting_match", {
      p_meeting_id: input.meeting_id,
      p_matched_lender_id: input.matched_lender_id,
      p_match_status: input.match_status,
      p_reason: input.reason ?? null,
      p_status: input.status ?? null,
    });
    return error ? errorResult(error.message) : textResult(data);
  },
});