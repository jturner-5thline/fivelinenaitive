import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, errorResult } from "../supabase";
import { writeLenderRelated, writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "delete_lender_note", title: "Delete funding source note",
  description: "Delete one lender_notes row with confirm:true, preserving its previous record in lender_master_note_history and field-level lender_audit_logs atomically. Existing author/admin delete permissions apply; no deal-specific notes are touched.",
  inputSchema: { note_id: z.string().uuid(), confirm: z.literal(true), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ note_id, confirm, source, change_reason }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.from("lender_notes").select("master_lender_id").eq("id", note_id).maybeSingle();
    if (error || !data?.master_lender_id) return errorResult(error?.message ?? "Note is inaccessible or not linked to a master lender.");
    return writeLenderRelated(sb, "lender_notes", "delete", data.master_lender_id, note_id, {}, confirm, source, change_reason);
  },
});