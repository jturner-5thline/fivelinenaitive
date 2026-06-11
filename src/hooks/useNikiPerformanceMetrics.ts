import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * Niki Performance metrics — actuals vs the Rep Performance Plan sheet.
 *
 * Scope:
 *  - 5th Line "Active Pipeline" (= the `Active Deals` pipeline for 5th Line)
 *  - Deals where Niki Heikali is `deal_owner` OR `manager`
 *  - Year 2026, broken into Q1–Q4
 *
 * Metric source:
 *  - "On Board"  → deal added to the pipeline (deals.created_at)
 *  - everything else → first stage-entry into the target stage
 *    (activity_logs.activity_type='stage_change', metadata.to=<stage_id>)
 */

export const ACTIVE_PIPELINE_ID_5THLINE = 'b78ad452-b489-4c89-8a91-789347c05f79';
export const NIKI_NAME = 'Niki Heikali';

/**
 * Canonical stage order for the 5th Line Active Pipeline. Used so we can
 * count a deal as having "reached" a stage even when its stage-transition
 * was never logged — if the deal's CURRENT stage sits at or past the
 * target stage in the canonical flow, we infer entry from `deals.created_at`.
 *
 * `closed-lost` and `on-hold` are intentionally OMITTED from ordering:
 * they're side-branches, not progression points, so we cannot infer prior
 * stage entry from them — those deals only count when an explicit stage
 * log exists.
 */
const STAGE_ORDER_ACTIVE = [
  'ndaneeds-list-sent',
  'pre-credit-needs',
  'initial-lender-review',
  'initial-feedback',
  'proposal-in-development',
  'proposal-issued',
  'agreement-pending',
  'final-credit-items',
  'client-strategy-review',
  'write-up-pending',
  'submitted-to-lenders',
  'lenders-in-review',
  'terms-issued',
  'in-due-diligence',
  'funded-invoiced',
  'closed-won',
] as const;

function stageIdx(s: string | null | undefined): number {
  if (!s) return -1;
  return STAGE_ORDER_ACTIVE.indexOf(s as any);
}
function isAtOrPast(currentStage: string | null | undefined, targetStage: string): boolean {
  const c = stageIdx(currentStage);
  const t = stageIdx(targetStage);
  if (c < 0 || t < 0) return false;
  return c >= t;
}

export type PerfDeal = {
  deal_id: string;
  company: string;
  value: number;
  entered_at: string;
};

export type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
const QUARTERS: { key: QuarterKey; start: string; end: string }[] = [
  { key: 'Q1', start: '2026-01-01', end: '2026-03-31' },
  { key: 'Q2', start: '2026-04-01', end: '2026-06-30' },
  { key: 'Q3', start: '2026-07-01', end: '2026-09-30' },
  { key: 'Q4', start: '2026-10-01', end: '2026-12-31' },
];

export const NIKI_QUARTERS = QUARTERS;

function bucketize(deals: PerfDeal[]): Record<QuarterKey, PerfDeal[]> {
  const buckets: Record<QuarterKey, PerfDeal[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  for (const d of deals) {
    const dt = new Date(d.entered_at);
    const y = dt.getUTCFullYear();
    if (y !== 2026) continue;
    const m = dt.getUTCMonth(); // 0-11
    const q = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
    buckets[q].push(d);
  }
  return buckets;
}

function nikiFilter(row: any): boolean {
  return row?.deal_owner === NIKI_NAME || row?.manager === NIKI_NAME;
}

/**
 * Consolidated pipeline-data hook. Fetches Niki's Active-Pipeline deals plus
 * every stage-transition log (activity_logs + deal_stage_history) ONCE, then
 * exposes a `entriesFor(stageId)` helper that returns one PerfDeal per deal
 * that ever reached the target stage in 2026.
 *
 * Counting strategy (per the Rep Scorecard spec):
 *   1. Earliest stage_change to=stageId in `activity_logs` wins, then
 *   2. earliest stage_enter in `deal_stage_history` for the same target, then
 *   3. fallback for deals whose CURRENT stage sits at or past the target in
 *      the canonical order but have no log entry → use `deals.created_at`.
 *
 * A deal counts for the period in which it was issued/entered, NOT its
 * current stage. Closed-Lost deals still count for every prior stage they
 * reached. Excluded test-deal names are filtered out.
 */
function useNikiPipelineData() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['niki-perf-pipeline-data'],
    enabled: !!user,
    queryFn: async () => {
      // 1. All deals on the Active Pipeline (regardless of status — Closed Lost
      //    deals still count for the stages they passed through).
      const dealsRes = await supabase
        .from('deals')
        .select('id, company, value, deal_owner, manager, stage, created_at')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID_5THLINE);
      if (dealsRes.error) throw dealsRes.error;
      const allNiki = (dealsRes.data ?? []).filter(
        (d: any) => nikiFilter(d) && !isExcludedDealName(d.company),
      );
      const nikiIds = allNiki.map((d: any) => d.id);
      const dealsById = new Map<string, any>(allNiki.map((d: any) => [d.id, d]));

      if (nikiIds.length === 0) {
        return { allNiki, dealsById, eventsByStage: new Map<string, Map<string, string>>() };
      }

      // 2. All stage-change events for these deals, from BOTH event sources.
      //    activity_logs.metadata->>'to' is the canonical stage id.
      const [alRes, dshRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('deal_id, created_at, metadata')
          .eq('activity_type', 'stage_change')
          .in('deal_id', nikiIds),
        supabase
          .from('deal_stage_history')
          .select('deal_id, changed_at, to_stage, to_stage_id')
          .eq('event_type', 'stage_enter')
          .in('deal_id', nikiIds),
      ]);
      if (alRes.error) throw alRes.error;
      if (dshRes.error) throw dshRes.error;

      // Map<stageId, Map<deal_id, earliest_iso_date>>
      const eventsByStage = new Map<string, Map<string, string>>();
      const record = (stage: string | null | undefined, dealId: string, at: string) => {
        if (!stage || !dealId || !at) return;
        let m = eventsByStage.get(stage);
        if (!m) {
          m = new Map();
          eventsByStage.set(stage, m);
        }
        const prev = m.get(dealId);
        if (!prev || at < prev) m.set(dealId, at);
      };
      for (const r of alRes.data ?? []) {
        const to = (r as any).metadata?.to;
        record(to, r.deal_id, r.created_at);
      }
      for (const r of dshRes.data ?? []) {
        record((r as any).to_stage_id ?? (r as any).to_stage, r.deal_id, r.changed_at);
      }

      return { allNiki, dealsById, eventsByStage };
    },
  });
}

function entriesForStage(
  data: { allNiki: any[]; dealsById: Map<string, any>; eventsByStage: Map<string, Map<string, string>> } | undefined,
  stageId: string,
): PerfDeal[] {
  if (!data) return [];
  const merged = new Map<string, string>(data.eventsByStage.get(stageId) ?? new Map());

  // Fallback: any Niki deal currently at-or-past target stage with no event.
  for (const d of data.allNiki) {
    if (merged.has(d.id)) continue;
    if (isAtOrPast(d.stage, stageId)) {
      merged.set(d.id, d.created_at);
    }
  }

  const out: PerfDeal[] = [];
  for (const [id, at] of merged.entries()) {
    const d = data.dealsById.get(id);
    if (!d) continue;
    out.push({
      deal_id: id,
      company: d.company ?? '—',
      value: Number(d.value) || 0,
      entered_at: at,
    });
  }
  return out;
}

function usePipelineAddedDeals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['niki-perf-added'],
    enabled: !!user,
    queryFn: async (): Promise<PerfDeal[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, deal_owner, manager, created_at')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID_5THLINE)
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-12-31T23:59:59.999Z');
      if (error) throw error;
      return (data ?? [])
        .filter((d: any) => nikiFilter(d) && !isExcludedDealName(d.company))
        .map((d: any) => ({
          deal_id: d.id,
          company: d.company ?? '—',
          value: Number(d.value) || 0,
          entered_at: d.created_at,
        }));
    },
  });
}

export type MetricRowKey =
  | 'dealsOnBoard'
  | 'dollarsOnBoard'
  | 'proposalsIssued'
  | 'dollarsProposed'
  | 'clientsSigned'
  | 'dollarsSigned'
  | 'clientsReceivingTerms'
  | 'termsSigned'
  | 'volumeTermsSigned'
  | 'dealsClosed'
  | 'dollarsFunded'
  | 'retainerRevenue'
  | 'consultingMilestoneRevenue'
  | 'feeRevenue'
  | 'totalRevenue';

export interface MetricRow {
  key: MetricRowKey;
  label: string;
  unit: 'count' | 'currency';
  byQuarter: Record<QuarterKey, { value: number; deals: PerfDeal[] }>;
  yearTotal: number;
  yearDeals: PerfDeal[];
}

export interface NikiPerformanceMetrics {
  isLoading: boolean;
  rows: MetricRow[];
}

function aggregate(
  key: MetricRowKey,
  label: string,
  unit: 'count' | 'currency',
  deals: PerfDeal[],
): MetricRow {
  const buckets = bucketize(deals);
  const byQuarter = {} as MetricRow['byQuarter'];
  let total = 0;
  for (const q of QUARTERS) {
    const list = buckets[q.key];
    const val = unit === 'count' ? list.length : list.reduce((s, d) => s + d.value, 0);
    byQuarter[q.key] = { value: val, deals: list };
    total += val;
  }
  const yearDeals = ([] as PerfDeal[]).concat(...QUARTERS.map(q => buckets[q.key]));
  return { key, label, unit, byQuarter, yearTotal: total, yearDeals };
}

export function useNikiPerformanceMetrics(): NikiPerformanceMetrics {
  const added = usePipelineAddedDeals();
  const pipelineData = useNikiPipelineData();
  const revenue = useNikiRevenueActuals();

  const isLoading =
    added.isLoading ||
    pipelineData.isLoading ||
    revenue.isLoading;

  const rows = useMemo<MetricRow[]>(() => {
    const proposal     = entriesForStage(pipelineData.data, 'proposal-issued');
    const finalCredit  = entriesForStage(pipelineData.data, 'final-credit-items');
    const termsIssued  = entriesForStage(pipelineData.data, 'terms-issued');
    const inDueDil     = entriesForStage(pipelineData.data, 'in-due-diligence');
    const funded       = entriesForStage(pipelineData.data, 'funded-invoiced');
    return [
      aggregate('dealsOnBoard',         'Deals on Board',           'count',    added.data ?? []),
      aggregate('dollarsOnBoard',       'Dollars on Board',         'currency', added.data ?? []),
      aggregate('proposalsIssued',      'Proposals Issued #',       'count',    proposal),
      aggregate('dollarsProposed',      'Dollars Proposed',         'currency', proposal),
      aggregate('clientsSigned',        'Clients Signed',           'count',    finalCredit),
      aggregate('dollarsSigned',        'Dollars Signed',           'currency', finalCredit),
      aggregate('clientsReceivingTerms','Clients Receiving Terms',  'count',    termsIssued),
      aggregate('termsSigned',          'Terms Signed',             'count',    inDueDil),
      aggregate('volumeTermsSigned',    'Volume of Terms Signed',   'currency', inDueDil),
      aggregate('dealsClosed',          'Deals Closed',             'count',    funded),
      aggregate('dollarsFunded',        'Dollars Funded',           'currency', funded),
      aggregate('retainerRevenue',            'Retainer Revenue',  'currency', revenue.data?.retainer ?? []),
      aggregate('consultingMilestoneRevenue', 'Milestone Revenue', 'currency', revenue.data?.milestone ?? []),
      aggregate('feeRevenue',                 'Closing Fee',       'currency', revenue.data?.closing ?? []),
      aggregate('totalRevenue',               'Total Revenue',     'currency', revenue.data?.total ?? []),
    ];
  }, [added.data, pipelineData.data, revenue.data]);

  return { isLoading, rows };
}

/**
 * Niki revenue actuals — pulled from QuickBooks invoices for 5th Line Capital
 * Advisors, LLC (realm 193514877331929 = "Debt"), matched to deals where Niki
 * is owner or deal manager via fuzzy customer_name ↔ deal.company match.
 *
 * Line items are bucketed into:
 *   - retainer:  account/item contains "retainer"
 *   - milestone: account/item contains "milestone" or "consulting"
 *   - closing:   account/item contains "closing fee", "fee revenue",
 *                "success fee", or "advisory fee"
 *
 * `total` is the union of all three categories so the Total Revenue row
 * mirrors retainer + milestone + closing.
 */
const DEBT_REALM_ID = '193514877331929';

/** Strip legal suffixes, parentheticals, and "via X" attribution tails. */
const STOP_TOKENS = new Set([
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'lp', 'llp', 'plc', 'pllc',
  'the', 'and', 'of', 'a', 'an',
]);

function normalizeCompany(name: string | null | undefined): string {
  let s = (name || '').toLowerCase();
  // Strip parenthetical / bracketed asides: "Acme (Series B)" → "Acme"
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // Strip attribution tails: "Upflex via CapitalDesk" → "Upflex"
  s = s.replace(/\s+via\s+.+$/i, ' ').replace(/\s+\/\s+.+$/, ' ');
  s = s.replace(/[.,&'"]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

function significantTokens(name: string): string[] {
  return normalizeCompany(name)
    .split(/\s+/)
    .filter((t) => t && t.length >= 2 && !STOP_TOKENS.has(t));
}

/** Token-sorted canonical form — order-insensitive equality. */
function tokenKey(name: string): string {
  return significantTokens(name).slice().sort().join(' ');
}

/** Jaccard similarity over significant tokens. */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

type RevenueBuckets = {
  retainer: PerfDeal[];
  milestone: PerfDeal[];
  closing: PerfDeal[];
  total: PerfDeal[];
};

interface DealCandidate { id: string; company: string; }

/** Extract second-level-domain token from an email address. */
function emailDomainSld(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 0) return null;
  const host = email.slice(at + 1).toLowerCase().trim();
  if (!host) return null;
  // Strip common public mailbox hosts so we don't bucket every Gmail invoice
  // under a single accidental match.
  const PUBLIC = new Set([
    'gmail.com','yahoo.com','outlook.com','hotmail.com','aol.com','icloud.com',
    'me.com','msn.com','live.com','proton.me','protonmail.com',
  ]);
  if (PUBLIC.has(host)) return null;
  const parts = host.split('.');
  if (parts.length < 2) return null;
  return parts[parts.length - 2];
}

/**
 * Structural invoice → deal matcher. Tries strategies in priority order:
 *   1. Exact normalized name equality
 *   2. Token-sorted equality (handles "Bar Back" ↔ "Back Bar" word-order swaps)
 *   3. Substring containment (length-guarded)
 *   4. Jaccard ≥ 0.6 on significant tokens (length-guarded fallback)
 *
 * `candidates` may include both deal.company and any linked
 * crm_companies.name aliases so a deal still matches when QBO uses the
 * canonical CRM name rather than the legacy deal label.
 */
function matchInvoiceToDeal(
  invoiceCustomerName: string,
  candidates: Array<{ key: string; sortedKey: string; tokens: string[]; deal: DealCandidate }>,
  invoiceEmailDomainSld?: string | null,
  domainIndex?: Map<string, DealCandidate>,
): DealCandidate | null {
  const invKey = normalizeCompany(invoiceCustomerName);
  const invSorted = invoiceCustomerName ? tokenKey(invoiceCustomerName) : '';
  const invTokens = invoiceCustomerName ? significantTokens(invoiceCustomerName) : [];

  if (invKey) {
    // 1 + 2: exact and token-sorted equality
    for (const c of candidates) {
      if (c.key === invKey) return c.deal;
      if (c.sortedKey && c.sortedKey === invSorted) return c.deal;
    }
    // 3: substring containment, guarded by length to avoid spurious hits
    for (const c of candidates) {
      if (c.key.length >= 5 && (invKey.includes(c.key) || c.key.includes(invKey))) {
        return c.deal;
      }
    }
    // 4: Jaccard similarity ≥ 0.6 on significant tokens
    let best: { score: number; deal: DealCandidate } | null = null;
    for (const c of candidates) {
      const s = jaccard(invTokens, c.tokens);
      if (s >= 0.6 && (!best || s > best.score)) best = { score: s, deal: c.deal };
    }
    if (best) return best.deal;
  }

  // 5: Email-domain fallback. QBO often invoices a contact person (e.g.
  // "Steven Adler") rather than the company, but the billing email domain
  // (steven.adler@upflex.com) reliably identifies the company. We match the
  // domain's second-level label against any deal whose CRM company shares
  // that domain, or whose normalized name equals the domain SLD.
  if (invoiceEmailDomainSld) {
    const fromIdx = domainIndex?.get(invoiceEmailDomainSld);
    if (fromIdx) return fromIdx;
    for (const c of candidates) {
      if (c.key === invoiceEmailDomainSld) return c.deal;
      if (c.tokens.includes(invoiceEmailDomainSld)) return c.deal;
    }
  }
  return null;
}

/**
 * Classify a QBO sales-item line into one of the Performance revenue buckets
 * based on the item / account reference. Returns null for non-revenue lines
 * (taxes, discounts, expense reimbursements, etc.) so they're excluded.
 */
function classifyRevenueLine(blob: string): 'retainer' | 'milestone' | 'closing' | null {
  if (/\bretainer\b/.test(blob)) return 'retainer';
  if (/\bmilestone\b|\bconsulting\b/.test(blob)) return 'milestone';
  if (
    /\bclosing fee\b|\bsuccess fee\b|\badvisory fee\b|\bfee revenue\b|\bplacement fee\b/.test(blob)
  ) return 'closing';
  return null;
}

function useNikiRevenueActuals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['niki-perf-revenue-actuals'],
    enabled: !!user,
    queryFn: async (): Promise<RevenueBuckets> => {
      // 1. Niki deals — attribute on deal_owner OR manager. Two simple
      // queries are easier to reason about than a PostgREST .or() filter
      // on string columns and avoid quoting surprises.
      const [ownedRes, managedRes] = await Promise.all([
        supabase
          .from('deals')
          .select('id, company, crm_company_id, deal_owner, manager')
          .eq('deal_owner', NIKI_NAME),
        supabase
          .from('deals')
          .select('id, company, crm_company_id, deal_owner, manager')
          .eq('manager', NIKI_NAME),
      ]);
      if (ownedRes.error) throw ownedRes.error;
      if (managedRes.error) throw managedRes.error;
      const dedup = new Map<string, any>();
      for (const d of [...(ownedRes.data ?? []), ...(managedRes.data ?? [])]) {
        if (!d?.id) continue;
        if (isExcludedDealName(d.company)) continue;
        if (!dedup.has(d.id)) dedup.set(d.id, d);
      }
      const nikiDeals = Array.from(dedup.values());

      // 1b. Hydrate canonical CRM-company aliases. We resolve aliases through
      // two paths because deals are not always linked via `crm_company_id`:
      //   (a) explicit crm_company_id → crm_companies row
      //   (b) implicit name match: deals.company ↔ crm_companies.name
      // Both paths contribute a `name` alias plus a `domain` alias so we can
      // match QBO invoices whose customer is a contact person rather than
      // the company (Upflex: customer="Steven Adler", email=…@upflex.com).
      type CrmRow = { id: string; name: string | null; domain: string | null };
      const crmRowsAll: CrmRow[] = [];
      const crmIds = Array.from(new Set(nikiDeals.map((d) => d.crm_company_id).filter(Boolean)));
      if (crmIds.length > 0) {
        const { data: byId } = await supabase
          .from('crm_companies')
          .select('id, name, domain')
          .in('id', crmIds);
        for (const c of (byId ?? []) as CrmRow[]) crmRowsAll.push(c);
      }
      const candidateNames = Array.from(new Set(
        nikiDeals.map((d) => (d.company || '').trim()).filter(Boolean),
      ));
      if (candidateNames.length > 0) {
        const { data: byName } = await supabase
          .from('crm_companies')
          .select('id, name, domain')
          .in('name', candidateNames);
        for (const c of (byName ?? []) as CrmRow[]) crmRowsAll.push(c);
      }
      const crmById = new Map<string, CrmRow>();
      const crmByNormName = new Map<string, CrmRow>();
      for (const c of crmRowsAll) {
        if (c.id) crmById.set(c.id, c);
        const nk = normalizeCompany(c.name);
        if (nk) crmByNormName.set(nk, c);
      }

      // 1c. Build candidate list: one entry per (deal, alias-name). Also
      // build a domain → deal index used as an email-domain fallback when
      // the invoice customer name doesn't resolve to any deal.
      const candidates: Array<{
        key: string; sortedKey: string; tokens: string[]; deal: DealCandidate;
      }> = [];
      const domainIndex = new Map<string, DealCandidate>();
      const seenAlias = new Set<string>();
      const pushAlias = (deal: DealCandidate, alias: string | null | undefined) => {
        const key = normalizeCompany(alias);
        if (!key) return;
        const dedupeKey = `${deal.id}::${key}`;
        if (seenAlias.has(dedupeKey)) return;
        seenAlias.add(dedupeKey);
        candidates.push({
          key,
          sortedKey: tokenKey(alias!),
          tokens: significantTokens(alias!),
          deal,
        });
      };
      const pushDomain = (deal: DealCandidate, domain: string | null | undefined) => {
        if (!domain) return;
        const sld = domain.toLowerCase().trim().split('.').filter(Boolean)[0];
        if (!sld) return;
        if (!domainIndex.has(sld)) domainIndex.set(sld, deal);
      };
      for (const d of nikiDeals) {
        const deal: DealCandidate = { id: d.id, company: d.company ?? '—' };
        pushAlias(deal, d.company);
        const crmDirect = d.crm_company_id ? crmById.get(d.crm_company_id) : undefined;
        const crmFallback = crmByNormName.get(normalizeCompany(d.company));
        const crm = crmDirect ?? crmFallback;
        if (crm) {
          pushAlias(deal, crm.name);
          pushDomain(deal, crm.domain);
        }
      }

      // 2. QBO invoices for Debt realm in 2026.
      const { data: invs, error: invErr } = await supabase
        .from('quickbooks_invoices')
        .select('id, customer_name, txn_date, total_amt, metadata')
        .eq('realm_id', DEBT_REALM_ID)
        .gte('txn_date', '2026-01-01')
        .lte('txn_date', '2026-12-31');
      if (invErr) throw invErr;

      const buckets: RevenueBuckets = { retainer: [], milestone: [], closing: [], total: [] };

      for (const inv of (invs ?? []) as any[]) {
        const billEmail =
          (inv.metadata?.BillEmail?.Address as string | undefined) ||
          (inv.metadata?.CustomerMemo?.value as string | undefined) ||
          null;
        const emailSld = emailDomainSld(billEmail);
        const match = matchInvoiceToDeal(
          inv.customer_name || '',
          candidates,
          emailSld,
          domainIndex,
        );
        if (!match) continue;

        const lines = (inv.metadata?.Line || []) as any[];
        if (!Array.isArray(lines)) continue;
        let lineIdx = 0;
        for (const line of lines) {
          if (line?.DetailType !== 'SalesItemLineDetail') continue;
          const detail = line.SalesItemLineDetail || {};
          const acct = String(detail?.ItemAccountRef?.name || '').toLowerCase();
          const item = String(detail?.ItemRef?.name || '').toLowerCase();
          const blob = `${acct} ${item}`;
          const amount = Number(line.Amount);
          if (!Number.isFinite(amount) || amount === 0) continue;
          const category = classifyRevenueLine(blob);
          if (!category) continue;

          const entry: PerfDeal = {
            deal_id: `${match.id}:${inv.id}:${lineIdx}`,
            company: match.company,
            value: amount,
            entered_at: `${inv.txn_date}T00:00:00.000Z`,
          };
          buckets[category].push(entry);
          buckets.total.push(entry);
          lineIdx++;
        }
      }

      return buckets;
    },
  });
}

/**
 * Plan values pulled directly from the Rep Performance & Pipeline Model sheet
 * (2026 quarterly + annual columns). Keep in sync with `repModelData.ts`.
 * Currency values are in raw USD.
 */
const MM = 1_000_000;
const K = 1_000;
export const NIKI_PLAN_2026: Record<MetricRowKey, { Q1: number; Q2: number; Q3: number; Q4: number; total: number }> = {
  dealsOnBoard:          { Q1: 33,          Q2: 33,          Q3: 33,          Q4: 33,          total: 132 },
  dollarsOnBoard:        { Q1: 90.9 * MM,   Q2: 90.9 * MM,   Q3: 90.9 * MM,   Q4: 151.5 * MM,  total: 424.2 * MM },
  proposalsIssued:       { Q1: 21,          Q2: 21,          Q3: 21,          Q4: 21,          total: 84 },
  dollarsProposed:       { Q1: 60 * MM,     Q2: 60 * MM,     Q3: 60 * MM,     Q4: 80 * MM,     total: 260 * MM },
  clientsSigned:         { Q1: 11,          Q2: 12,          Q3: 12,          Q4: 12,          total: 47 },
  dollarsSigned:         { Q1: 32 * MM,     Q2: 36 * MM,     Q3: 36 * MM,     Q4: 36 * MM,     total: 140 * MM },
  clientsReceivingTerms: { Q1: 12,          Q2: 11,          Q3: 12,          Q4: 12,          total: 47 },
  termsSigned:           { Q1: 12,          Q2: 11,          Q3: 12,          Q4: 12,          total: 47 },
  volumeTermsSigned:     { Q1: 30 * MM,     Q2: 27.4 * MM,   Q3: 36 * MM,     Q4: 36 * MM,     total: 129.4 * MM },
  dealsClosed:           { Q1: 6,           Q2: 12,          Q3: 11,          Q4: 12,          total: 41 },
  dollarsFunded:         { Q1: 24 * MM,     Q2: 31.4 * MM,   Q3: 32 * MM,     Q4: 36 * MM,     total: 123.4 * MM },
  retainerRevenue:            { Q1: 36.3 * K,  Q2: 43.5 * K,  Q3: 43.5 * K,  Q4: 43.5 * K,  total: 166.8 * K },
  consultingMilestoneRevenue: { Q1: 158.7 * K, Q2: 134.0 * K, Q3: 158.7 * K, Q4: 158.7 * K, total: 610.1 * K },
  feeRevenue:                 { Q1: 600 * K,   Q2: 755 * K,   Q3: 770 * K,   Q4: 870 * K,   total: 2995 * K },
  totalRevenue:               { Q1: 790 * K,   Q2: 930 * K,   Q3: 970 * K,   Q4: 1070 * K,  total: 3760 * K },
};