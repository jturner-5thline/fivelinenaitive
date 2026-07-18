import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { usePerformanceAssignee } from '@/hooks/usePerformanceAssignee';

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
/**
 * "In Development" pipeline for 5th Line. Deals here are also owned/managed
 * by reps and their stage transitions (Proposal Issued, Final Credit Items,
 * Terms Issued, etc.) count toward the same Performance actuals as the
 * Active pipeline. NOTE: In Development uses overloaded stage IDs, so we
 * count these deals via explicit stage_history events only — never via the
 * "current stage at-or-past target" fallback (see STAGE_ORDER_ACTIVE).
 */
export const IN_DEVELOPMENT_PIPELINE_ID_5THLINE = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
/**
 * FinServ Pipeline for 5th Line. Used to source actuals for the
 * "FinServ: Deals on the Board" / "FinServ $ on the Board" rows in the
 * rep-performance scorecard. Every deal in this pipeline counts as
 * "on the board" from its `created_at` date.
 */
export const FINSERV_PIPELINE_ID_5THLINE = '6907be5e-b17c-4a95-a7c2-fd977c94e179';
const PIPELINE_IDS_5THLINE = [
  ACTIVE_PIPELINE_ID_5THLINE,
  IN_DEVELOPMENT_PIPELINE_ID_5THLINE,
] as const;
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

/**
 * Normalize any raw stage label (from activity_logs.metadata.to,
 * deal_stage_history.to_stage / to_stage_id) into the canonical slug used
 * throughout this file. Handles "Proposal Issued", "proposal-issued",
 * "PROPOSAL_ISSUED", etc.
 */
function normalizeStageKey(s: string | null | undefined): string | null {
  if (!s) return null;
  return String(s).toLowerCase().trim().replace(/[_\s]+/g, '-');
}
function isAtOrPast(currentStage: string | null | undefined, targetStage: string): boolean {
  const c = stageIdx(normalizeStageKey(currentStage) ?? currentStage);
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

/**
 * Build a client-side assignee filter.
 * - `names` empty  → whole-team view: every row passes.
 * - `names` non-empty → keep rows where deal_owner OR manager matches any of
 *   the selected names.
 */
function makeAssigneeFilter(names: readonly string[]) {
  if (!names || names.length === 0) return (_row: any): boolean => true;
  const set = new Set(names);
  return (row: any): boolean =>
    (row?.deal_owner && set.has(row.deal_owner)) ||
    (row?.manager && set.has(row.manager));
}

// Keep `.in(...)` REST URLs small. Large sibling groups can otherwise create
// a 400 Bad Request from PostgREST and leave the Performance tab with no data.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchActivityStageRows(dealIds: string[]): Promise<any[]> {
  if (dealIds.length === 0) return [];
  const batches = await Promise.all(
    chunk(dealIds, 75).map((ids) =>
      supabase
        .from('activity_logs')
        .select('deal_id, created_at, metadata')
        .eq('activity_type', 'stage_change')
        .in('deal_id', ids),
    ),
  );
  const rows: any[] = [];
  for (const res of batches) {
    if (res.error) throw res.error;
    rows.push(...(res.data ?? []));
  }
  return rows;
}

async function fetchDealStageHistoryRows(dealIds: string[]): Promise<any[]> {
  if (dealIds.length === 0) return [];
  const batches = await Promise.all(
    chunk(dealIds, 75).map((ids) =>
      supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, to_stage, to_stage_id')
        .eq('event_type', 'stage_enter')
        .in('deal_id', ids),
    ),
  );
  const rows: any[] = [];
  for (const res of batches) {
    if (res.error) throw res.error;
    rows.push(...(res.data ?? []));
  }
  return rows;
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
  const { selected } = usePerformanceAssignee();
  const nikiFilter = makeAssigneeFilter(selected);
  const scopeKey = selected.length === 0 ? '__team__' : selected.slice().sort().join('|');
  return useQuery({
    queryKey: ['niki-perf-pipeline-data', scopeKey, 'v5-name-siblings'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // 1. All deals on the Active Pipeline (regardless of status — Closed Lost
      //    deals still count for the stages they passed through).
      // Filter by assignee SERVER-SIDE when a name filter is active. The two
      // pipelines combined exceed PostgREST's 1000-row default cap, so a
      // naive client-side filter silently drops deals (bug: Phospholutions
      // was missing from "Proposals Issued" until this scope was tightened).
      // When `selected` is empty we're in whole-team view and pull every deal
      // in the two 5th Line pipelines (no owner/manager restriction).
      const baseSelect = 'id, company, company_id, value, deal_owner, manager, stage, created_at, pipeline_id';
      let rows: any[] = [];
      if (selected.length === 0) {
        const { data, error } = await supabase
          .from('deals')
          .select(baseSelect)
          .in('pipeline_id', PIPELINE_IDS_5THLINE as unknown as string[]);
        if (error) throw error;
        rows = data ?? [];
      } else {
        const [ownedRes, managedRes] = await Promise.all([
          supabase
            .from('deals')
            .select(baseSelect)
            .in('pipeline_id', PIPELINE_IDS_5THLINE as unknown as string[])
            .in('deal_owner', selected as unknown as string[]),
          supabase
            .from('deals')
            .select(baseSelect)
            .in('pipeline_id', PIPELINE_IDS_5THLINE as unknown as string[])
            .in('manager', selected as unknown as string[]),
        ]);
        if (ownedRes.error) throw ownedRes.error;
        if (managedRes.error) throw managedRes.error;
        rows = [...(ownedRes.data ?? []), ...(managedRes.data ?? [])];
      }

      const primaryById = new Map<string, any>();
      for (const d of rows) {
        if (!d?.id || isExcludedDealName(d.company)) continue;
        if (!primaryById.has(d.id)) primaryById.set(d.id, d);
      }
      const primaryNiki = Array.from(primaryById.values()).filter((d: any) => nikiFilter(d));

      const primaryIds = primaryNiki.map((d: any) => d.id);
      const companyNames = Array.from(
        new Set(primaryNiki.map((d: any) => String(d.company ?? '').trim()).filter(Boolean)),
      );

      if (primaryIds.length === 0) {
        return {
          allNiki: [] as any[],
          dealsById: new Map<string, any>(),
          eventsByStage: new Map<string, Map<string, string>>(),
        };
      }

      // Fetch same-company sibling deals AND primary stage events in parallel.
      // Avoid company_id expansion here: legacy imported rows share a generic
      // company_id, which was pulling 1,400+ unrelated deals and causing the
      // stage-log requests to exceed URL limits.
      const [siblingBatches, alPrimaryRows, dshPrimaryRows] = await Promise.all([
        Promise.all(
          chunk(companyNames, 50).map((names) =>
            supabase
              .from('deals')
              .select(baseSelect)
              .in('pipeline_id', PIPELINE_IDS_5THLINE as unknown as string[])
              .in('company', names),
          ),
        ),
        fetchActivityStageRows(primaryIds),
        fetchDealStageHistoryRows(primaryIds),
      ]);

      const siblingRows: any[] = [];
      for (const res of siblingBatches) {
        if (res.error) throw res.error;
        siblingRows.push(...(res.data ?? []));
      }

      const primaryIdSet = new Set(primaryIds);
      const siblings = siblingRows.filter(
        (d: any) => !primaryIdSet.has(d.id) && !isExcludedDealName(d.company),
      );
      const allNiki = [...primaryNiki, ...siblings];
      const dealsById = new Map<string, any>(allNiki.map((d: any) => [d.id, d]));
      const siblingIds = siblings.map((d: any) => d.id);

      // Top up stage events for sibling IDs only (skipped when none).
      let alSiblingRows: any[] = [];
      let dshSiblingRows: any[] = [];
      if (siblingIds.length > 0) {
        [alSiblingRows, dshSiblingRows] = await Promise.all([
          fetchActivityStageRows(siblingIds),
          fetchDealStageHistoryRows(siblingIds),
        ]);
      }

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
      for (const r of [...alPrimaryRows, ...alSiblingRows]) {
        const to = normalizeStageKey((r as any).metadata?.to);
        const from = normalizeStageKey((r as any).metadata?.from);
        record(to, r.deal_id, r.created_at);

        // Some imported 5th Line history only captured a deal leaving a stage
        // (e.g. Lango: final-credit-items → client-strategy-review) without a
        // matching entry event. Treat the exit as evidence the deal reached
        // that stage so YTD stage-based actuals include it.
        record(from, r.deal_id, r.created_at);
      }
      for (const r of [...dshPrimaryRows, ...dshSiblingRows]) {
        const key =
          normalizeStageKey((r as any).to_stage_id) ??
          normalizeStageKey((r as any).to_stage);
        record(key, r.deal_id, r.changed_at);
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

  // Fallback: any Active-pipeline deal currently at-or-past the target stage
  // with no explicit event. Skipped for In Development pipeline deals
  // because that pipeline's stage IDs are overloaded (e.g. 'closed-won' =
  // "Indication of Interest") and can't be ordered against STAGE_ORDER_ACTIVE.
  for (const d of data.allNiki) {
    if (merged.has(d.id)) continue;
    if (d.pipeline_id && d.pipeline_id !== ACTIVE_PIPELINE_ID_5THLINE) continue;
    if (isAtOrPast(d.stage, stageId)) {
      merged.set(d.id, d.created_at);
    }
  }

  // In Development pipeline fallback for "Proposals Issued": every deal that
  // lives on the In Development pipeline is, by definition, a proposal the
  // rep has already issued (that's the entry criterion for the pipeline).
  // Count each such deal once, using its earliest known stage event or
  // `created_at` as the entry timestamp — regardless of current stage
  // (including on-hold / closed-lost, which still had a proposal issued).
  if (stageId === 'proposal-issued') {
    for (const d of data.allNiki) {
      if (merged.has(d.id)) continue;
      if (d.pipeline_id !== IN_DEVELOPMENT_PIPELINE_ID_5THLINE) continue;
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
  const { selected } = usePerformanceAssignee();
  const nikiFilter = makeAssigneeFilter(selected);
  const scopeKey = selected.length === 0 ? '__team__' : selected.slice().sort().join('|');
  return useQuery({
    queryKey: ['niki-perf-added', scopeKey],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
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

/**
 * Deals added to the FinServ Pipeline within the year. Not scoped by
 * assignee — FinServ deals are tracked at the pipeline level, not per rep.
 */
function useFinServAddedDeals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['niki-perf-finserv-added'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<PerfDeal[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, created_at')
        .eq('pipeline_id', FINSERV_PIPELINE_ID_5THLINE)
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-12-31T23:59:59.999Z');
      if (error) throw error;
      return (data ?? [])
        .filter((d: any) => !isExcludedDealName(d.company))
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
  const finservAdded = useFinServAddedDeals();

  // Render the scorecard immediately with plan values / zeroed actuals, then
  // hydrate actuals as each query completes. Blocking the whole tab on these
  // queries made the Performance tab appear empty on slower requests.
  const isLoading = false;

  const rows = useMemo<MetricRow[]>(() => {
    const proposal     = entriesForStage(pipelineData.data, 'proposal-issued');
    const finalCredit  = entriesForStage(pipelineData.data, 'final-credit-items');
    const termsIssued  = entriesForStage(pipelineData.data, 'terms-issued');
    const inDueDil     = entriesForStage(pipelineData.data, 'in-due-diligence');
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
      aggregate('dealsClosed',          'FinServ: Deals on the Board', 'count',    finservAdded.data ?? []),
      aggregate('dollarsFunded',        'FinServ $ on the Board',      'currency', finservAdded.data ?? []),
      aggregate('retainerRevenue',            'Retainer Revenue',  'currency', revenue.data?.retainer ?? []),
      aggregate('consultingMilestoneRevenue', 'Milestone Revenue', 'currency', revenue.data?.milestone ?? []),
      aggregate('feeRevenue',                 'Closing Fee',       'currency', revenue.data?.closing ?? []),
      aggregate('totalRevenue',               'Total Revenue',     'currency', revenue.data?.total ?? []),
    ];
  }, [added.data, pipelineData.data, revenue.data, finservAdded.data]);

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
  const { selected } = usePerformanceAssignee();
  const scopeKey = selected.length === 0 ? '__team__' : selected.slice().sort().join('|');
  return useQuery({
    queryKey: ['niki-perf-revenue-actuals', scopeKey],
    enabled: !!user,
    queryFn: async (): Promise<RevenueBuckets> => {
      // 1. Attribute deals on deal_owner OR manager against the current
      // assignee selection. Empty selection = whole-team view (no filter).
      let rows: any[] = [];
      if (selected.length === 0) {
        const { data, error } = await supabase
          .from('deals')
          .select('id, company, crm_company_id, deal_owner, manager');
        if (error) throw error;
        rows = data ?? [];
      } else {
        const [ownedRes, managedRes] = await Promise.all([
          supabase
            .from('deals')
            .select('id, company, crm_company_id, deal_owner, manager')
            .in('deal_owner', selected as unknown as string[]),
          supabase
            .from('deals')
            .select('id, company, crm_company_id, deal_owner, manager')
            .in('manager', selected as unknown as string[]),
        ]);
        if (ownedRes.error) throw ownedRes.error;
        if (managedRes.error) throw managedRes.error;
        rows = [...(ownedRes.data ?? []), ...(managedRes.data ?? [])];
      }
      const dedup = new Map<string, any>();
      for (const d of rows) {
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