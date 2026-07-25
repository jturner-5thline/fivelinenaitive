import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "search_deal_documents",
  title: "Search deal documents",
  description:
    "Search files/documents attached to a specific deal (virtual data room). Optionally filter by name, category, or a text query against name/source_subject/extracted_text. Returns id, name, category, size_bytes, content_type, source, source_subject, created_at.",
  inputSchema: {
    deal_id: z.string().uuid(),
    query: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, query, category, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("deal_attachments")
      .select(
        "id, deal_id, name, category, size_bytes, content_type, source, source_subject, source_sender, extraction_status, created_at, user_id"
      )
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (category) q = q.eq("category", category);
    if (query) {
      const like = `%${query}%`;
      q = q.or(`name.ilike.${like},source_subject.ilike.${like},extracted_text.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});