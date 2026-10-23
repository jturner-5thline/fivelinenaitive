/**
 * Pure classification of the Referral Source pipeline (Sales & BD dashboard),
 * mirroring useDealReferralSources + ReferralSourcePipelineWidget so the MCP
 * connector sees the same stages as the UI. No I/O here.
 */
import { partnerMatches } from "../partnerNameMatch";
import { isRemovedForInactivity } from "../../components/channels/atRiskSources";

export const REFERRAL_STAGES = ["Nurturing", "Tier 3", "Tier 2", "Tier 1"] as const;
export type ReferralStage = (typeof REFERRAL_STAGES)[number];

export interface TierRules {
  tier1_qualified_deals: number;
  tier1_trailing_months: number;
  tier1_signed_clients: number;
  tier2_qualified_deals_min: number;
  tier2_qualified_deals_max: number;
  tier2_trailing_months: number;
  tier2_deals_on_board: number;
  tier3_deals_per_quarter: number;
  qualified_deal_stages: string[];
}

/** Deals in the Active / In Development pipelines that are linked to a referrer record. */
export interface PipelineDeal {
  id: string;
  company: string | null;
  stage: string | null;
  referred_by: string | null;
  referred_by_contact_id: string | null;
  referred_by_crm_company_id: string | null;
  created_at: string;
}

/** Every referred deal (any pipeline), used for tier windows. */
export interface TierDeal {
  stage: string | null;
  referred_by: string | null;
  sourced_via: string | null;
  closing_date: string | null;
  created_at: string;
}

export interface ManualSource {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  contact_id: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface LinkedContact {
  id: string;
  full_name: string | null;
  crm_company_id: string | null;
}

export interface ClassifiedSource {
  key: string;
  name: string;
  contact_id: string | null;
  crm_company_id: string | null;
  manual_company: string | null;
  manual_email: string | null;
  stage: ReferralStage;
  /** Derived: Nurturing = date added; Tier N = most recent referred deal behind the tier. */
  stage_entered_at: string | null;
  manual_updated_at: string | null;
}

const SIGNED_STAGE_SLUGS = new Set([
  "final-credit-items", "closed-won", "funded-invoiced", "terms-issued", "agreement-pending",
]);
const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const ms = (months: number) => months * 30 * 24 * 60 * 60 * 1000;

export function computeTier(
  name: string,
  allDeals: TierDeal[],
  rules: TierRules | null,
  now: number,
): { tier: 1 | 2 | 3 | null; lastMatchedAt: string | null } {
  if (!rules) return { tier: null, lastMatchedAt: null };
  const qualified = new Set((rules.qualified_deal_stages || []).map(toSlug));
  const winT1 = now - ms(rules.tier1_trailing_months ?? 3);
  const winT2 = now - ms(rules.tier2_trailing_months ?? 3);
  const win12 = now - ms(12);
  const matched = allDeals.filter((d) => partnerMatches(name, d.referred_by) || partnerMatches(name, d.sourced_via));
  const t = (s: string) => new Date(s).getTime();
  const isQ = (d: TierDeal) => !!d.stage && qualified.has(toSlug(d.stage));
  const qT1 = matched.filter((d) => isQ(d) && t(d.created_at) >= winT1).length;
  const qT2 = matched.filter((d) => isQ(d) && t(d.created_at) >= winT2).length;
  const sT1 = matched.filter((d) => !!d.stage && SIGNED_STAGE_SLUGS.has(toSlug(d.stage)) && t(d.closing_date || d.created_at) >= winT1).length;
  const aT2 = matched.filter((d) => t(d.created_at) >= winT2).length;
  const aT12 = matched.filter((d) => t(d.created_at) >= win12).length;
  const lastMatchedAt = matched.reduce<string | null>((m, d) => (!m || d.created_at > m ? d.created_at : m), null);
  let tier: 1 | 2 | 3 | null = null;
  if (qT1 >= rules.tier1_qualified_deals || sT1 >= rules.tier1_signed_clients) tier = 1;
  else if ((qT2 >= rules.tier2_qualified_deals_min && qT2 <= rules.tier2_qualified_deals_max) || aT2 >= rules.tier2_deals_on_board) tier = 2;
  else if (aT12 >= rules.tier3_deals_per_quarter * 4 || matched.length > 0) tier = 3;
  return { tier, lastMatchedAt };
}

export function classifyReferralPipeline(input: {
  pipelineDeals: PipelineDeal[];
  allDeals: TierDeal[];
  manualSources: ManualSource[];
  contacts: LinkedContact[];
  companyNames: Map<string, string>;
  rules: TierRules | null;
  now?: Date;
}): ClassifiedSource[] {
  const now = input.now ?? new Date();
  const contactById = new Map(input.contacts.map((c) => [c.id, c]));

  // Earliest date each source was added manually — protects new sources from removal.
  const addedByName = new Map<string, string>();
  for (const m of input.manualSources) {
    if (!m.created_at) continue;
    const k = normalize(m.name);
    const prev = addedByName.get(k);
    if (!prev || m.created_at < prev) addedByName.set(k, m.created_at);
  }

  // Group strictly by linked record (contact first, else CRM company).
  const grouped = new Map<string, { raw: string; contactId: string | null; crmCompanyId: string | null; deals: PipelineDeal[] }>();
  for (const d of input.pipelineDeals) {
    if (!d.referred_by_contact_id && !(d.referred_by_crm_company_id && input.companyNames.has(d.referred_by_crm_company_id))) continue;
    const contact = d.referred_by_contact_id ? contactById.get(d.referred_by_contact_id) : undefined;
    const contactId = d.referred_by_contact_id;
    const key = contactId ? `contact:${contactId}` : `company:${d.referred_by_crm_company_id}`;
    const companyName = d.referred_by_crm_company_id ? input.companyNames.get(d.referred_by_crm_company_id) : undefined;
    const raw = contactId
      ? contact?.full_name?.trim() || d.referred_by || companyName || "Unknown contact"
      : companyName || d.referred_by || "Unknown";
    if (!grouped.has(key)) {
      grouped.set(key, {
        raw,
        contactId,
        crmCompanyId: contact?.crm_company_id ?? d.referred_by_crm_company_id ?? null,
        deals: [],
      });
    }
    grouped.get(key)!.deals.push(d);
  }

  const out: ClassifiedSource[] = [];
  const seen = new Set<string>();
  const nowMs = now.getTime();
  for (const [key, g] of grouped) {
    seen.add(normalize(g.raw));
    const addedAt = addedByName.get(normalize(g.raw)) ?? null;
    if (isRemovedForInactivity({
      referredBy: g.raw,
      addedAt,
      deals: g.deals.map((d) => ({ id: d.id, company: d.company ?? "", created_at: d.created_at, stage: d.stage || "" })),
    }, now)) continue;
    const { tier, lastMatchedAt } = computeTier(g.raw, input.allDeals, input.rules, nowMs);
    const stage: ReferralStage = tier === null ? "Nurturing" : (`Tier ${tier}` as ReferralStage);
    const lastPipelineDeal = g.deals.reduce<string | null>((m, d) => (!m || d.created_at > m ? d.created_at : m), null);
    out.push({
      key,
      name: g.raw,
      contact_id: g.contactId,
      crm_company_id: g.crmCompanyId,
      manual_company: null,
      manual_email: null,
      stage,
      stage_entered_at: tier === null ? addedAt ?? lastPipelineDeal : lastMatchedAt ?? lastPipelineDeal,
      manual_updated_at: null,
    });
  }

  // Manually added sources with no qualifying deals start in Nurturing.
  for (const m of input.manualSources) {
    if (seen.has(normalize(m.name))) continue;
    if (isRemovedForInactivity({ referredBy: m.name, addedAt: m.created_at ?? null, deals: [] }, now)) continue;
    const contact = m.contact_id ? contactById.get(m.contact_id) : undefined;
    out.push({
      key: `manual:${m.id}`,
      name: m.name,
      contact_id: m.contact_id,
      crm_company_id: contact?.crm_company_id ?? null,
      manual_company: m.company,
      manual_email: m.email,
      stage: "Nurturing",
      stage_entered_at: m.created_at,
      manual_updated_at: m.updated_at ?? null,
    });
  }
  return out;
}
