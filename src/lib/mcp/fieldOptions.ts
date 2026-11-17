/**
 * Allowed values for option-backed fields, mirroring the app's dropdowns and
 * filters. Shared by `list_field_options` and the lender write validators.
 * Workspace lists that the app keeps only in browser storage cannot be read
 * server-side, so the canonical defaults plus values already stored are used.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOAN_TYPE_OPTIONS } from "../../constants/loanTypes";
import { INDUSTRY_OPTIONS } from "../../constants/industries";
import { GEO_OPTIONS } from "../../constants/geoOptions";
import { LENDER_ATTACHMENT_CATEGORIES } from "./lenderAttachments";

export const DEFAULT_LENDER_TYPES = ["Bank", "Family Office", "Private Credit", "Revenue-Based", "Asset-Based", "SBA", "Buyer"] as const;
export const APPETITE_STATUSES = ["active", "paused", "unknown"] as const;
export const LENDER_TIERS = ["T1", "T2", "T3"] as const;
export const LIFECYCLE_STAGES = ["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist", "other"] as const;
export const CONTACT_STATUSES = ["active", "inactive", "went_dark", "do_not_contact"] as const;
export const CHANNEL_PARTNER_STAGES = ["prospect", "nurturing", "trial", "engaged"] as const;

export const FIELD_OPTION_KEYS = [
  "master_lenders.lender_type", "master_lenders.loan_types", "master_lenders.industries", "master_lenders.industries_to_avoid",
  "master_lenders.geographies", "master_lenders.geographies_excluded", "master_lenders.cash_burn", "master_lenders.sponsorship",
  "master_lenders.refinancing", "master_lenders.sub_debt", "master_lenders.appetite_status", "master_lenders.tier",
  "contacts.contact_type", "contacts.lifecycle_stage", "contacts.status", "lender_attachments.category",
  "channel_partners.stage", "deals.stage",
] as const;
export type FieldOptionKey = (typeof FIELD_OPTION_KEYS)[number];

/** Lender columns validated on create/update, with whether the column is an array. */
export const VALIDATED_LENDER_FIELDS: Record<string, { key: FieldOptionKey; array: boolean; csv?: boolean }> = {
  lender_type: { key: "master_lenders.lender_type", array: false, csv: true },
  loan_types: { key: "master_lenders.loan_types", array: true },
  industries: { key: "master_lenders.industries", array: true },
  industries_to_avoid: { key: "master_lenders.industries_to_avoid", array: true },
  geographies: { key: "master_lenders.geographies", array: true },
  geographies_excluded: { key: "master_lenders.geographies_excluded", array: true },
  cash_burn: { key: "master_lenders.cash_burn", array: false },
  sponsorship: { key: "master_lenders.sponsorship", array: false },
  refinancing: { key: "master_lenders.refinancing", array: false },
  sub_debt: { key: "master_lenders.sub_debt", array: false },
  appetite_status: { key: "master_lenders.appetite_status", array: false },
  tier: { key: "master_lenders.tier", array: false },
};

/** Lender array columns that support add/remove array modes. */
export const LENDER_ARRAY_MODE_FIELDS = ["loan_types", "industries", "industries_to_avoid", "geographies", "tags"] as const;

const DISTINCT_FROM_DATA: Partial<Record<FieldOptionKey, string>> = {
  "master_lenders.cash_burn": "cash_burn",
  "master_lenders.sponsorship": "sponsorship",
  "master_lenders.refinancing": "refinancing",
  "master_lenders.sub_debt": "sub_debt",
  "master_lenders.lender_type": "lender_type",
};

function uniq(values: Iterable<string>): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = String(v ?? "").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()];
}

async function distinctLenderValues(sb: SupabaseClient, column: string, csv: boolean): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.from("master_lenders").select(column).not(column, "is", null).range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const r of rows) {
      const raw = r[column];
      if (typeof raw !== "string") continue;
      for (const part of csv ? raw.split(",") : [raw]) if (part.trim() && !part.includes("@")) out.push(part.trim());
    }
    if (rows.length < 1000) break;
  }
  return uniq(out).sort((a, b) => a.localeCompare(b));
}

export interface FieldOptionList { key: FieldOptionKey; values: string[]; source: string; labels?: Record<string, string> }

export async function loadFieldOptions(sb: SupabaseClient, key: FieldOptionKey, companyId?: string | null): Promise<FieldOptionList> {
  switch (key) {
    case "master_lenders.loan_types": return { key, values: [...LOAN_TYPE_OPTIONS], source: "Canonical loan type list used by the funding-source forms and filters." };
    case "master_lenders.industries":
    case "master_lenders.industries_to_avoid": return { key, values: [...INDUSTRY_OPTIONS], source: "The 28 canonical industry tags." };
    case "master_lenders.geographies":
    case "master_lenders.geographies_excluded": return { key, values: [...GEO_OPTIONS], source: "Canonical geography list used by the funding-source forms." };
    case "master_lenders.appetite_status": return { key, values: [...APPETITE_STATUSES], source: "Appetite dropdown on the funding-source page." };
    case "master_lenders.tier": return { key, values: [...LENDER_TIERS], source: "Tier dropdown (T1-T3); null clears." };
    case "master_lenders.lender_type": {
      const existing = await distinctLenderValues(sb, "lender_type", true);
      return { key, values: uniq([...DEFAULT_LENDER_TYPES, ...existing]), source: "Default funding-source types plus types already stored (comma-separated multi-type values are split)." };
    }
    case "contacts.lifecycle_stage": return { key, values: [...LIFECYCLE_STAGES], source: "Contact lifecycle stage dropdown." };
    case "contacts.status": return { key, values: [...CONTACT_STATUSES], source: "Contact status dropdown." };
    case "contacts.contact_type": {
      let q = sb.from("contact_types").select("name").eq("is_active", true).order("sort_order").order("name");
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { key, values: uniq(((data ?? []) as Array<{ name: string }>).map((r) => r.name)), source: "Workspace contact types (multiple types are stored joined with ' ; ')." };
    }
    case "lender_attachments.category": return { key, values: [...LENDER_ATTACHMENT_CATEGORIES], source: "Attachment categories." };
    case "channel_partners.stage": return { key, values: [...CHANNEL_PARTNER_STAGES], source: "Channel Partner pipeline stages (Prospect, Nurturing, Trial, Engaged)." };
    case "deals.stage": {
      const { data, error } = await sb.from("deal_pipelines").select("id, name, is_default, stages").order("name");
      if (error) throw new Error(error.message);
      const labels: Record<string, string> = {};
      const values: string[] = [];
      for (const p of (data ?? []) as Array<{ id: string; name: string; stages: unknown }>) {
        const stages = Array.isArray(p.stages) ? (p.stages as Array<Record<string, unknown>>) : [];
        for (const s of stages) {
          const id = String(s.id ?? s.key ?? "");
          if (!id) continue;
          values.push(`${p.id}:${id}`);
          labels[`${p.id}:${id}`] = `${p.name} → ${String(s.label ?? s.name ?? id)}`;
        }
      }
      return { key, values, labels, source: "Stages per pipeline as pipeline_id:stage_id (stage IDs are resolved within their pipeline)." };
    }
    default: {
      const column = DISTINCT_FROM_DATA[key];
      if (!column) throw new Error(`Unsupported field ${key}`);
      return { key, values: await distinctLenderValues(sb, column, false), source: "Values already used in the directory — the same list the funding-source dropdowns offer." };
    }
  }
}

/** Levenshtein distance for closest-match suggestions. */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase(), y = b.toLowerCase();
  const row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[y.length];
}

export function closestMatches(value: string, options: readonly string[], n = 3): string[] {
  const v = value.trim().toLowerCase();
  return [...options]
    .map((o) => ({ o, d: o.toLowerCase().includes(v) || v.includes(o.toLowerCase()) ? 0.5 : editDistance(v, o) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((r) => r.o);
}

/**
 * Validate option-backed values. Matching is case-insensitive and values are
 * rewritten to the canonical spelling. Returns errors listing suggestions.
 */
export function validateOptionValues(
  field: string, value: unknown, options: readonly string[], spec: { array: boolean; csv?: boolean },
): { value: unknown; error?: { field: string; invalid: string[]; suggestions: Record<string, string[]> } } {
  if (value === null || value === undefined) return { value };
  const canon = new Map(options.map((o) => [o.toLowerCase(), o]));
  const parts = spec.array ? (value as string[]) : spec.csv ? String(value).split(",") : [String(value)];
  const fixed: string[] = [];
  const invalid: string[] = [];
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const hit = canon.get(t.toLowerCase());
    if (hit) fixed.push(hit); else invalid.push(t);
  }
  if (invalid.length) {
    return { value, error: { field, invalid, suggestions: Object.fromEntries(invalid.map((v) => [v, closestMatches(v, options)])) } };
  }
  return { value: spec.array ? fixed : spec.csv ? fixed.join(",") : fixed[0] ?? null };
}

/** Apply add/remove array modes against current values (case-insensitive, order-preserving). */
export function applyArrayMode(current: unknown, mode: "add" | "remove", values: string[]): string[] {
  const base = Array.isArray(current) ? (current as string[]).filter((v) => typeof v === "string") : [];
  if (mode === "add") {
    const have = new Set(base.map((v) => v.toLowerCase()));
    const out = [...base];
    for (const v of values) if (!have.has(v.toLowerCase())) { out.push(v); have.add(v.toLowerCase()); }
    return out;
  }
  const drop = new Set(values.map((v) => v.toLowerCase()));
  return base.filter((v) => !drop.has(v.toLowerCase()));
}
