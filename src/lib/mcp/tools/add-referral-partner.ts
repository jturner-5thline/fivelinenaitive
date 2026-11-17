import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { REFERRAL_SOURCE_TAG, TIER_STAGE_MESSAGE, hasTag, joinTypes, loadContact, referralRowsForContact, splitTypes, updateContactAudited } from "../referralPartnerWrites";

export default defineTool({
  name: "add_referral_partner",
  title: "Add contact to Referral Source pipeline",
  description: `Put an existing CRM contact into the Referral Source pipeline (Sales & BD) at Nurturing — the same as the app's "Add to Nurturing" button: tags the contact type "${REFERRAL_SOURCE_TAG}" (audited) and creates its referral_sources entry. Optional owner, notes and referral agreement/fee fields. ${TIER_STAGE_MESSAGE} Idempotent: an existing entry is returned unchanged apart from supplied fields.`,
  inputSchema: {
    contact_id: z.string().uuid(),
    stage: z.enum(["Nurturing", "Tier 3", "Tier 2", "Tier 1"]).default("Nurturing"),
    owner_user_id: z.string().uuid().optional(),
    notes: z.string().max(10000).optional(),
    referral_agreement_on_file: z.boolean().optional(),
    w9_on_file: z.boolean().optional(),
    referral_fee: z.string().max(500).optional(),
    lender_referred_pct: z.string().max(100).optional(),
    source: z.string().max(1000).optional(),
    change_reason: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    if (input.stage && input.stage !== "Nurturing") return errorResult(TIER_STAGE_MESSAGE);
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    try {
      const c = await loadContact(sb, input.contact_id);
      const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
      if (!name) return errorResult("The contact needs a name or email before it can be added to the pipeline.");
      const patch: Record<string, unknown> = {};
      if (!hasTag(c.contact_type)) patch.contact_type = joinTypes([...splitTypes(c.contact_type), REFERRAL_SOURCE_TAG]);
      if (input.owner_user_id !== undefined) patch.owner_user_id = input.owner_user_id;
      for (const k of ["referral_agreement_on_file", "w9_on_file", "referral_fee", "lender_referred_pct"] as const) if (input[k] !== undefined) patch[k] = input[k];
      const contactUpdate = await updateContactAudited(sb, c.id, patch, input.source, input.change_reason);

      let rows = await referralRowsForContact(sb, c.id);
      let created = false;
      if (!rows.length) {
        const { data, error } = await sb.from("referral_sources").insert({
          name, email: c.email, phone: c.phone_mobile ?? c.phone_work ?? null, contact_id: c.id, contact_name: name, contact_email: c.email,
          user_id: userId, company_id: c.org_company_id, notes: input.notes ?? null, relationship_owner_id: input.owner_user_id ?? null,
        }).select("*");
        if (error) return errorResult(error.message);
        rows = (data ?? []) as Array<Record<string, unknown>>;
        created = true;
      } else if (input.notes !== undefined || input.owner_user_id !== undefined) {
        const upd: Record<string, unknown> = {};
        if (input.notes !== undefined) upd.notes = input.notes;
        if (input.owner_user_id !== undefined) upd.relationship_owner_id = input.owner_user_id;
        const { data, error } = await sb.from("referral_sources").update(upd).eq("contact_id", c.id).select("*");
        if (error) return errorResult(error.message);
        rows = (data ?? []) as Array<Record<string, unknown>>;
      }
      return textResult({ contact_id: c.id, stage: "Nurturing", created, referral_source: rows[0] ?? null, contact_diff: contactUpdate?.diff ?? {} }, { contact_id: c.id, created });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
