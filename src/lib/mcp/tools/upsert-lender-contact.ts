import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { writeLenderRelated, writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "upsert_lender_contact",
  title: "Add or update a funding source contact",
  description:
    "Create/update lender_contacts name,title,email,phone,city,state,country,geography,notes,is_primary and CRM contact link. Legacy contact_id targets lender_contacts.id; crm_contact_id writes lender_contacts.contact_id (null unlinks), preserving backward compatibility. CRM link must be in the same company. Primary demotion and per-field audits are atomic. Does not edit master_lenders or CRM contact fields; identity, tenancy and timestamps are server controlled.",
  inputSchema: {
    lender_id: z.string().uuid().describe("master_lenders.id of the funding source that owns this contact."),
    contact_id: z.string().uuid().optional().describe("Omit to create a new contact; provide to update an existing one."),
    name: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).nullable().optional(),
    email: z.string().trim().max(320).nullable().optional(),
    phone: z.string().trim().max(100).nullable().optional(),
    city: z.string().trim().max(200).nullable().optional(),
    state: z.string().trim().max(200).nullable().optional(),
    country: z.string().trim().max(200).nullable().optional(),
    geography: z.string().trim().max(200).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    is_primary: z.boolean().optional(),
    crm_contact_id: z.string().uuid().nullable().optional().describe("CRM contacts.id; writes lender_contacts.contact_id. null explicitly unlinks. Legacy contact_id above identifies the lender contact row."),
    ...writeProvenance,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { lender_id, contact_id, crm_contact_id, source, change_reason, ...rest } = input as Record<string, unknown> & {
      lender_id: string;
      contact_id?: string;
      crm_contact_id?: string | null;
      source?: string;
      change_reason?: string;
    };

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (crm_contact_id !== undefined) patch.contact_id = crm_contact_id;

    const sb = supabaseForUser(ctx);

    // Confirm the lender is visible to this caller before writing a child row.
    const { data: lender, error: lenderErr } = await sb.from("master_lenders").select("id, name").eq("id", lender_id).maybeSingle();
    if (lenderErr) return errorResult(lenderErr.message);
    if (!lender) return errorResult("Funding source not found (or not visible to this user).");

    let before: Record<string, unknown> | null = null;
    if (contact_id) {
      const { data, error } = await sb.from("lender_contacts").select("*").eq("id", contact_id).eq("lender_id", lender_id).maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Contact not found on this funding source (or not visible to this user).");
      before = data as Record<string, unknown>;
    } else if (!patch.name) {
      return errorResult("A `name` is required when creating a new contact.");
    }

    const result = await writeLenderRelated(sb, "lender_contacts", contact_id ? "update" : "create", lender_id, contact_id, patch, false, source, change_reason);
    if ("isError" in result) return result;
    const payload = JSON.parse(result.content[0].text);
    const row = payload.record;
    const fields = Object.keys(patch).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(row?.[k]));
    return textResult({ contact: row, changed_fields: fields, created: !contact_id, demoted_primary_contact_ids: payload.demoted_primary_contact_ids }, { lender_id, contact_id: row.id, created: !contact_id });
  },
});
