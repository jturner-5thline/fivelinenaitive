/** Shared handler for update_contact / update_company (caller-scoped, audited RPC). */
import { z } from "zod";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser, requireAuth, textResult, errorResult } from "./supabase";

const s = (max = 500) => z.string().trim().max(max).nullable().optional();
const arr = () => z.array(z.string().trim().min(1).max(320)).max(200).nullable().optional();

export const CONTACT_EDIT_FIELDS = {
  first_name: s(200), last_name: s(200), email: s(320), additional_emails: arr(),
  phone_work: s(100), phone_mobile: s(100), phone_other: s(100), job_title: s(300),
  contact_type: s(500).describe("Contact type(s); multiple types are joined with ' ; '. See list_field_options contacts.contact_type."),
  lifecycle_stage: s(100), status: s(100), lead_source: s(300), owner_user_id: z.string().uuid().nullable().optional(),
  linkedin_url: s(500), city: s(200), state: s(200), country: s(200), description: z.string().max(50000).nullable().optional(),
  tags: arr(), crm_company_id: z.string().uuid().nullable().optional(),
  referral_agreement_on_file: z.boolean().nullable().optional(), w9_on_file: z.boolean().nullable().optional(),
  referral_fee: s(500), lender_referred_pct: s(100),
};

export const COMPANY_EDIT_FIELDS = {
  name: z.string().trim().min(1).max(300).optional(), domain: s(300), additional_domains: arr(), website_url: s(500),
  company_type: s(200), status: s(100), owner_user_id: z.string().uuid().nullable().optional(), industry: s(200), sub_industry: s(200),
  employee_count: z.number().int().nonnegative().nullable().optional(), employee_range: s(100), annual_revenue: z.number().finite().nullable().optional(),
  revenue_band: s(100), hq_city: s(200), hq_state: s(200), hq_country: s(200), hq_postal_code: s(50), hq_address: s(1000), address: s(1000),
  regions_served: arr(), parent_company_id: z.string().uuid().nullable().optional(), customer_tier: s(100), segment: s(200), lifecycle_stage: s(100),
  description: z.string().max(50000).nullable().optional(), notes: z.string().max(50000).nullable().optional(), linkedin_url: s(500), twitter_url: s(500),
  phone: s(100), main_contact_email: s(320), tags: arr(), year_founded: z.number().int().min(1600).max(2200).nullable().optional(),
  financing_status: s(200), key_products: arr(),
};

export const editControls = {
  mode: z.enum(["replace", "append", "prepend"]).default("replace").describe("Applies to long text (description, and notes on companies): append/prepend adds a blank-line-separated entry."),
  expected_updated_at: z.string().datetime({ offset: true }).optional().describe("Optimistic concurrency: fail with the current record if it changed since this timestamp."),
  dry_run: z.boolean().default(false).describe("Return the field diff without writing."),
  source: z.string().max(1000).optional(),
  change_reason: z.string().max(2000).optional(),
};

export async function runCrmUpdate(table: "contacts" | "crm_companies", id: string, input: Record<string, unknown>, ctx: ToolContext) {
  const denied = requireAuth(ctx);
  if (denied) return denied;
  const { mode, expected_updated_at, dry_run, source, change_reason, contact_id: _c, company_id: _co, ...fields } = input;
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) return errorResult("No fields to update.");
  const { data, error } = await supabaseForUser(ctx).rpc("mcp_update_crm_record", {
    p_table: table, p_id: id, p_patch: patch, p_mode: (mode as string) ?? "replace",
    p_expected_updated_at: (expected_updated_at as string) ?? null, p_dry_run: (dry_run as boolean) ?? false,
    p_source: (source as string) ?? null, p_change_reason: (change_reason as string) ?? null,
  });
  if (error) return errorResult(error.message);
  const result = textResult(data, { record_id: id });
  return (data as { error?: string } | null)?.error ? { ...result, isError: true as const } : result;
}

/** Add a dated, idempotent note to a contact or company activity log. */
export async function runCrmNote(
  kind: "contact" | "company", id: string,
  input: { body: string; subject?: string; occurred_at?: string; idempotency_key?: string; deal_id?: string; source?: string },
  ctx: ToolContext,
) {
  const denied = requireAuth(ctx);
  if (denied) return denied;
  const sb = supabaseForUser(ctx);
  const table = kind === "contact" ? "contact_activities" : "crm_company_activities";
  const fk = kind === "contact" ? "contact_id" : "crm_company_id";
  const parent = kind === "contact" ? "contacts" : "crm_companies";
  const { data: rec, error: recErr } = await sb.from(parent).select("id").eq("id", id).maybeSingle();
  if (recErr) return errorResult(recErr.message);
  if (!rec) return errorResult(`${kind} ${id} not found (or not visible to you).`);
  if (input.idempotency_key) {
    const { data: existing, error } = await sb.from(table).select("*").eq(fk, id).eq("metadata->>mcp_idempotency_key", input.idempotency_key).maybeSingle();
    if (error) return errorResult(error.message);
    if (existing) return textResult({ note: existing, duplicate: true }, { note_id: (existing as { id: string }).id, duplicate: true });
  }
  const row: Record<string, unknown> = {
    [fk]: id, activity_type: "note", subject: input.subject ?? null, body: input.body,
    occurred_at: input.occurred_at ?? new Date().toISOString(), logged_by: ctx.getUserId(), deal_id: input.deal_id ?? null,
    source: "mcp", metadata: { ...(input.idempotency_key ? { mcp_idempotency_key: input.idempotency_key } : {}), ...(input.source ? { provenance: input.source } : {}) },
  };
  const { data, error } = await sb.from(table).insert(row).select("*").maybeSingle();
  if (error) {
    // A concurrent retry with the same key won the unique index; return that row.
    if (error.code === "23505" && input.idempotency_key) {
      const { data: again } = await sb.from(table).select("*").eq(fk, id).eq("metadata->>mcp_idempotency_key", input.idempotency_key).maybeSingle();
      if (again) return textResult({ note: again, duplicate: true }, { duplicate: true });
    }
    return errorResult(error.message);
  }
  return textResult({ note: data, duplicate: false }, { note_id: (data as { id: string } | null)?.id ?? null, duplicate: false });
}

export const noteInput = {
  body: z.string().trim().min(1).max(20000),
  subject: z.string().trim().max(300).optional(),
  occurred_at: z.string().datetime({ offset: true }).optional().describe("When the note/activity happened; defaults to now."),
  idempotency_key: z.string().trim().min(1).max(200).optional().describe("Retries with the same key return the existing note instead of adding a duplicate."),
  deal_id: z.string().uuid().optional(),
  source: z.string().max(1000).optional(),
};
