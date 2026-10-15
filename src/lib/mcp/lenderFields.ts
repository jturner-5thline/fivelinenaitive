import { z } from "zod";
import type { supabaseForUser } from "./supabase";

type Sb = ReturnType<typeof supabaseForUser>;

const str = (max = 2000) => z.string().max(max).nullable().optional();
const arr = () => z.array(z.string().trim().min(1).max(200)).nullable().optional();
const num = () => z.number().nullable().optional();

/**
 * Every user-editable master_lenders column exposed to the MCP write tools.
 * Shared by `update_lender` and `create_lender` so both accept exactly the
 * same fields with the same types.
 */
export const LENDER_FIELD_SCHEMA = {
  lender_type: str(200),
  loan_types: arr(),
  sub_debt: str(500),
  cash_burn: str(500),
  sponsorship: str(500),
  min_revenue: num(),
  ebitda_min: num(),
  min_deal: num(),
  max_deal: num(),
  sweet_spot_min: num(),
  sweet_spot_max: num(),
  min_gross_margin_pct: num(),
  max_leverage: num(),
  industries: arr(),
  industries_to_avoid: arr(),
  b2b_b2c: str(200),
  refinancing: str(500),
  company_requirements: str(5000),
  deal_structure_notes: str(10000),
  geo: str(500),
  geographies: arr(),
  geographies_excluded: arr(),
  sponsor_requirement: str(500),
  tier: str(50),
  active: z.boolean().nullable().optional(),
  appetite_status: str(100),
  tags: arr(),
  website: str(500),
  linkedin_url: str(500),
  address: str(500),
  city: str(200),
  state: str(200),
  country: str(200),
  phone: str(100),
  email: str(320),
  contact_name: str(200),
  contact_title: str(200),
  contact_phone: str(100),
  contact_geography: str(200),
  relationship_owners: str(500),
  referral_lender: str(200),
  referral_fee_offered: str(500),
  referral_agreement: str(500),
  nda: str(500),
  funding_source_notes: str(20000),
  about_notes: str(20000),
  lender_one_pager_url: str(1000),
  criteria_reviewed_at: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "criteria_reviewed_at must be an ISO date or timestamp, e.g. 2026-09-14" })
    .nullable()
    .optional()
    .describe("When the lending criteria were last reviewed. ISO date (2026-09-14) or timestamp."),
  criteria_confidence: str(100).describe("Confidence in the criteria. Validated against the values already used in the directory (e.g. 'imported'); an invalid value returns the allowed list."),
  upfront_checklist: str(10000).describe("Comma-separated list of upfront diligence items, same format as existing rows."),
  post_term_sheet_checklist: str(10000).describe("Comma-separated list of post-term-sheet items, same format as existing rows."),
  crm_company_id: z.string().uuid().nullable().optional().describe("crm_companies.id to link this funding source to. Must exist and be visible to you."),
  onboarded_to_flex: str(500),
  gift_address: str(1000),
} as const;

export const LENDER_FIELD_NAMES = Object.keys(LENDER_FIELD_SCHEMA);

/** Normalise and validate the special-cased fields. Returns an error message or null. */
export async function validateLenderPatch(sb: Sb, patch: Record<string, unknown>): Promise<string | null> {
  if (typeof patch.criteria_reviewed_at === "string") {
    patch.criteria_reviewed_at = new Date(patch.criteria_reviewed_at).toISOString();
  }

  if (typeof patch.criteria_confidence === "string") {
    const value = patch.criteria_confidence.trim();
    const allowed = new Set<string>(["imported"]);
    const { data, error } = await sb.from("master_lenders").select("criteria_confidence").not("criteria_confidence", "is", null).limit(1000);
    if (!error) for (const r of (data ?? []) as Array<{ criteria_confidence: string | null }>) if (r.criteria_confidence) allowed.add(r.criteria_confidence);
    if (!allowed.has(value)) {
      return `Invalid criteria_confidence "${value}". Allowed values: ${[...allowed].sort().join(", ")}.`;
    }
    patch.criteria_confidence = value;
  }

  if (typeof patch.crm_company_id === "string") {
    const { data, error } = await sb.from("crm_companies").select("id").eq("id", patch.crm_company_id).maybeSingle();
    if (error) return `crm_company_id: ${error.message}`;
    if (!data) return `crm_company_id: no CRM company ${patch.crm_company_id} exists (or it is not visible to you).`;
  }

  if (patch.min_deal != null && patch.max_deal != null && Number(patch.min_deal) > Number(patch.max_deal)) {
    return "min_deal: must be less than or equal to max_deal.";
  }
  return null;
}
