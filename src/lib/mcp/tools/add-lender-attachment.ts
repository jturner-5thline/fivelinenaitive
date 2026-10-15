import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { logLenderAudit } from "../lenderWrites";
import {
  LENDER_ATTACHMENT_BUCKET,
  LENDER_ATTACHMENT_CATEGORIES,
  MAX_ATTACHMENT_BYTES,
  decodeBase64,
  guessContentType,
} from "../lenderAttachments";

export default defineTool({
  name: "add_lender_attachment",
  title: "Attach a document to a funding source",
  description:
    "Upload a document (NDA, one-pager, referral agreement, etc.) to a funding source's Attachments, exactly as the app's upload does. Provide the file as `content_base64` OR as a public https `url` to fetch (max 20 MB). Category 'nda' marks the funding source as having an NDA and 'marketing_materials' as having marketing materials in the app. Does not change the legacy `nda` / `referral_agreement` / `lender_one_pager_url` text columns — use `update_lender` for those. Returns the new attachment row.",
  inputSchema: {
    lender_id: z.string().uuid(),
    file_name: z.string().trim().min(1).max(255).describe("File name including extension, e.g. 'Acme NDA.pdf'."),
    category: z.enum(LENDER_ATTACHMENT_CATEGORIES).default("general"),
    content_base64: z.string().min(1).optional().describe("File bytes, base64-encoded (a data: URL prefix is accepted)."),
    url: z.string().url().optional().describe("Public https URL to download the file from."),
    content_type: z.string().max(200).optional().describe("MIME type; inferred from the file extension when omitted."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ lender_id, file_name, category, content_base64, url, content_type }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!!content_base64 === !!url) return errorResult("Provide exactly one of `content_base64` or `url`.");

    const sb = supabaseForUser(ctx);
    const { data: lender, error: lErr } = await sb.from("master_lenders").select("id, name, company_id").eq("id", lender_id).maybeSingle();
    if (lErr) return errorResult(lErr.message);
    if (!lender) return errorResult("lender_id: funding source not found (or not visible to this user).");
    if (!lender.company_id) return errorResult("lender_id: this funding source has no company, so attachments cannot be stored for it.");

    let bytes: Uint8Array;
    let type = content_type || guessContentType(file_name);
    if (content_base64) {
      try {
        bytes = decodeBase64(content_base64);
      } catch {
        return errorResult("content_base64: not valid base64.");
      }
    } else {
      if (!url!.startsWith("https://")) return errorResult("url: only https URLs are allowed.");
      let res: Response;
      try {
        res = await fetch(url!, { signal: ctx.signal, redirect: "follow" });
      } catch (e) {
        return errorResult(`url: download failed (${(e as Error).message}).`);
      }
      if (!res.ok) return errorResult(`url: download failed with HTTP ${res.status}.`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_ATTACHMENT_BYTES) return errorResult("url: file is larger than 20 MB.");
      bytes = new Uint8Array(await res.arrayBuffer());
      if (!content_type) type = res.headers.get("content-type")?.split(";")[0] || type;
    }
    if (bytes.byteLength === 0) return errorResult("File is empty.");
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return errorResult("File is larger than 20 MB.");

    const userId = ctx.getUserId();
    if (!userId) throw new ToolError("Caller has no user id.");
    const ext = (file_name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "") || "bin";
    const storedName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = `${userId}/${lender.name}/${storedName}`;

    const { error: upErr } = await sb.storage.from(LENDER_ATTACHMENT_BUCKET).upload(filePath, bytes, { contentType: type });
    if (upErr) return errorResult(`Storage upload failed: ${upErr.message}`);

    const { data: row, error: dbErr } = await sb
      .from("lender_attachments")
      .insert({
        user_id: userId,
        company_id: lender.company_id,
        lender_name: lender.name,
        name: file_name,
        file_path: filePath,
        content_type: type,
        size_bytes: bytes.byteLength,
        category,
      })
      .select("*")
      .maybeSingle();
    if (dbErr || !row) {
      await sb.storage.from(LENDER_ATTACHMENT_BUCKET).remove([filePath]);
      return errorResult(`Attachment record failed: ${dbErr?.message ?? "permission denied"}`);
    }

    await logLenderAudit(sb, ctx, lender_id, "attachment_added", null, { attachment: file_name }, ["attachment"], {
      via: "mcp:add_lender_attachment",
      attachment_id: row.id,
      category,
    });

    return textResult({ attachment: row }, { attachment_id: row.id as string, lender_id });
  },
});
