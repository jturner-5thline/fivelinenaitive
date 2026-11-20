import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "merge_lenders", title: "Merge funding sources",
  description: "Atomic same-company merge: fill empty master fields, reparent contacts, notes, attachments and deal links, transfer audit/history with provenance, then hard-delete the merged master row. Requires confirm:true and existing lender deletion permission. Preserves stored attachment paths. Also moves engagements, intro paths, outside deal history, lender stage events, CRM company owners and performance history (merged_from set; the merged current score is deleted); unique-key collisions keep the kept lender row. Duplicate deal links keep the kept row, append the merged pass_reason/notes prefixed 'From merged record:' and remove the merged row. Refuses two primary contacts, unique-key conflicts, inaccessible children or remaining references rather than deleting related data. All operations roll back on any failure. dry_run: true previews the merge (fields filled, children moved, blocking conflicts) by running it in a rolled-back transaction. Does not use the legacy broad merge RPC or reconnect FLEx.",
  inputSchema: { keep_lender_id: z.string().uuid(), merge_lender_id: z.string().uuid(), dry_run: z.boolean().default(false).describe("Preview only: report fields that would fill on the kept lender, child records that would move, and any conflict that would block the merge. Nothing is changed."), confirm: z.literal(true).optional().describe("Required for the real merge (not for dry_run)."), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ keep_lender_id, merge_lender_id, dry_run, confirm, source, change_reason }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    if (keep_lender_id === merge_lender_id) return errorResult("keep_lender_id and merge_lender_id must differ.");
    if (dry_run) {
      const { data, error } = await supabaseForUser(ctx).rpc("mcp_merge_lenders_preview", { p_keep: keep_lender_id, p_merge: merge_lender_id });
      return error ? errorResult(error.message) : textResult(data);
    }
    if (confirm !== true) return errorResult("confirm: true is required to merge (or pass dry_run: true to preview).");
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_merge_lenders", { p_keep: keep_lender_id, p_merge: merge_lender_id, p_confirm: confirm, p_source: source ?? null, p_change_reason: change_reason ?? null });
    return error ? errorResult(error.message) : textResult(data);
  },
});