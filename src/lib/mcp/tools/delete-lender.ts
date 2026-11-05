import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "delete_lender", title: "Archive funding source",
  description: "SOFT DELETE: set master_lenders.active=false, preserving contacts, notes, attachments, deal links and audit history. Requires confirm:true and existing lender deletion permission. Refuses deal-linked lenders unless force:true (still preserves links). Never hard deletes or removes stored files. Field diff audited atomically.",
  inputSchema: { lender_id: z.string().uuid(), confirm: z.literal(true), force: z.boolean().default(false), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ lender_id, confirm, force, source, change_reason }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_archive_lender", { p_lender_id: lender_id, p_confirm: confirm, p_force: force, p_source: source ?? null, p_change_reason: change_reason ?? null });
    return error ? errorResult(error.message) : textResult(data);
  },
});