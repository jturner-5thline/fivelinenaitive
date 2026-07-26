import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "list_deal_funding_sources",
  title: "List deal funding sources / lenders",
  description:
    "List all funding sources (lenders) attached to a specific deal — the same records shown in the deal's Funding Sources tab. Returns each entry's stage/status, tracking bucket (active, on-deck, on-hold, passed, excluded), quote amount / rate / term, pass reason, and status-change timestamps (submitted, approved, declined, passed, on-deck, on-hold, excluded). Returns an empty list when the deal has no funding sources.",
  inputSchema: {
    deal_id: z.string().uuid(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const denied = await assertDealAccess(sb, ctx, deal_id, "list_deal_funding_sources");
    if (denied) return denied;
    const { data, error } = await sb
      .from("deal_lenders")
      .select(
        "id, deal_id, name, stage, substage, tracking_status, tags, score, notes, pass_reason, quote_amount, quote_rate, quote_term, submitted_at, approved_at, declined_at, passed_at, on_deck_at, on_hold_at, excluded_at, last_status_change_at, last_contact_at, master_lender_id, selected_contact_id, created_at, updated_at",
      )
      .eq("deal_id", deal_id)
      .order("last_status_change_at", { ascending: false, nullsFirst: false });
    if (error) {
      console.error("[list_deal_funding_sources] query error", {
        deal_id,
        user_id: ctx.getUserId?.(),
        message: error.message,
      });
      return errorResult(error.message);
    }
    const rows = data ?? [];
    console.log("[list_deal_funding_sources] ok", {
      deal_id,
      user_id: ctx.getUserId?.(),
      count: rows.length,
    });
    return textResult(rows, { count: rows.length, deal_id, deal_visible: true });
  },
});