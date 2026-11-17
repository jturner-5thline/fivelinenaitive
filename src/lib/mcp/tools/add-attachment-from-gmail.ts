import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { attachmentTargetSchema, decodeBase64Bytes, resolveAttachmentTarget, storeAttachmentBytes } from "../attachmentTargets";

type GmailAttachment = { id?: string; attachment_id?: string; filename?: string; name?: string; size?: number };

function collectAttachments(value: unknown, out: GmailAttachment[] = []): GmailAttachment[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) { for (const v of value) collectAttachments(v, out); return out; }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "attachments" && Array.isArray(v)) out.push(...(v as GmailAttachment[]));
    else if (v && typeof v === "object") collectAttachments(v, out);
  }
  return out;
}

export default defineTool({
  name: "add_attachment_from_gmail",
  title: "Attach a file from Gmail",
  description: "Fetch an email attachment server-side through the signed-in user's existing connected mailbox and attach it to a funding source (lender), deal, contact or company. Identify the attachment by attachment_id, or by file_name (looked up on the message). 20 MB limit; skips if the same name and size is already attached to that record.",
  inputSchema: {
    ...attachmentTargetSchema,
    message_id: z.string().trim().min(1).max(500),
    attachment_id: z.string().trim().min(1).max(1000).optional(),
    file_name: z.string().trim().min(1).max(255).optional().describe("Attachment file name on the message; also used as the stored name."),
    category: z.string().trim().min(1).max(100).default("correspondence"),
    source: z.string().max(1000).optional(),
    change_reason: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ target_type, target_id, message_id, attachment_id, file_name, category, source, change_reason }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    if (!attachment_id && !file_name) return errorResult("Provide attachment_id or file_name.");
    const userId = ctx.getUserId();
    if (!userId) return errorResult("Caller has no user id.");
    const sb = supabaseForUser(ctx);
    try {
      const target = await resolveAttachmentTarget(sb, userId, target_type, target_id);
      let attId = attachment_id;
      let name = file_name;
      if (!attId || !name) {
        const { data, error } = await sb.functions.invoke("gmail-messages", { body: { action: "get", message_id } });
        if (error) return errorResult(`Could not read the email (is Gmail connected?): ${error.message}`);
        const atts = collectAttachments(data);
        const hit = atts.find((a) => (attId ? (a.id ?? a.attachment_id) === attId : (a.filename ?? a.name ?? "").toLowerCase() === String(name).toLowerCase()));
        if (!hit) return errorResult(`Attachment not found on the message. Available: ${atts.map((a) => a.filename ?? a.name).filter(Boolean).join(", ") || "none"}`);
        attId = String(hit.id ?? hit.attachment_id);
        name = name ?? String(hit.filename ?? hit.name ?? "attachment");
      }
      const { data, error } = await sb.functions.invoke("gmail-messages", { body: { action: "get_attachment", message_id, attachment_id: attId } });
      if (error) return errorResult(`Download failed: ${error.message}`);
      const b64 = (data as { data?: string } | null)?.data;
      if (!b64) return errorResult("The mailbox returned no file content.");
      const result = await storeAttachmentBytes(sb, userId, target, String(name), decodeBase64Bytes(b64), category ?? "correspondence", "gmail", source, change_reason);
      return textResult(result, { skipped: result.skipped });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
