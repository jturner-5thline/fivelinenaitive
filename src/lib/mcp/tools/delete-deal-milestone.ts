import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { writeControls } from "./_milestoneFields";

export default defineTool({
  name: "delete_deal_milestone",
  title: "Delete deal milestone",
  description: "Permanently delete a dated milestone and close the position gap. Requires confirm: true; dry_run defaults true. Logged to deal activity and audit log with the deleted row.",
  inputSchema: { milestone_id: z.string().uuid(), confirm: z.literal(true), ...writeControls },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ milestone_id, expected_updated_at, dry_run }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_deal_milestone", { p_action: "delete", p_deal_id: null, p_id: milestone_id, p_payload: {}, p_expected_updated_at: expected_updated_at, p_dry_run: dry_run });
    return error ? errorResult(error.message) : textResult(data);
  },
});
