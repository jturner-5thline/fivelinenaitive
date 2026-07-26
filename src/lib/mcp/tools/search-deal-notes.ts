import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "search_deal_notes",
  title: "Search deal notes",
  description:
    "Search notes attached to a specific deal (deal space notes). Optionally filter by a text query against title/content/tags. Returns id, title, content, folder, tags, is_pinned, user_id, updated_at.",
  inputSchema: {
    deal_id: z.string().uuid(),
    query: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, query, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const denied = await assertDealAccess(sb, ctx, deal_id, "search_deal_notes");
    if (denied) return denied;
    let q = sb
      .from("deal_space_notes")
      .select("id, deal_id, title, content, folder, tags, is_pinned, user_id, created_at, updated_at")
      .eq("deal_id", deal_id)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (query) {
      const like = `%${query}%`;
      q = q.or(`title.ilike.${like},content.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});