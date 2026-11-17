/**
 * FinServ point-in-time "Active Client" rule.
 *
 * For period ends BEFORE May 1, 2026 a deal counts as an Active Client at the
 * end of the period when EITHER:
 *  - its stage at that moment was the Active Client stage, OR
 *  - its contract start date is on/before the period end AND it had not exited
 *    the Active Client stage (or dropped out to a terminal stage) by then.
 * From May 2026 onward only the point-in-time stage counts. A contract end
 * date on/before the period end stops the contract-start rule. Counts are
 * distinct clients (engagements grouped by finservClientKey).
 */
export const FINSERV_ACTIVE_STAGE = 'fs-closed-won';
export const FINSERV_TERMINAL_STAGES = new Set(['fs-churned', 'fs-closed-lost', 'fs-in-development']);
export const CONTRACT_START_RULE_CUTOFF = new Date(2026, 4, 1); // May 1, 2026 local

export interface FinServDealLike {
  id: string;
  stage: string | null;
  created_at: string;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  company?: string | null;
  crm_company_id?: string | null;
  stage_entered_at?: string | null;
}
export interface StageHistoryRow { to_stage: string | null; changed_at: string }

export function stageAtTime(deal: FinServDealLike, hist: StageHistoryRow[] | undefined, t: Date): string | null {
  if (new Date(deal.created_at) > t) return null;
  if (hist && hist.length) {
    let last: string | null = null;
    for (const h of hist) {
      if (new Date(h.changed_at) <= t) last = h.to_stage;
      else break;
    }
    if (last !== null) return last;
  }
  return deal.stage ?? null;
}

function parseDateOnly(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}

/** True when the deal left Active Client (or went terminal) at or before t. */
function exitedBy(deal: FinServDealLike, hist: StageHistoryRow[] | undefined, t: Date): boolean {
  if (hist && hist.length) {
    let prev: string | null = null;
    for (const h of hist) {
      if (new Date(h.changed_at) > t) break;
      const to = h.to_stage ?? '';
      if ((prev === FINSERV_ACTIVE_STAGE && to !== FINSERV_ACTIVE_STAGE) || FINSERV_TERMINAL_STAGES.has(to)) return true;
      prev = to;
    }
    return false;
  }
  // No history: a deal now in a terminal stage is treated as exited from the
  // date it entered that stage (if known).
  const cur = deal.stage ?? '';
  if (FINSERV_TERMINAL_STAGES.has(cur)) {
    return deal.stage_entered_at ? new Date(deal.stage_entered_at) <= t : true;
  }
  return false;
}

export function isFinServActiveClientAt(deal: FinServDealLike, hist: StageHistoryRow[] | undefined, t: Date): boolean {
  if (stageAtTime(deal, hist, t) === FINSERV_ACTIVE_STAGE) return true;
  if (t >= CONTRACT_START_RULE_CUTOFF || !deal.contract_start_date) return false;
  if (parseDateOnly(deal.contract_start_date) > t) return false;
  // A recorded contract end date on/before the period end means the engagement had ended.
  if (deal.contract_end_date && parseDateOnly(deal.contract_end_date) <= t) return false;
  return !exitedBy(deal, hist, t);
}

/** MRR counts open (non-terminal) deals plus any deal counted Active by the rule above. */
export function countsTowardFinServMrrAt(deal: FinServDealLike, hist: StageHistoryRow[] | undefined, t: Date): boolean {
  if (isFinServActiveClientAt(deal, hist, t)) return true;
  const s = stageAtTime(deal, hist, t);
  return !!s && !FINSERV_TERMINAL_STAGES.has(s);
}

const CLIENT_NAME_NOISE = new Set(['inc','llc','co','corp','ltd','the','and','cfo','advisory','finops','bookkeeping','back','office','expansion','m','a','diligence','support']);

/**
 * Distinct-client key: FinServ deals are engagements, and one client can hold
 * several. Uses the linked CRM company when present, else the client name
 * with service-line words and corporate suffixes removed (first two words).
 */
export function finservClientKey(deal: { id: string; company?: string | null; crm_company_id?: string | null }): string {
  if (deal.crm_company_id) return `crm:${deal.crm_company_id}`;
  const words = (deal.company ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !CLIENT_NAME_NOISE.has(w));
  return words.length ? `name:${words.slice(0, 2).join(' ')}` : `deal:${deal.id}`;
}

/** Number of distinct clients with at least one active engagement at t. */
export function countFinServActiveClientsAt<T extends FinServDealLike>(deals: T[], historyByDeal: Map<string, StageHistoryRow[]>, t: Date): number {
  const keys = new Set<string>();
  for (const d of deals) if (isFinServActiveClientAt(d, historyByDeal.get(d.id), t)) keys.add(finservClientKey(d));
  return keys.size;
}

export interface FinServSnapshot {
  active_clients: number;
  active_engagements: number;
  total_mrr: number;
  clients: Array<{ id: string; company: string | null; mrr: number }>;
}

/** Point-in-time Active Clients + Total MRR, matching the FinServ dashboard cards and chart. */
export function finservSnapshotAt(
  deals: Array<FinServDealLike & { mrr?: number | string | null; company?: string | null }>,
  historyByDeal: Map<string, StageHistoryRow[]>,
  t: Date,
): FinServSnapshot {
  let engagements = 0;
  let mrr = 0;
  const byClient = new Map<string, FinServSnapshot['clients'][number]>();
  for (const d of deals) {
    const h = historyByDeal.get(d.id);
    if (isFinServActiveClientAt(d, h, t)) {
      engagements += 1;
      const key = finservClientKey(d);
      const prev = byClient.get(key);
      if (prev) prev.mrr += Number(d.mrr ?? 0);
      else byClient.set(key, { id: d.id, company: d.company ?? null, mrr: Number(d.mrr ?? 0) });
    }
    if (countsTowardFinServMrrAt(d, h, t)) mrr += Number(d.mrr ?? 0);
  }
  return { active_clients: byClient.size, active_engagements: engagements, total_mrr: mrr, clients: [...byClient.values()] };
}
