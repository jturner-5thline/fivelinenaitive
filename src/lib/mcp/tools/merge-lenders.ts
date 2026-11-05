import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "merge_lenders", title: "Merge funding sources",
  description: "Atomic same-company merge: fill empty master fields, reparent contacts, notes, attachments and deal links, transfer audit/history with provenance, then hard-delete the merged master row. Requires confirm:true and existing lender deletion permission. Preserves stored attachment paths. Refuses duplicate deal links, two primary contacts, unique-key conflicts, inaccessible children or remaining references rather than deleting related data. All operations roll back on any failure. Does not use the legacy broad merge RPC or reconnect FLEx.",
  inputSchema: { keep_lender_id: z.string().uuid(), merge_lender_id: z.string().uuid(), confirm: z.literal(true), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ keep_lender_id, merge_lender_id, confirm, source, change_reason }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_merge_lenders", { p_keep: keep_lender_id, p_merge: merge_lender_id, p_confirm: confirm, p_source: source ?? null, p_change_reason: change_reason ?? null });
    return error ? errorResult(error.message) : textResult(data);
  },
});