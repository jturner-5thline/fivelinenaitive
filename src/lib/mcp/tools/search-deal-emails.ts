import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "search_deal_emails",
  title: "Search deal emails",
  description:
    "Search email/communication history logged against a deal. Queries activity_logs where activity_type = 'email' for the deal, optionally filtered by a text query against subject, body, from, or to addresses. Returns subject, direction, from/to, sent_at, thread_id, and body snippet.",
  inputSchema: {
    deal_id: z.string().uuid().optional().describe("Single deal. Provide this or deal_ids."),
    deal_ids: z.array(z.string().uuid()).min(1).max(200).optional().describe("Bulk mode: fetch for many deals in one call (RLS scoped). Rows include deal_id."),
    query: z.string().trim().min(1).max(200).optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, deal_ids, query, direction, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    if (!deal_id && (!deal_ids || deal_ids.length === 0)) {
      return errorResult("Provide deal_id or deal_ids.");
    }
    if (deal_id) {
      const denied = await assertDealAccess(sb, ctx, deal_id, "search_deal_emails");
      if (denied) return denied;
    }
    let q = sb
      .from("activity_logs")
      .select(
        "id, subject, body, direction, from_address, to_addresses, cc_addresses, sent_at, thread_id, message_id, provider, user_display_name, created_at"
      )
      .in("deal_id", deal_id ? [deal_id] : (deal_ids ?? []))
      .eq("activity_type", "email")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (direction) q = q.eq("direction", direction);
    if (query) {
      const like = `%${query}%`;
      q = q.or(`subject.ilike.${like},body.ilike.${like},from_address.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});