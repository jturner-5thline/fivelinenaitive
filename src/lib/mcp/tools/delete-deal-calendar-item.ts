import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "delete_deal_calendar_item",
  title: "Delete deal calendar item",
  description: "Permanently delete a Deal Calendar item by id. Requires confirm: true. Logs an MCP activity entry with the deleted row.",
  inputSchema: { id: z.string().uuid(), confirm: z.literal(true) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_deal_calendar_item", { p_action: "delete", p_deal_id: null, p_id: id, p_payload: {} });
    return error ? errorResult(error.message) : textResult(data);
  },
});
