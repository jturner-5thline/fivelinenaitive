import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { TIER_STAGE_MESSAGE, hasTag, loadContact, referralRowsForContact, updateContactAudited } from "../referralPartnerWrites";

export default defineTool({
  name: "update_referral_partner",
  title: "Update Referral Source partner",
  description: `Update a contact that is in the Referral Source pipeline: owner (contact owner and relationship owner), notes on its referral entry (mode replace/append), referral_agreement_on_file, w9_on_file, referral_fee and lender_referred_pct. Contact field changes are audited with source/change_reason. ${TIER_STAGE_MESSAGE} Passing stage "Nurturing" is accepted as a no-op; other stages are rejected.`,
  inputSchema: {
    contact_id: z.string().uuid(),
    stage: z.enum(["Nurturing", "Tier 3", "Tier 2", "Tier 1"]).optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    notes_mode: z.enum(["replace", "append"]).default("replace"),
    referral_agreement_on_file: z.boolean().nullable().optional(),
    w9_on_file: z.boolean().nullable().optional(),
    referral_fee: z.string().max(500).nullable().optional(),
    lender_referred_pct: z.string().max(100).nullable().optional(),
    source: z.string().max(1000).optional(),
    change_reason: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    if (input.stage && input.stage !== "Nurturing") return errorResult(TIER_STAGE_MESSAGE);
    const sb = supabaseForUser(ctx);
    try {
      const c = await loadContact(sb, input.contact_id);
      let rows = await referralRowsForContact(sb, c.id);
      if (!rows.length && !hasTag(c.contact_type)) return errorResult("This contact is not in the Referral Source pipeline; use add_referral_partner first.");
      const patch: Record<string, unknown> = {};
      if (input.owner_user_id !== undefined) patch.owner_user_id = input.owner_user_id;
      for (const k of ["referral_agreement_on_file", "w9_on_file", "referral_fee", "lender_referred_pct"] as const) if (input[k] !== undefined) patch[k] = input[k];
      const contactUpdate = await updateContactAudited(sb, c.id, patch, input.source, input.change_reason);
      if (rows.length && (input.notes !== undefined || input.owner_user_id !== undefined)) {
        const upd: Record<string, unknown> = {};
        if (input.owner_user_id !== undefined) upd.relationship_owner_id = input.owner_user_id;
        if (input.notes !== undefined) {
          const prev = String(rows[0].notes ?? "");
          upd.notes = input.notes_mode === "append" && prev && input.notes ? `${prev}\n\n${input.notes}` : input.notes;
        }
        const { data, error } = await sb.from("referral_sources").update(upd).eq("contact_id", c.id).select("*");
        if (error) return errorResult(error.message);
        rows = (data ?? []) as Array<Record<string, unknown>>;
      } else if (!rows.length && input.notes !== undefined) {
        return errorResult("This contact has no referral entry to hold notes (it was tagged without one); use add_referral_partner to create it.");
      }
      if (!Object.keys(patch).length && input.notes === undefined && input.owner_user_id === undefined) return errorResult("No fields to update.");
      return textResult({ contact_id: c.id, referral_source: rows[0] ?? null, contact_diff: contactUpdate?.diff ?? {} }, { contact_id: c.id });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
