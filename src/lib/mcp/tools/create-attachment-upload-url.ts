import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { attachmentTargetSchema, checkFile, encodeUploadToken, findDuplicateAttachment, resolveAttachmentTarget, storedFileName } from "../attachmentTargets";
import { MAX_ATTACHMENT_BYTES } from "../lenderAttachments";

export default defineTool({
  name: "create_attachment_upload_url",
  title: "Create attachment upload URL",
  description: "Step 1 of a two-step upload for real files (PDFs, decks, spreadsheets) up to 20 MB, for a funding source (lender), deal, contact or company. Returns a short-lived signed `upload_url` (HTTP PUT the raw file bytes with the given Content-Type, valid ~2 hours) and an `upload_token`. Then call complete_attachment_upload with the token to create the attachment record. If a file with the same name and size is already attached to that record, nothing is created and the existing attachment is returned.",
  inputSchema: {
    ...attachmentTargetSchema,
    file_name: z.string().trim().min(1).max(255).describe("File name with extension, e.g. 'Acme term sheet.pdf'."),
    size_bytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES).describe("Exact file size in bytes; verified when the upload is completed."),
    content_type: z.string().max(200).optional().describe("Informational; the stored type is derived from the extension."),
    category: z.string().trim().min(1).max(100).default("general").describe("Attachment category (see list_field_options lender_attachments.category for lenders)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ target_type, target_id, file_name, size_bytes, category }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const userId = ctx.getUserId();
    if (!userId) return errorResult("Caller has no user id.");
    const sb = supabaseForUser(ctx);
    try {
      const { contentType } = checkFile(file_name, size_bytes);
      const target = await resolveAttachmentTarget(sb, userId, target_type, target_id);
      const dup = await findDuplicateAttachment(sb, target, file_name, size_bytes);
      if (dup) return textResult({ skipped: true, reason: "A file with the same name and size is already attached to this record.", existing_attachment: dup }, { skipped: true });
      const path = `${target.folder}/${storedFileName(file_name)}`;
      const { data, error } = await sb.storage.from(target.bucket).createSignedUploadUrl(path);
      if (error || !data) return errorResult(`Could not create upload URL: ${error?.message ?? "unknown error"}`);
      const upload_token = encodeUploadToken({ v: 1, t: target_type, id: target_id, p: path, n: file_name, s: size_bytes, c: category ?? "general", exp: Date.now() + 2 * 3600_000 });
      return textResult({
        upload_url: data.signedUrl, method: "PUT", headers: { "Content-Type": contentType }, upload_token,
        expires_in_seconds: 7200, next_step: "PUT the file bytes to upload_url, then call complete_attachment_upload with upload_token.",
      }, { skipped: false });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
