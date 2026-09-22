import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { logLenderAudit, resolveLenderId } from "../lenderWrites";

const str = (max = 2000) => z.string().max(max).nullable().optional();
const arr = () => z.array(z.string().trim().min(1).max(200)).nullable().optional();
const num = () => z.number().nullable().optional();

export default defineTool({
  name: "update_lender",
  title: "Update funding source / lender",
  description:
    "Update columns on an existing funding source (lender) row in the master directory (`master_lenders`). Partial update: ONLY the fields you pass are changed, everything else is left untouched; pass null to clear a field. Bumps updated_at, returns the full updated lender record, and writes one `lender_audit_logs` entry per changed field (old value -> new value), the same change history `get_lender` returns as `audit_history`. Identify the lender by `lender_id`, or by `name` (case-insensitive, partial) when the id is unknown — ambiguous names are rejected with the candidate ids. NOTE: this tool edits the LEGACY single-contact columns on master_lenders (contact_name, contact_title, contact_phone, contact_geography, email, phone). It does NOT touch the separate multi-contact list in `lender_contacts` — use `upsert_lender_contact` for that. The two are not interchangeable.",
  inputSchema: {
    lender_id: z.string().uuid().optional(),
    name_lookup: z.string().trim().min(1).max(200).optional().describe("Find the lender by name when lender_id is unknown (case-insensitive, partial). Use `name` to RENAME the lender."),

    name: z.string().trim().min(1).max(200).optional().describe("New name for the lender (rename)."),
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
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { lender_id, name_lookup, ...rest } = input as Record<string, unknown> & {
      lender_id?: string;
      name_lookup?: string;
    };

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0) return errorResult("No fields to update.");

    const sb = supabaseForUser(ctx);
    const resolved = await resolveLenderId(sb, lender_id, name_lookup);
    if ("error" in resolved) return resolved.error;
    const id = resolved.id;

    // Snapshot for the audit trail before writing.
    const { data: before, error: beforeErr } = await sb
      .from("master_lenders")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) return errorResult(beforeErr.message);
    if (!before) return errorResult("Funding source not found (or not visible to this user).");

    patch.updated_at = new Date().toISOString();

    const { data, error } = await sb
      .from("master_lenders")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Funding source not found or you do not have permission to update it.");

    const changed = await logLenderAudit(sb, ctx, id, "updated", before as Record<string, unknown>, data as Record<string, unknown>, Object.keys(patch).filter((k) => k !== "updated_at"), { via: "mcp:update_lender" });

    return textResult({ lender: data, changed_fields: changed }, { lender_id: id, changed_count: changed.length });
  },
});
