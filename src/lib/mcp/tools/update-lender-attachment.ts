import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, errorResult } from "../supabase";
import { LENDER_ATTACHMENT_CATEGORIES } from "../lenderAttachments";
import { writeLenderRelated, writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "update_lender_attachment", title: "Edit funding source attachment",
  description: "Rename (file_name -> lender_attachments.name) or recategorize an attachment; only supplied fields change. Does not move or replace stored bytes, file_path, size, MIME type or uploader. Existing uploader/company permissions apply; field diffs audited transactionally.",
  inputSchema: { attachment_id: z.string().uuid(), file_name: z.string().trim().min(1).max(255).optional(), category: z.enum(LENDER_ATTACHMENT_CATEGORIES).optional(), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ attachment_id, file_name, category, source, change_reason }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    const sb = supabaseForUser(ctx);
    const { data: att, error } = await sb.from("lender_attachments").select("lender_name,company_id").eq("id", attachment_id).maybeSingle();
    if (error || !att) return errorResult(error?.message ?? "Attachment not found or inaccessible.");
    const { data: lenders, error: lookup } = await sb.from("master_lenders").select("id").eq("name", att.lender_name).eq("company_id", att.company_id).limit(2);
    if (lookup || lenders?.length !== 1) return errorResult(lookup?.message ?? "Attachment lender is missing or ambiguous; resolve directory duplicates first.");
    const lender = lenders[0];
    return writeLenderRelated(sb, "lender_attachments", "update", lender.id, attachment_id, { name: file_name, category }, false, source, change_reason);
  },
});