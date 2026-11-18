import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { calendarDate, calendarTime, calendarType, calendarTitle, calendarNotes } from "../dealCalendarFields";

export default defineTool({
  name: "add_deal_calendar_item",
  title: "Add deal calendar item",
  description: "Add an item to a deal's Deal Calendar as the signed-in user (time is Central). idempotency_key returns the existing item with created:false instead of duplicating. Logs an MCP activity entry.",
  inputSchema: {
    deal_id: z.string().uuid(),
    title: calendarTitle,
    date: calendarDate,
    time: calendarTime.optional(),
    type: calendarType.default("note"),
    notes: calendarNotes.optional(),
    idempotency_key: z.string().trim().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ deal_id, ...payload }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_deal_calendar_item", { p_action: "create", p_deal_id: deal_id, p_id: null, p_payload: payload });
    return error ? errorResult(error.message) : textResult(data);
  },
});
