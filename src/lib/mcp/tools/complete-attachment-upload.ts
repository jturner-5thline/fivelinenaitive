import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { checkFile, createAttachmentRow, decodeUploadToken, deleteAttachmentRow, findDuplicateAttachment, resolveAttachmentTarget } from "../attachmentTargets";

export default defineTool({
  name: "complete_attachment_upload",
  title: "Complete attachment upload",
  description: "Step 2 of the two-step upload: pass the upload_token from create_attachment_upload_url after PUTting the file. Verifies the file is in storage with the declared size, then creates the attachment record on the lender/deal/contact/company (lender attachments are audited with source/change_reason). Skips if the same name and size is already attached.",
  inputSchema: { upload_token: z.string().min(10).max(4000), source: z.string().max(1000).optional(), change_reason: z.string().max(2000).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ upload_token, source, change_reason }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const userId = ctx.getUserId();
    if (!userId) return errorResult("Caller has no user id.");
    const sb = supabaseForUser(ctx);
    try {
      const tok = decodeUploadToken(upload_token);
      if (tok.exp < Date.now() - 3600_000) return errorResult("upload_token has expired; request a new upload URL.");
      const target = await resolveAttachmentTarget(sb, userId, tok.t, tok.id);
      // Tokens are not trusted: the path must sit in this caller's folder for this exact record.
      if (!tok.p.startsWith(`${target.folder}/`) || tok.p.includes("..") || tok.p.split("/").length !== target.folder.split("/").length + 1) {
        return errorResult("upload_token does not match this user or record.");
      }
      const { contentType } = checkFile(tok.n, tok.s);
      const dup = await findDuplicateAttachment(sb, target, tok.n, tok.s);
      if (dup) {
        await sb.storage.from(target.bucket).remove([tok.p]);
        return textResult({ skipped: true, reason: "A file with the same name and size is already attached to this record.", existing_attachment: dup }, { skipped: true });
      }
      const row = await createAttachmentRow(sb, userId, target, { name: tok.n, path: tok.p, size: tok.s, contentType, category: tok.c, source, changeReason: change_reason, origin: "mcp_upload" });
      // Verify the object now that the row grants read access; roll back on mismatch.
      const fileName = tok.p.split("/").pop() as string;
      const { data: listed, error: lErr } = await sb.storage.from(target.bucket).list(target.folder, { search: fileName, limit: 5 });
      const obj = (listed ?? []).find((o) => o.name === fileName);
      const actual = Number((obj?.metadata as { size?: number } | undefined)?.size ?? NaN);
      if (lErr || !obj || actual !== tok.s) {
        await deleteAttachmentRow(sb, target, String(row.id));
        if (obj) await sb.storage.from(target.bucket).remove([tok.p]);
        return errorResult(!obj ? "The file was not found in storage. PUT the bytes to upload_url first, then call this again." : `Uploaded size ${actual} does not match declared size ${tok.s}; nothing was attached.`);
      }
      return textResult({ skipped: false, attachment: row }, { attachment_id: String(row.id) });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
