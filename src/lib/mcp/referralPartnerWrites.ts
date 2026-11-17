/**
 * Referral Source pipeline writes for MCP. The pipeline (Sales & BD) places a
 * contact in Nurturing when it carries the "Referral Source" contact type and
 * has a referral_sources entry; Tier 3/2/1 are computed from referred deals
 * (sales_bd_rules) and cannot be assigned directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_SOURCE_TAG = "Referral Source";
export const splitTypes = (v: string | null | undefined) => (v ? v.split(/\s*;\s*/g).map((s) => s.trim()).filter(Boolean) : []);
export const joinTypes = (tags: string[]) => {
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  return cleaned.length ? cleaned.join(" ; ") : null;
};
export const hasTag = (v: string | null | undefined) => splitTypes(v).some((t) => t.toLowerCase() === REFERRAL_SOURCE_TAG.toLowerCase());
export const TIER_STAGE_MESSAGE =
  "Tier 3/2/1 are calculated automatically from the contact's referred deals (Sales & BD tier rules) and cannot be set directly. Contacts are added at Nurturing and move up as their referred deals progress.";

export interface ContactForReferral {
  id: string; first_name: string | null; last_name: string | null; full_name: string | null; email: string | null;
  phone_mobile: string | null; phone_work: string | null; contact_type: string | null; org_company_id: string | null; owner_user_id: string | null;
}

export async function loadContact(sb: SupabaseClient, id: string): Promise<ContactForReferral> {
  const { data, error } = await sb.from("contacts")
    .select("id, first_name, last_name, full_name, email, phone_mobile, phone_work, contact_type, org_company_id, owner_user_id")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Contact ${id} not found (or not visible to you).`);
  return data as ContactForReferral;
}

export async function referralRowsForContact(sb: SupabaseClient, contactId: string) {
  const { data, error } = await sb.from("referral_sources").select("*").eq("contact_id", contactId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function updateContactAudited(sb: SupabaseClient, id: string, patch: Record<string, unknown>, source?: string, reason?: string) {
  if (!Object.keys(patch).length) return null;
  const { data, error } = await sb.rpc("mcp_update_crm_record", {
    p_table: "contacts", p_id: id, p_patch: patch, p_mode: "replace", p_expected_updated_at: null, p_dry_run: false,
    p_source: source ?? null, p_change_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { record?: Record<string, unknown>; diff?: Record<string, unknown> };
}
