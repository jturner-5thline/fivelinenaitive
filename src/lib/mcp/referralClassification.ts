/**
 * Loads the Referral Source pipeline classification (Nurturing / Tier 3-1) for
 * a company — shared by list_referral_partners and get_dashboard_tile_values.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { earliestNdaEntries, resolveNdaEnteredAt, type NdaHistoryRow } from "../referralNdaEntry";
import {
  classifyReferralPipeline,
  type LinkedContact,
  type ManualSource,
  type PipelineDeal,
  type TierDeal,
  type TierRules,
} from "./referralPipeline";

const PAGE = 1000;
const CHUNK = 100;

export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE || out.length >= 50000) break;
  }
  return out;
}

export async function fetchByIds<T>(sb: SupabaseClient, table: string, select: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await sb.from(table).select(select).in(column, ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export interface ContactRow extends LinkedContact {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  owner_user_id: string | null;
  updated_at: string | null;
}


export async function loadReferralClassification(sb: SupabaseClient, companyId: string, userId: string | null | undefined) {
  const { data: pipelines, error: pErr } = await sb.from("deal_pipelines").select("id, name, is_default").eq("company_id", companyId);
  if (pErr) throw new Error(pErr.message);
  const pipelineIds = (pipelines ?? [])
    .filter((p) => {
      const l = String(p.name ?? "").toLowerCase();
      return l.includes("in development") || l.includes("in-development") || p.is_default || l.includes("active");
    })
    .map((p) => p.id as string);

  const [pipelineDeals, allDeals, manualSources, rulesRes] = await Promise.all([
    pipelineIds.length
      ? fetchAll<PipelineDeal>((f, t) =>
          sb.from("deals")
            .select("id, company, stage, referred_by, referred_by_contact_id, referred_by_crm_company_id, created_at, pipeline_id")
            .eq("company_id", companyId).not("referred_by", "is", null).neq("referred_by", "")
            .in("pipeline_id", pipelineIds).order("id").range(f, t))
      : Promise.resolve([] as PipelineDeal[]),
    fetchAll<TierDeal & { id: string; pipeline_id: string | null }>((f, t) =>
      sb.from("deals")
        .select("id, stage, referred_by, sourced_via, closing_date, created_at, pipeline_id")
        .eq("company_id", companyId).not("referred_by", "is", null).neq("referred_by", "")
        .order("id").range(f, t)),
    fetchAll<ManualSource>((f, t) =>
      sb.from("referral_sources")
        .select("id, name, email, company, contact_id, created_at, updated_at")
        .or(`company_id.eq.${companyId},and(company_id.is.null,user_id.eq.${userId})`)
        .order("id").range(f, t)),
    sb.from("sales_bd_rules")
      .select("tier1_qualified_deals, tier1_trailing_months, tier1_signed_clients, tier2_qualified_deals_min, tier2_qualified_deals_max, tier2_trailing_months, tier2_deals_on_board, tier3_deals_per_quarter, qualified_deal_stages")
      .limit(1).maybeSingle(),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);

  // Tiers count only deals that entered NDA / Needs List Sent on the Active Pipeline.
  const activeIds = new Set((pipelines ?? []).filter((p) => p.is_default).map((p) => p.id as string));
  const dealPipeline = new Map(allDeals.map((d) => [d.id, d.pipeline_id]));
  const history = await fetchByIds<NdaHistoryRow & { event_type: string; to_stage_id: string | null; to_stage: string | null }>(
    sb, "deal_stage_history", "deal_id, changed_at, pipeline_id, event_type, to_stage_id, to_stage", "deal_id", allDeals.map((d) => d.id));
  const entries = earliestNdaEntries(
    history.filter((h) => h.event_type === "stage_enter"),
    activeIds, dealPipeline);
  for (const d of allDeals) d.nda_entered_at = resolveNdaEnteredAt(d, entries, activeIds);
  const ndaById = new Map(allDeals.map((d) => [d.id, d.nda_entered_at]));
  for (const d of pipelineDeals) d.nda_entered_at = ndaById.get(d.id) ?? null;

  const contactIds = [...new Set([
    ...pipelineDeals.map((d) => d.referred_by_contact_id),
    ...manualSources.map((m) => m.contact_id),
  ].filter((v): v is string => !!v))];
  const contacts = await fetchByIds<ContactRow>(sb, "contacts",
    "id, full_name, first_name, last_name, email, job_title, crm_company_id, owner_user_id, updated_at", "id", contactIds);

  const companyIds = [...new Set([
    ...pipelineDeals.map((d) => d.referred_by_crm_company_id),
    ...contacts.map((c) => c.crm_company_id),
  ].filter((v): v is string => !!v))];
  const companies = await fetchByIds<{ id: string; name: string | null }>(sb, "crm_companies", "id, name", "id", companyIds);
  const companyNames = new Map(companies.filter((c) => c.name).map((c) => [c.id, c.name as string]));

  const classified = classifyReferralPipeline({
    pipelineDeals, allDeals, manualSources, contacts, companyNames,
    rules: (rulesRes.data ?? null) as TierRules | null,
  });
  return { classified, contacts, companyNames };
}
