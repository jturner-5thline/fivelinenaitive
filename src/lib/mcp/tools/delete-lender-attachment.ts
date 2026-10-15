import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { logLenderAudit } from "../lenderWrites";
import { LENDER_ATTACHMENT_BUCKET } from "../lenderAttachments";

export default defineTool({
  name: "delete_lender_attachment",
  title: "Delete a funding source attachment",
  description:
    "Permanently delete one funding source attachment (file and record). Requires `confirm: true`. Only the person who uploaded a file can delete it (same rule as the app).",
  inputSchema: {
    attachment_id: z.string().uuid(),
    confirm: z.literal(true).describe("Must be true to confirm the permanent deletion."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ attachment_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data: att, error } = await sb.from("lender_attachments").select("*").eq("id", attachment_id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!att) return errorResult("attachment_id: attachment not found (or not visible to this user).");
    if (att.user_id !== ctx.getUserId()) return errorResult("attachment_id: only the user who uploaded this file can delete it.");

    const { data: deleted, error: delErr } = await sb.from("lender_attachments").delete().eq("id", attachment_id).select("id");
    if (delErr) return errorResult(delErr.message);
    if (!deleted?.length) return errorResult("Delete was blocked by permissions.");
    const { error: stErr } = await sb.storage.from(LENDER_ATTACHMENT_BUCKET).remove([att.file_path]);

    let lq = sb.from("master_lenders").select("id").eq("name", att.lender_name).limit(1);
    if (att.company_id) lq = lq.eq("company_id", att.company_id);
    const { data: lender } = await lq.maybeSingle();
    if (lender?.id) {
      await logLenderAudit(sb, ctx, lender.id, "attachment_deleted", { attachment: att.name }, { attachment: null }, ["attachment"], {
        via: "mcp:delete_lender_attachment",
        attachment_id,
        category: att.category,
      });
    }

    return textResult(
      { deleted: true, attachment: att, storage_warning: stErr ? stErr.message : null },
      { attachment_id, deleted: true },
    );
  },
});
