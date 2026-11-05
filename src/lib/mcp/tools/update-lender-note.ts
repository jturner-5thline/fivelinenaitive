import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, errorResult } from "../supabase";
import { writeLenderRelated, writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "update_lender_note", title: "Edit funding source note",
  description: "Update only supplied lender_notes body, tags, is_flag. Author-only RLS remains. Atomically preserves prior record in lender_master_note_history and audits every field. lender_notes_history is deal-specific and is NOT used for directory notes.",
  inputSchema: { note_id: z.string().uuid(), body: z.string().min(1).max(20000).optional(), tags: z.array(z.string().max(200)).max(100).optional(), is_flag: z.boolean().optional(), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ note_id, source, change_reason, ...patch }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.from("lender_notes").select("master_lender_id").eq("id", note_id).maybeSingle();
    if (error || !data?.master_lender_id) return errorResult(error?.message ?? "Note is inaccessible or not linked to a master lender.");
    return writeLenderRelated(sb, "lender_notes", "update", data.master_lender_id, note_id, patch, false, source, change_reason);
  },
});