import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { attachmentTargetSchema, decodeBase64Bytes, resolveAttachmentTarget, storeAttachmentBytes } from "../attachmentTargets";

const EXPORT_EXT: Record<string, string> = {
  "application/vnd.google-apps.document": "docx",
  "application/vnd.google-apps.spreadsheet": "xlsx",
  "application/vnd.google-apps.presentation": "pptx",
  "application/vnd.google-apps.drawing": "pdf",
};

export default defineTool({
  name: "add_attachment_from_drive",
  title: "Attach a file from Google Drive",
  description: "Download a Google Drive file server-side through the workspace's connected Drive (the same connection the Drive data-room import uses; internal 5th Line users only) and attach it to a funding source (lender), deal, contact or company. Native Google Docs/Sheets/Slides need mime_type and are exported to docx/xlsx/pptx. 20 MB limit; skips if the same name and size is already attached.",
  inputSchema: {
    ...attachmentTargetSchema,
    file_id: z.string().trim().min(5).max(300).describe("Drive file id (or a Drive link containing it)."),
    file_name: z.string().trim().min(1).max(255).describe("Name to store, with extension (e.g. 'Lender deck.pdf')."),
    mime_type: z.string().max(200).optional().describe("Drive mimeType; required for native Google Docs/Sheets/Slides."),
    category: z.string().trim().min(1).max(100).default("general"),
    source: z.string().max(1000).optional(),
    change_reason: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ target_type, target_id, file_id, file_name, mime_type, category, source, change_reason }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const userId = ctx.getUserId();
    if (!userId) return errorResult("Caller has no user id.");
    const sb = supabaseForUser(ctx);
    try {
      const target = await resolveAttachmentTarget(sb, userId, target_type, target_id);
      const id = file_id.match(/[-\w]{20,}/)?.[0] ?? file_id;
      const { data, error } = await sb.functions.invoke("drive-folder-import", { body: { action: "download", fileId: id, mimeType: mime_type ?? "" } });
      if (error) return errorResult(`Drive download failed (file not shared with the connected Drive, or access not allowed): ${error.message}`);
      const b64 = (data as { base64?: string } | null)?.base64;
      if (!b64) return errorResult("Drive returned no file content.");
      const ext = mime_type ? EXPORT_EXT[mime_type] : undefined;
      const name = ext && !file_name.toLowerCase().endsWith(`.${ext}`) ? `${file_name}.${ext}` : file_name;
      const result = await storeAttachmentBytes(sb, userId, target, name, decodeBase64Bytes(b64), category ?? "general", "google_drive", source, change_reason);
      return textResult(result, { skipped: result.skipped });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
