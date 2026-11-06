import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { outstandingUpdateFields } from "../outstandingItemFields";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "update_outstanding_item", title: "Update Open Item",
  description: "After user approval, partially update an existing Open Item under caller RLS. Requested/Received/Submitted translate into the UI JSON state without losing requester/delivery lists. Shallow-merge provenance; append_note preserves notes with a UTC date. notes and append_note are mutually exclusive. Retire with is_archived, never delete. Returns the full row and logs MCP-attributed activity atomically; no email is sent.",
  inputSchema: { id: z.string().uuid(), ...outstandingUpdateFields },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { id, ...payload } = input;
    if (payload.notes !== undefined && payload.append_note !== undefined) return errorResult("Supply notes or append_note, not both.");
    if (!Object.keys(payload).length) return errorResult("Supply at least one field to update.");
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_outstanding_item", { p_action: "update", p_deal_id: null, p_id: id, p_payload: payload });
    return error ? errorResult(error.message) : textResult(data);
  },
});