/**
 * FinServ Financial Metrics tile calculations shared by the dashboard hooks and
 * the read-only MCP dashboard tool. Import-safe: relative imports only.
 */
import type { AnySupabase } from "./stageQueries";
import { FINSERV_PIPELINE_ID } from "./stageQueries";
import { isExcludedDealName } from "../../utils/excludedDeals";
import {
  countsTowardFinServMrrAt,
  finservClientKey,
  isFinServActiveClientAt,
  type FinServDealLike,
  type StageHistoryRow,
} from "../finservActiveAt";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const FINSERV_ACTIVE_CLIENT_STAGE = "fs-closed-won";
export const FINSERV_QBO_REALM_ID = "9341451968897660";

// ---------------- New MRR Added / FinServ Clients Signed ----------------
export interface NewMrrDeal { deal_id: string; company: string; mrr: number; entered_at: string }

export async function loadFinServNewMrrAdded(sb: AnySupabase, companyId: string, start: string, end: string) {
  const { data: rows, error } = await sb
    .from("deal_stage_history")
    .select("deal_id, changed_at, to_stage, deals!inner(company, mrr, company_id, pipeline_id)")
    .eq("event_type", "stage_enter")
    .eq("pipeline_id", FINSERV_PIPELINE_ID)
    .in("to_stage", [FINSERV_ACTIVE_CLIENT_STAGE, "Active Client"])
    .gte("changed_at", start)
    .lte("changed_at", end + "T23:59:59.999Z")
    .order("changed_at", { ascending: true });
  if (error) throw error;
  const seen = new Map<string, NewMrrDeal>();
  for (const row of (rows ?? []) as any[]) {
    const deal = row.deals;
    if (!deal || deal.company_id !== companyId) continue;
    if (isExcludedDealName(deal.company)) continue;
    if (seen.has(row.deal_id)) continue;
    seen.set(row.deal_id, { deal_id: row.deal_id, company: deal.company ?? "—", mrr: Number(deal.mrr) || 0, entered_at: row.changed_at });
  }
  const deals = Array.from(seen.values());
  return { total: deals.reduce((s, d) => s + d.mrr, 0), deals };
}

// ---------------- Net Revenue Retention ----------------
export interface NrrCustomerRow { customer: string; priorRevenue: number; currentRevenue: number; retention: number | null }

/** Immediately-preceding window of the same length (inclusive ymd strings). */
export function priorWindow(start: string, end: string): { start: string; end: string } {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(s.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { start: ymd(prevStart), end: ymd(prevEnd) };
}

async function fetchRevenueByCustomer(sb: AnySupabase, realmId: string, start: string, end: string) {
  const { data, error } = await sb
    .from("quickbooks_invoices")
    .select("customer_name, txn_date, total_amt")
    .eq("realm_id", realmId)
    .gte("txn_date", start)
    .lte("txn_date", end);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const name = (row.customer_name ?? "").trim();
    if (!name) continue;
    const amt = Number(row.total_amt ?? 0);
    if (!Number.isFinite(amt)) continue;
    map.set(name, (map.get(name) ?? 0) + amt);
  }
  return map;
}

export async function loadFinServNrr(sb: AnySupabase, start: string, end: string, realmId = FINSERV_QBO_REALM_ID) {
  const prior = priorWindow(start, end);
  const [currentMap, priorMap] = await Promise.all([
    fetchRevenueByCustomer(sb, realmId, start, end),
    fetchRevenueByCustomer(sb, realmId, prior.start, prior.end),
  ]);
  const customers: NrrCustomerRow[] = [];
  let priorTotal = 0;
  let currentTotal = 0;
  for (const [name, priorRevenue] of priorMap) {
    if (priorRevenue <= 0) continue;
    const currentRevenue = currentMap.get(name) ?? 0;
    priorTotal += priorRevenue;
    currentTotal += currentRevenue;
    customers.push({ customer: name, priorRevenue, currentRevenue, retention: priorRevenue > 0 ? (currentRevenue / priorRevenue) * 100 : null });
  }
  customers.sort((a, b) => b.priorRevenue - a.priorRevenue);
  return { customers, priorTotal, currentTotal, nrr: priorTotal > 0 ? (currentTotal / priorTotal) * 100 : null, prior };
}

// ---------------- Pipeline snapshot: Total Clients / Total MRR / Current Pipeline ----------------
const CURRENT_PIPELINE_STAGES = new Set(["fs-qualification", "fs-discovery", "fs-qualified", "fs-scoping", "fs-proposal-sent", "fs-negotiation"]);

export async function loadFinServPipelineSnapshot(sb: AnySupabase, endYmd: string | null | undefined, now = new Date()) {
  const { data, error } = await sb
    .from("deals")
    .select("id, company, crm_company_id, stage, mrr, created_at, contract_start_date, contract_end_date, stage_entered_at")
    .eq("pipeline_id", FINSERV_PIPELINE_ID);
  if (error) throw error;
  const rows = (data ?? []) as Array<FinServDealLike & { mrr: number | string | null; company?: string | null; crm_company_id?: string | null }>;
  const { data: hist, error: histErr } = await sb
    .from("deal_stage_history")
    .select("deal_id, to_stage, changed_at")
    .eq("pipeline_id", FINSERV_PIPELINE_ID)
    .order("changed_at", { ascending: true });
  if (histErr) throw histErr;
  const historyByDeal = new Map<string, StageHistoryRow[]>();
  for (const h of (hist ?? []) as any[]) {
    const arr = historyByDeal.get(h.deal_id) ?? [];
    arr.push({ to_stage: h.to_stage, changed_at: h.changed_at });
    historyByDeal.set(h.deal_id, arr);
  }
  const effective = endYmd ? new Date(endYmd + "T23:59:59") : now;
  const asOf = effective > now ? now : effective;
  const clientKeys = new Set<string>();
  const clients = new Map<string, { client_key: string; company: string | null; mrr: number }>();
  let totalMrr = 0;
  let currentPipeline = 0;
  for (const r of rows) {
    const h = historyByDeal.get(r.id);
    if (isFinServActiveClientAt(r, h, asOf)) {
      const key = finservClientKey(r);
      clientKeys.add(key);
      if (!clients.has(key)) clients.set(key, { client_key: key, company: r.company ?? null, mrr: 0 });
    }
    if (CURRENT_PIPELINE_STAGES.has(r.stage ?? "")) currentPipeline += 1;
    if (countsTowardFinServMrrAt(r, h, asOf)) {
      totalMrr += Number(r.mrr ?? 0);
      const c = clients.get(finservClientKey(r));
      if (c) c.mrr += Number(r.mrr ?? 0);
    }
  }
  return { totalClients: clientKeys.size, totalMrr, currentPipeline, asOf, clients: [...clients.values()] };
}
