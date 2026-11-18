import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "update_claap_meeting_deal",
  title: "Change or clear a Claap meeting's deal link",
  description: "After user approval, set claap_meetings.deal_id to another deal in the meeting's workspace, or pass deal_id null to unlink. Locks the decision against auto-routing, moves the deal recording/transcript links to match, and records an audit entry. Organizer/admin update permissions apply; funding-source match is unchanged.",
  inputSchema: {
    meeting_id: z.string().uuid(),
    deal_id: z.string().uuid().nullable().describe("Target deals.id in the same workspace, or null to clear the link."),
    reason: z.string().max(10000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ meeting_id, deal_id, reason }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.rpc("mcp_update_claap_meeting_deal", {
      p_meeting_id: meeting_id, p_deal_id: deal_id, p_reason: reason ?? null,
    } as never);
    return error ? errorResult(error.message) : textResult(data);
  },
});
