import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { logLenderAudit } from "../lenderWrites";

const CONTACT_FIELDS = ["name", "title", "email", "phone", "city", "state", "country", "geography", "notes", "is_primary"] as const;

export default defineTool({
  name: "upsert_lender_contact",
  title: "Add or update a funding source contact",
  description:
    "Create or update ONE contact on a funding source. Contacts live in the separate `lender_contacts` table (the multi-contact list shown on the funding source), NOT as columns on master_lenders — use `update_lender` for the legacy single contact_name/contact_title/contact_phone columns; these two tools are not interchangeable. Pass `contact_id` to update an existing contact, or omit it to create a new one. Only the fields you pass are written. Setting `is_primary: true` promotes this contact and automatically demotes any other primary contact on the same lender (one primary per lender). Returns the full created/updated contact row and logs the change to `lender_audit_logs`, the same change history `get_lender` returns as `audit_history`.",
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
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { lender_id, contact_id, ...rest } = input as Record<string, unknown> & {
      lender_id: string;
      contact_id?: string;
    };

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;

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

    let row: Record<string, unknown> | null = null;
    if (contact_id) {
      if (Object.keys(patch).length === 0) return errorResult("No fields to update.");
      patch.updated_at = new Date().toISOString();
      const { data, error } = await sb.from("lender_contacts").update(patch).eq("id", contact_id).select("*").maybeSingle();
      if (error) return errorResult(error.message);
      row = (data as Record<string, unknown>) ?? null;
    } else {
      const { data, error } = await sb.from("lender_contacts").insert({ lender_id, ...patch }).select("*").maybeSingle();
      if (error) return errorResult(error.message);
      row = (data as Record<string, unknown>) ?? null;
    }
    if (!row) return errorResult("Contact write failed or you do not have permission to write it.");

    // Exactly one primary contact per lender.
    let demoted: string[] = [];
    if (patch.is_primary === true) {
      const { data: others, error: demoteErr } = await sb
        .from("lender_contacts")
        .update({ is_primary: false })
        .eq("lender_id", lender_id)
        .eq("is_primary", true)
        .neq("id", row.id as string)
        .select("id");
      if (demoteErr) console.warn("[upsert_lender_contact] failed to demote other primaries", demoteErr.message);
      demoted = ((others ?? []) as Array<{ id: string }>).map((o) => o.id);
    }

    const changed = await logLenderAudit(
      sb,
      ctx,
      lender_id,
      contact_id ? "contact_updated" : "contact_added",
      before,
      row,
      [...CONTACT_FIELDS],
      { via: "mcp:upsert_lender_contact", contact_id: row.id, contact_name: row.name ?? null, demoted_primary_contact_ids: demoted },
    );

    return textResult(
      { contact: row, changed_fields: changed, demoted_primary_contact_ids: demoted },
      { lender_id, contact_id: row.id as string, created: !contact_id },
    );
  },
});
