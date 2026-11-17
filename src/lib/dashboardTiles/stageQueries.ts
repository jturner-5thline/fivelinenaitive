/**
 * Client-agnostic stage-history queries shared by the Insights dashboard hooks
 * and the read-only MCP dashboard tool, so both always compute identical values.
 * Import-safe: no React, no browser globals, relative imports only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExcludedDealName } from "../../utils/excludedDeals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabase = SupabaseClient<any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const ACTIVE_PIPELINE_ID = "b78ad452-b489-4c89-8a91-789347c05f79";
export const IN_DEVELOPMENT_PIPELINE_ID = "40b17dfb-9122-49e0-bf7c-5aa993d5d615";
export const FINSERV_PIPELINE_ID = "6907be5e-b17c-4a95-a7c2-fd977c94e179";
export const DEBT_STAGE_PIPELINES = [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID];

export const NDA_STAGE_VALUES = [
  "ndaneeds-list-sent",
  "NDA/Needs List Sent",
  "NDA / Needs List Sent",
  "NDA/NEEDS LIST SENT",
  "NDA / NEEDS LIST SENT",
];
export const PROPOSAL_ISSUED_STAGE_LABELS = ["proposal-issued", "Proposal Issued"];
export const DOLLARS_SIGNED_STAGE_LABELS = [
  "final-credit-items", "Final Credit Items",
  "terms-issued", "Terms Issued",
  "in-due-diligence", "In Due Diligence",
  "funded-invoiced", "Funded/Invoiced", "Funded / Invoiced", "Closed & Funded",
];
export const FINSERV_DEALS_ON_BOARD_LABELS = ["fs-qualification", "Qualification"];
export const FINSERV_PROPOSALS_LABELS = ["fs-proposal-sent", "Proposal Sent"];

const EXCLUDED_OWNERS = new Set(["john moffitt"]);
const EXCLUDED_CHANGED_BY = new Set(["2e65a4b1-bd94-46ef-87c6-9afe697b3180"]);

const monthKeyUtc = (iso: string) => {
  const dt = new Date(iso);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Full calendar years [startYear-01-01, endYear-12-31] — the window the hooks fetch. */
export function yearWindow(years: number[]) {
  const sorted = [...new Set(years)].sort();
  return { start: `${sorted[0]}-01-01`, end: `${sorted[sorted.length - 1]}-12-31` };
}

// ---------------- Deals on Board (NDA / Needs List Sent entry) ----------------
export interface DealOnBoardEntry {
  id: string; company: string; value: number; manager: string | null; stage: string | null;
  created_at: string; month_index: number;
}

export async function fetchDealsOnBoardRows(sb: AnySupabase, start: string, end: string): Promise<Row[]> {
  const { data, error } = await sb
    .from("deal_stage_history")
    .select("deal_id, changed_at, changed_by, pipeline_id, deals!inner(id, company, value, manager, stage, deal_owner)")
    .eq("event_type", "stage_enter")
    .in("to_stage", NDA_STAGE_VALUES)
    .gte("changed_at", start)
    .lte("changed_at", end + "T23:59:59.999Z")
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Row[];
}

export function computeDealsOnBoard(rows: Row[]) {
  const raw: DealOnBoardEntry[] = rows
    .filter((h) => {
      const d = h.deals;
      if (!d) return false;
      if (h.pipeline_id && h.pipeline_id !== ACTIVE_PIPELINE_ID) return false;
      if (EXCLUDED_CHANGED_BY.has(h.changed_by)) return false;
      if (EXCLUDED_OWNERS.has(String(d.deal_owner ?? "").toLowerCase().trim())) return false;
      return !isExcludedDealName(d.company);
    })
    .map((h) => ({
      id: h.deals.id,
      company: h.deals.company ?? "—",
      value: Number(h.deals.value) || 0,
      manager: h.deals.manager ?? null,
      stage: h.deals.stage ?? null,
      created_at: h.changed_at,
      month_index: new Date(h.changed_at).getUTCMonth(),
    }));
  const byName = new Map<string, DealOnBoardEntry>();
  for (const d of raw) {
    const key = (d.company ?? "").toLowerCase().trim() || d.id;
    const existing = byName.get(key);
    if (!existing || new Date(d.created_at).getTime() < new Date(existing.created_at).getTime()) byName.set(key, d);
  }
  const deals = Array.from(byName.values());
  return { deals, ...bucket(deals, (d) => d.created_at) };
}

// ---------------- First entry into a stage (Proposals / Dollars Signed / FinServ) ----------------
export interface FirstStageEntry {
  id: string; deal_id: string; company: string; value: number; manager: string | null;
  current_stage: string | null; entered_at: string; month_index: number;
}

export async function fetchFirstEntryRows(
  sb: AnySupabase,
  opts: { pipelineIds: string[]; labels: string[]; start: string; end: string },
): Promise<Row[]> {
  let q = sb
    .from("deal_stage_history")
    .select("deal_id, changed_at, to_stage, deals!inner (company, value, manager, stage, pipeline_id)")
    .eq("event_type", "stage_enter");
  q = opts.pipelineIds.length === 1 ? q.eq("pipeline_id", opts.pipelineIds[0]) : q.in("pipeline_id", opts.pipelineIds);
  const { data, error } = await q
    .in("to_stage", opts.labels)
    .gte("changed_at", opts.start)
    .lte("changed_at", opts.end + "T23:59:59.999Z")
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Row[];
}

export function computeFirstEntries(rows: Row[], collapseByCompanyName: boolean) {
  const seen = new Map<string, FirstStageEntry>();
  for (const row of rows) {
    if (seen.has(row.deal_id)) continue;
    const deal = row.deals;
    if (!deal) continue;
    if (isExcludedDealName(deal.company)) continue;
    const enteredAt = row.changed_at as string;
    seen.set(row.deal_id, {
      id: row.deal_id,
      deal_id: row.deal_id,
      company: deal.company ?? "—",
      value: Number(deal.value) || 0,
      manager: deal.manager ?? null,
      current_stage: deal.stage ?? null,
      entered_at: enteredAt,
      month_index: new Date(enteredAt).getUTCMonth(),
    });
  }
  let deals = Array.from(seen.values());
  if (collapseByCompanyName) {
    const byName = new Map<string, FirstStageEntry>();
    for (const entry of deals) {
      const key = (entry.company ?? "").toLowerCase().trim();
      if (!key) { byName.set(entry.deal_id, entry); continue; }
      const existing = byName.get(key);
      if (!existing || new Date(entry.entered_at).getTime() < new Date(existing.entered_at).getTime()) byName.set(key, entry);
    }
    deals = Array.from(byName.values());
  }
  return { deals, ...bucket(deals, (d) => d.entered_at) };
}

function bucket<T extends { month_index: number }>(deals: T[], at: (d: T) => string) {
  const byMonth: T[][] = Array.from({ length: 12 }, () => []);
  const byMonthKey: Record<string, T[]> = {};
  for (const d of deals) {
    if (d.month_index >= 0 && d.month_index < 12) byMonth[d.month_index].push(d);
    const k = monthKeyUtc(at(d));
    (byMonthKey[k] = byMonthKey[k] || []).push(d);
  }
  return { byMonth, byMonthKey, countsByMonth: byMonth.map((a) => a.length) };
}

// ---------------- Stage entries in a window (Avg. New Deal on Board) ----------------
export interface StageEntryDeal { deal_id: string; company: string; value: number; manager: string | null; changed_at: string }

export async function fetchStageEntryWindowRows(sb: AnySupabase, stageId: string, startIso: string, endIso: string): Promise<Row[]> {
  const { data, error } = await sb
    .from("deal_stage_history")
    .select("deal_id, changed_at, deals!inner(company, value, manager)")
    .eq("pipeline_id", ACTIVE_PIPELINE_ID)
    .eq("event_type", "stage_enter")
    .or(`to_stage_id.eq.${stageId},to_stage.eq.${stageId}`)
    .gte("changed_at", startIso)
    .lt("changed_at", endIso)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

export function computeStageEntryDeals(rows: Row[], dedupe: boolean): StageEntryDeal[] {
  const seen = new Set<string>();
  const out: StageEntryDeal[] = [];
  for (const r of rows) {
    const company = r.deals?.company ?? "";
    if (isExcludedDealName(company)) continue;
    if (!r.deal_id) continue;
    if (dedupe) { if (seen.has(r.deal_id)) continue; seen.add(r.deal_id); }
    out.push({ deal_id: r.deal_id, company, value: Number(r.deals?.value) || 0, manager: r.deals?.manager ?? null, changed_at: r.changed_at });
  }
  return out;
}

/** Average of sized (value > 0) deals; null when none — matches the tile. */
export function averageSizedValue(deals: Array<{ value: number }>): number | null {
  const sized = deals.map((d) => Number(d.value) || 0).filter((v) => v > 0);
  return sized.length ? sized.reduce((s, v) => s + v, 0) / sized.length : null;
}
