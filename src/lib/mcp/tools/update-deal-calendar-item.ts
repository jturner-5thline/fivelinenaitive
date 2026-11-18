import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { calendarDate, calendarTime, calendarType, calendarTitle, calendarNotes } from "../dealCalendarFields";

export default defineTool({
  name: "update_deal_calendar_item",
  title: "Update deal calendar item",
  description: "Edit a Deal Calendar item by id (title, date, time in Central, type, notes). Pass time or notes as null to clear. Logs an MCP activity entry.",
  inputSchema: {
    id: z.string().uuid(),
    title: calendarTitle.optional(),
    date: calendarDate.optional(),
    time: calendarTime.nullable().optional(),
    type: calendarType.optional(),
    notes: calendarNotes.nullable().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...rest }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const payload = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v ?? ""]));
    if (Object.keys(payload).length === 0) return errorResult("Provide at least one field to update.");
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_write_deal_calendar_item", { p_action: "update", p_deal_id: null, p_id: id, p_payload: payload });
    return error ? errorResult(error.message) : textResult(data);
  },
});
