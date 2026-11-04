import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_deal_note",
  title: "Get deal note",
  description: "Read one Deal Space note's full HTML content, by note_id or by deal_id plus title (case-insensitive). Returns candidates if several notes share the title.",
  inputSchema: {
    note_id: z.string().uuid().optional(),
    deal_id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ note_id, deal_id, title }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!note_id && !(deal_id && title)) return errorResult("Provide note_id, or deal_id and title.");
    const sb = supabaseForUser(ctx);
    let q = sb.from("deal_space_notes").select("id, deal_id, title, content, folder, tags, is_pinned, user_id, created_at, updated_at");
    q = note_id ? q.eq("id", note_id) : q.eq("deal_id", deal_id!);
    const { data, error } = await q.limit(200);
    if (error) return errorResult(error.message);
    const rows = note_id ? data ?? [] : (data ?? []).filter((n) => n.title.trim().toLowerCase() === title!.trim().toLowerCase());
    if (rows.length === 0) return errorResult("Note not found or not accessible.");
    if (rows.length > 1) {
      const candidates = rows.map((n) => ({ note_id: n.id, title: n.title, updated_at: n.updated_at }));
      return { ...textResult({ error: "Multiple notes match this title.", candidates }, { candidates }), isError: true as const };
    }
    const n = rows[0];
    return textResult(n, { note: { ...n, tags: n.tags ?? [] } });
  },
});
