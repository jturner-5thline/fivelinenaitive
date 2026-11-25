import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { milestoneTitle, milestoneDueDate, milestoneStatus, milestonePosition, writeControls } from "./_milestoneFields";

export default defineTool({
  name: "update_deal_milestone",
  title: "Update deal milestone",
  description: "Edit a dated milestone. Only passed fields change; null clears due_date or status. completed=true stamps completed_at now (kept if already complete); completed=false clears it. position moves it and renumbers the rest. dry_run defaults true; expected_updated_at returns a conflict with the current row if stale. Returns the row.",
  inputSchema: { milestone_id: z.string().uuid(), title: milestoneTitle.optional(), due_date: milestoneDueDate.nullable().optional(), status: milestoneStatus.nullable().optional(), position: milestonePosition.optional(), completed: z.boolean().optional(), ...writeControls },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ milestone_id, expected_updated_at, dry_run, ...rest }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const payload = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (!Object.keys(payload).length) return errorResult("Provide at least one field to update.");
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_deal_milestone", { p_action: "update", p_deal_id: null, p_id: milestone_id, p_payload: payload, p_expected_updated_at: expected_updated_at, p_dry_run: dry_run });
    return error ? errorResult(error.message) : textResult(data);
  },
});
