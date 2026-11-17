import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { REFERRAL_SOURCE_TAG, joinTypes, loadContact, referralRowsForContact, splitTypes, updateContactAudited } from "../referralPartnerWrites";

export default defineTool({
  name: "remove_referral_partner",
  title: "Remove contact from Referral Source pipeline",
  description: `Remove a contact from the Referral Source pipeline: deletes its referral_sources entry and removes the "${REFERRAL_SOURCE_TAG}" contact type (audited). The contact itself and its deals are kept. Requires confirm:true. Note: a contact credited as the referrer on Active Pipeline deals still appears in Tier 3/2/1, because tiers are calculated from referred deals.`,
  inputSchema: { contact_id: z.string().uuid(), confirm: z.literal(true), source: z.string().max(1000).optional(), change_reason: z.string().max(2000).optional() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ contact_id, source, change_reason }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const sb = supabaseForUser(ctx);
    try {
      const c = await loadContact(sb, contact_id);
      const rows = await referralRowsForContact(sb, c.id);
      if (rows.length) {
        const { data, error } = await sb.from("referral_sources").delete().eq("contact_id", c.id).select("id");
        if (error) return errorResult(error.message);
        if ((data ?? []).length !== rows.length) return errorResult("Some referral entries could not be removed (permission denied).");
      }
      const remaining = splitTypes(c.contact_type).filter((t) => t.toLowerCase() !== REFERRAL_SOURCE_TAG.toLowerCase());
      const changed = remaining.length !== splitTypes(c.contact_type).length;
      const upd = changed ? await updateContactAudited(sb, c.id, { contact_type: joinTypes(remaining) }, source, change_reason) : null;
      const { count } = await sb.from("deals").select("id", { count: "exact", head: true }).eq("referred_by_contact_id", c.id);
      return textResult({
        contact_id: c.id, removed_referral_entries: rows.map((r) => r.id), contact_type_removed: changed, contact_diff: upd?.diff ?? {},
        referred_deal_count: count ?? 0,
        note: (count ?? 0) > 0 ? "This contact is still credited on referred deals, so it can still appear in a Tier stage." : undefined,
      }, { contact_id: c.id });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
