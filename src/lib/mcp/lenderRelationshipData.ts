import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared helpers for MCP tools over lender_engagements, lender_deal_history,
 * lender_intro_paths and crm_company_team owners. Writes are caller-scoped (RLS)
 * and logged to mcp_lender_write_log, which also stores idempotency keys. */

export const pagination = {
  limit: z.number().int().min(1).max(200).default(50).describe("Page size (max 200)."),
  offset: z.number().int().min(0).default(0).describe("Rows to skip."),
};
export const idempotencyKey = {
  idempotency_key: z.string().trim().min(1).max(200).optional()
    .describe("Optional retry key. Repeating a call with the same key returns the first result instead of writing again."),
};

export function pageInfo(offset: number, limit: number, returned: number, total: number | null) {
  const next = offset + returned;
  return { total_count: total, offset, limit, next_offset: total != null && next < total ? next : null, has_more: total != null ? next < total : returned === limit };
}

export async function findIdempotent(sb: SupabaseClient, tool: string, key?: string) {
  if (!key) return null;
  const { data } = await sb.from("mcp_lender_write_log").select("target_id, action, after").eq("tool", tool).eq("idempotency_key", key).maybeSingle();
  return data as { target_id: string | null; action: string; after: Record<string, unknown> | null } | null;
}

export async function logWrite(sb: SupabaseClient, entry: {
  tool: string; idempotency_key?: string; target_table: string; target_id?: string | null; lender_id?: string | null;
  action: string; before?: unknown; after?: unknown;
}): Promise<string | null> {
  const { error } = await sb.from("mcp_lender_write_log").insert({
    tool: entry.tool, idempotency_key: entry.idempotency_key ?? null, target_table: entry.target_table,
    target_id: entry.target_id ?? null, lender_id: entry.lender_id ?? null, action: entry.action,
    before: entry.before ?? null, after: entry.after ?? null,
  });
  return error ? `Write succeeded but audit log failed: ${error.message}` : null;
}

export async function loadLender(sb: SupabaseClient, lenderId: string) {
  const { data, error } = await sb.from("master_lenders").select("id, name, company_id, crm_company_id").eq("id", lenderId).maybeSingle();
  if (error) return { error: error.message } as const;
  if (!data) return { error: "lender_id: funding source not found (or not visible to this user)." } as const;
  return { lender: data as { id: string; name: string; company_id: string | null; crm_company_id: string | null } } as const;
}

/** Fields an intro path must carry before it is written. */
export function introPathProblems(i: { evidence_type?: string | null; evidence_ref?: string | null; from_contact_id?: string | null; from_user_id?: string | null; from_referral_source_id?: string | null; from_name?: string | null }): string[] {
  const out: string[] = [];
  if (!i.from_contact_id && !i.from_user_id && !i.from_referral_source_id && !i.from_name?.trim()) out.push("one of from_contact_id, from_user_id, from_referral_source_id or from_name is required");
  if (!i.evidence_type) out.push("evidence_type is required");
  else if (i.evidence_type !== "manual" && !i.evidence_ref?.trim()) out.push("evidence_ref is required unless evidence_type is manual");
  return out;
}

/** Fields an outside deal must carry before it is written. */
export function dealHistoryProblems(i: { borrower_name?: string | null; source_type?: string | null; source_ref?: string | null; evidence_grade?: string | null }): string[] {
  const out: string[] = [];
  if (!i.borrower_name?.trim()) out.push("borrower_name is required");
  if (!i.source_type) out.push("source_type is required");
  if (!i.source_ref?.trim()) out.push("source_ref (Gmail message id or URL) is required");
  if (!i.evidence_grade) out.push("evidence_grade is required");
  return out;
}

export const isUniqueViolation = (e: { code?: string } | null) => e?.code === "23505";
