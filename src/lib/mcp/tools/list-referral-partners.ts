import { defineTool } from "@lovable.dev/mcp-js";
import { earliestNdaEntries, resolveNdaEnteredAt, NDA_STAGE_ID, type NdaHistoryRow } from "../../referralNdaEntry";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import {
  classifyReferralPipeline,
  REFERRAL_STAGES,
  type LinkedContact,
  type ManualSource,
  type PipelineDeal,
  type ReferralStage,
  type TierDeal,
  type TierRules,
} from "../referralPipeline";

const PAGE = 1000;
const CHUNK = 100;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
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

async function fetchByIds<T>(sb: SupabaseClient, table: string, select: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await sb.from(table).select(select).in(column, ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

interface ContactRow extends LinkedContact {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  owner_user_id: string | null;
  updated_at: string | null;
}

export default defineTool({
  name: "list_referral_partners",
  title: "List referral partners",
  description:
    "Read-only. Lists the contacts currently in the Referral Source pipeline (Sales & BD dashboard) at stages Nurturing, Tier 3, Tier 2 and Tier 1 — the same classification the app shows — with real field values for building email lists: contact_id, first_name, last_name, email, title, company_name, company_id, stage, stage_entered_at, updated_at and owner. Scoped to the signed-in user's company. Sources without an email are skipped and counted in `missing_email`. Every response includes `stage_counts` (per stage, including skipped rows). Pagination: `limit` (default 200) and `offset`; response includes total_count, returned, next_offset and has_more. `stage_entered_at` is derived (no stage history is stored): Nurturing = date added to the pipeline; Tier N = date of the most recent referred deal behind that tier.",
  inputSchema: {
    stages: z.array(z.enum(REFERRAL_STAGES)).min(1).max(4).optional().describe('Stages to include. Defaults to all four: "Nurturing", "Tier 3", "Tier 2", "Tier 1".'),
    limit: z.number().int().min(1).max(1000).default(200),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stages, limit, offset }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    try {
      const { data: member, error: mErr } = await sb.from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
      if (mErr) return errorResult(mErr.message);
      if (!member?.company_id) return errorResult("forbidden: the signed-in user is not a member of a company.");
      const companyId = member.company_id as string;

      const { data: pipelines, error: pErr } = await sb.from("deal_pipelines").select("id, name, is_default").eq("company_id", companyId);
      if (pErr) return errorResult(pErr.message);
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
      if (rulesRes.error) return errorResult(rulesRes.error.message);

      // Tiers count only deals that entered NDA / Needs List Sent on the Active Pipeline.
      const activeIds = new Set((pipelines ?? []).filter((p) => p.is_default).map((p) => p.id as string));
      const dealPipeline = new Map(allDeals.map((d) => [d.id, d.pipeline_id]));
      const history = await fetchByIds<NdaHistoryRow & { event_type: string; to_stage_id: string | null; to_stage: string | null }>(
        sb, "deal_stage_history", "deal_id, changed_at, pipeline_id, event_type, to_stage_id, to_stage", "deal_id", allDeals.map((d) => d.id));
      const entries = earliestNdaEntries(
        history.filter((h) => h.event_type === "stage_enter" && (h.to_stage_id === NDA_STAGE_ID || h.to_stage === NDA_STAGE_ID)),
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

      const contactById = new Map(contacts.map((c) => [c.id, c]));
      const ownerIds = [...new Set(contacts.map((c) => c.owner_user_id).filter((v): v is string => !!v))];
      const owners = await fetchByIds<{ user_id: string; display_name: string | null; first_name: string | null; last_name: string | null }>(
        sb, "profiles_public", "user_id, display_name, first_name, last_name", "user_id", ownerIds);
      const ownerName = new Map(owners.map((o) => [o.user_id, o.display_name || [o.first_name, o.last_name].filter(Boolean).join(" ") || null]));

      const wanted = new Set<ReferralStage>(stages ?? REFERRAL_STAGES);
      const stage_counts: Record<string, number> = Object.fromEntries(REFERRAL_STAGES.filter((s) => wanted.has(s)).map((s) => [s, 0]));
      let missing_email = 0;
      const rows = [];
      for (const s of classified) {
        if (!wanted.has(s.stage)) continue;
        stage_counts[s.stage] += 1;
        const c = s.contact_id ? contactById.get(s.contact_id) : undefined;
        const email = (c?.email || s.manual_email || "").trim();
        if (!email) { missing_email += 1; continue; }
        const [fallbackFirst, ...rest] = s.name.split(/\s+/);
        const companyId = c?.crm_company_id ?? s.crm_company_id ?? null;
        rows.push({
          contact_id: s.contact_id,
          first_name: c ? c.first_name : fallbackFirst ?? null,
          last_name: c ? c.last_name : rest.join(" ") || null,
          email,
          title: c?.job_title ?? null,
          company_name: (companyId ? companyNames.get(companyId) : undefined) ?? s.manual_company ?? null,
          company_id: companyId,
          stage: s.stage,
          stage_entered_at: s.stage_entered_at,
          updated_at: c?.updated_at ?? s.manual_updated_at ?? null,
          owner_user_id: c?.owner_user_id ?? null,
          owner: c?.owner_user_id ? ownerName.get(c.owner_user_id) ?? null : null,
        });
      }
      const order = new Map(REFERRAL_STAGES.map((s, i) => [s, i]));
      rows.sort((a, b) => (order.get(b.stage)! - order.get(a.stage)!) || `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`));

      const page = rows.slice(offset, offset + limit);
      const next = offset + page.length;
      const payload = {
        total_count: rows.length,
        returned: page.length,
        offset,
        next_offset: next < rows.length ? next : null,
        has_more: next < rows.length,
        stage_counts,
        missing_email,
        partners: page,
      };
      return textResult(payload, payload);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Failed to load referral partners");
    }
  },
});
