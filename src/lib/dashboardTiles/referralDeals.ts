/**
 * Sales & BD "Deals & Dollars on the Board" (referral-sourced) and the TTM
 * referral Conversion Rate — shared by ReferralSourceDeals /
 * salesBdActivePipelineConversion and the read-only MCP dashboard tool.
 * Import-safe: relative imports only.
 */
import type { AnySupabase } from "./stageQueries";
import { ACTIVE_PIPELINE_ID } from "./stageQueries";
import { isExcludedDealName } from "../../utils/excludedDeals";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const REFERRAL_NDA_STAGE_ID = "ndaneeds-list-sent";
const NDA_EXCLUDED_OWNERS = ["john moffitt"];
const NDA_EXCLUDED_CHANGED_BY = ["2e65a4b1-bd94-46ef-87c6-9afe697b3180"];

export interface ReferralOnBoardRow {
  id: string;
  company: string | null;
  value: number | null;
  stage: string | null;
  referred_by: string | null;
  sourced_via: string | null;
  created_at: string;
  closing_date: string | null;
}

export async function loadReferralDealsOnBoard(
  sb: AnySupabase,
  companyId: string,
  rangeStart: Date | null,
  rangeEnd: Date | null,
): Promise<ReferralOnBoardRow[]> {
  const select = "id, company, value, stage, referred_by, sourced_via, created_at, deal_owner";
  let hq = sb
    .from("deal_stage_history")
    .select(`deal_id, changed_at, changed_by, pipeline_id, deals!inner(${select}, company_id, pipeline_id)`)
    .eq("event_type", "stage_enter")
    .or(`to_stage_id.eq.${REFERRAL_NDA_STAGE_ID},to_stage.eq.${REFERRAL_NDA_STAGE_ID}`)
    .eq("deals.company_id", companyId)
    .order("changed_at", { ascending: true });
  if (rangeStart) hq = hq.gte("changed_at", rangeStart.toISOString());
  if (rangeEnd) hq = hq.lte("changed_at", rangeEnd.toISOString());
  const { data, error } = await hq;
  if (error) throw error;

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const rows: ReferralOnBoardRow[] = [];
  for (const r of (data || []) as any[]) {
    const d = r.deals;
    if (!d?.id) continue;
    if (r.pipeline_id && r.pipeline_id !== ACTIVE_PIPELINE_ID) continue;
    if (!r.pipeline_id && d.pipeline_id !== ACTIVE_PIPELINE_ID) continue;
    if (r.changed_by && NDA_EXCLUDED_CHANGED_BY.includes(r.changed_by)) continue;
    if (NDA_EXCLUDED_OWNERS.includes(String(d.deal_owner || "").toLowerCase().trim())) continue;
    if (isExcludedDealName(d.company)) continue;
    const isReferral = !!String(d.referred_by || "").trim() || /^referral/i.test(String(d.sourced_via || "").trim());
    if (!isReferral) continue;
    const nameKey = String(d.company || "").toLowerCase().trim();
    if (seenIds.has(d.id) || (nameKey && seenNames.has(nameKey))) continue;
    seenIds.add(d.id);
    if (nameKey) seenNames.add(nameKey);
    rows.push({
      id: d.id, company: d.company, value: d.value, stage: d.stage,
      referred_by: d.referred_by, sourced_via: d.sourced_via, created_at: r.changed_at, closing_date: null,
    });
  }
  rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return rows;
}

// ---------------- TTM Conversion ----------------
export const REACHED_FINAL_CREDIT_SLUGS: ReadonlySet<string> = new Set([
  "final-credit-items", "client-strategy-review", "write-up-pending", "submitted-to-lenders",
  "lenders-in-review", "terms-issued", "in-due-diligence", "agreement-pending", "funded-invoiced", "closed-won",
]);

export function hasReachedFinalCreditStage(stage?: string | null): boolean {
  if (!stage) return false;
  return REACHED_FINAL_CREDIT_SLUGS.has(stage.toLowerCase().trim());
}

export interface ActiveTtmDeal {
  id: string; stage: string | null; sourced_via: string | null; referred_by: string | null; created_at: string;
}

export async function fetchActivePipelineIds(sb: AnySupabase, companyId: string): Promise<string[]> {
  const { data, error } = await sb.from("deal_pipelines").select("id, name, is_default").eq("company_id", companyId);
  if (error) throw error;
  return ((data || []) as Array<{ id: string; name: string; is_default: boolean | null }>)
    .filter((p) => p.is_default || p.name.toLowerCase().includes("active"))
    .map((p) => p.id);
}

export async function fetchTtmActiveDeals(sb: AnySupabase, companyId: string, pipelineIds: string[], since: string, until: string) {
  const { data, error } = await sb
    .from("deals")
    .select("id, stage, sourced_via, referred_by, created_at")
    .eq("company_id", companyId)
    .in("pipeline_id", pipelineIds)
    .gte("created_at", since)
    .lte("created_at", until);
  if (error) throw error;
  return (data || []) as ActiveTtmDeal[];
}

export function computeTtmConversion(deals: ActiveTtmDeal[], kind: "referral" | "partner", partnerNames: string[] = []) {
  const partnerSet = new Set(partnerNames.map((n) => n.toLowerCase().trim()));
  const matches = (d: ActiveTtmDeal) => {
    if (kind === "referral") return !!d.sourced_via && /^referral/i.test(d.sourced_via.trim());
    const ref = (d.referred_by || "").toLowerCase().trim();
    return !!ref && partnerSet.has(ref);
  };
  const denom = deals.filter(matches);
  const numer = denom.filter((d) => hasReachedFinalCreditStage(d.stage));
  return {
    numerator: numer.length,
    denominator: denom.length,
    rate: denom.length === 0 ? null : numer.length / denom.length,
    label: denom.length === 0 ? "—" : `${((numer.length / denom.length) * 100).toFixed(1)}%`,
  };
}

/** Rolling TTM anchor: end of the timeframe (local end of day), capped at now. */
export function ttmAnchorFromTimeframeEnd(end?: string | null, now = new Date()): Date {
  if (!end) return now;
  const d = new Date(`${end}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return now;
  return d.getTime() > now.getTime() ? now : d;
}

export function ttmWindow(anchor: Date): { since: Date; until: Date } {
  const since = new Date(anchor);
  since.setMonth(since.getMonth() - 12);
  return { since, until: anchor };
}
