import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { logLenderAudit, resolveLenderId } from "../lenderWrites";
import { LENDER_FIELD_SCHEMA, validateLenderPatch } from "../lenderFields";

export default defineTool({
  name: "update_lender",
  title: "Update funding source / lender",
  description:
    "Update columns on an existing funding source (lender) row in the master directory (`master_lenders`). Partial update: ONLY the fields you pass are changed, everything else is left untouched; pass null to clear a field. Bumps updated_at, returns the full updated lender record, and writes one `lender_audit_logs` entry per changed field (old value -> new value), the same change history `get_lender` returns as `audit_history`. Use this for EXISTING funding sources only — to add a new one use `create_lender`. Also covers criteria_reviewed_at, criteria_confidence, upfront_checklist, post_term_sheet_checklist, crm_company_id, onboarded_to_flex and gift_address. Identify the lender by `lender_id`, or by `name_lookup` (case-insensitive, partial) when the id is unknown. Do NOT use `name` to identify the lender — `name` RENAMES it — ambiguous names are rejected with the candidate ids. NOTE: this tool edits the LEGACY single-contact columns on master_lenders (contact_name, contact_title, contact_phone, contact_geography, email, phone). It does NOT touch the separate multi-contact list in `lender_contacts` — use `upsert_lender_contact` for that. The two are not interchangeable.",
  inputSchema: {
    lender_id: z.string().uuid().optional(),
    name_lookup: z.string().trim().min(1).max(200).optional().describe("Find the lender by name when lender_id is unknown (case-insensitive, partial). Use `name` to RENAME the lender."),

    name: z.string().trim().min(1).max(200).optional().describe("New name for the lender (rename)."),
    ...LENDER_FIELD_SCHEMA,
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
    const invalid = await validateLenderPatch(sb, patch);
    if (invalid) return errorResult(invalid);
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
