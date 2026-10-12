import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { writeDealStatusNote } from "../statusNotes";

export default defineTool({
  name: "add_deal_status_note",
  title: "Add deal status note",
  description: "Add or replace the status note on a deal (the Status Note box on the deal page).",
  inputSchema: {
    deal_id: z.string().uuid(),
    note: z.string().trim().min(1, "Note cannot be empty.").max(2000),
    mode: z.enum(["prepend", "append", "replace"]).default("prepend").describe("prepend (default) keeps history below a blank line; replace overwrites."),
    source: z.string().trim().min(1).max(100).default("Claude deal-update").describe("Attribution recorded in the activity log."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ deal_id, note, mode, source }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const res = await writeDealStatusNote(supabaseForUser(ctx), ctx, deal_id, note, mode, source);
    if ("error" in res) return errorResult(res.error);
    return textResult(res, { deal_id: res.deal_id, notes_updated_at: res.notes_updated_at });
  },
});
