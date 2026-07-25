import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_deal_document",
  title: "Get deal document",
  description:
    "Fetch a single deal document/attachment record by id, including extracted_text when available. Use search_deal_documents first to find the id.",
  inputSchema: {
    document_id: z.string().uuid(),
    include_extracted_text: z.boolean().default(true),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ document_id, include_extracted_text }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const cols = include_extracted_text
      ? "id, deal_id, name, category, size_bytes, content_type, file_path, source, source_email_id, source_thread_id, source_subject, source_sender, extraction_status, extraction_error, extracted_text, extracted_at, created_at, user_id"
      : "id, deal_id, name, category, size_bytes, content_type, file_path, source, source_email_id, source_thread_id, source_subject, source_sender, extraction_status, extraction_error, extracted_at, created_at, user_id";
    const { data, error } = await sb.from("deal_attachments").select(cols).eq("id", document_id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Document not found or you do not have access.");
    return textResult(data);
  },
});