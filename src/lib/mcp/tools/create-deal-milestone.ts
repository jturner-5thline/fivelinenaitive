import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { milestoneTitle, milestoneDueDate, milestoneStatus, milestonePosition, writeControls } from "./_milestoneFields";

export default defineTool({
  name: "create_deal_milestone",
  title: "Create deal milestone",
  description: "Add a dated milestone to a deal. Appends to the end unless position (0-based) is given; other milestones shift to keep positions unique. dry_run defaults true. Logged to deal activity and audit log. Returns the row.",
  inputSchema: { deal_id: z.string().uuid(), title: milestoneTitle, due_date: milestoneDueDate.optional(), status: milestoneStatus.optional(), position: milestonePosition.optional(), dry_run: writeControls.dry_run },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ deal_id, dry_run, ...rest }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const payload = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_deal_milestone", { p_action: "create", p_deal_id: deal_id, p_id: null, p_payload: payload, p_dry_run: dry_run });
    return error ? errorResult(error.message) : textResult(data);
  },
});
