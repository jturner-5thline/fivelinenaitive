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

function useStageEntryDeals(stageId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['niki-perf-stage', stageId],
    enabled: !!user,
    queryFn: async (): Promise<PerfDeal[]> => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select(`deal_id, created_at, deals!inner(company, value, deal_owner, manager, pipeline_id)`)
        .eq('activity_type', 'stage_change')
        .eq('metadata->>to', stageId)
        .eq('deals.pipeline_id', ACTIVE_PIPELINE_ID_5THLINE)
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-12-31T23:59:59.999Z')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const seen = new Map<string, PerfDeal>();
      for (const row of data ?? []) {
        const d: any = (row as any).deals;
        if (!d || !nikiFilter(d)) continue;
        if (isExcludedDealName(d.company)) continue;
        if (seen.has(row.deal_id)) continue; // first entry only
        seen.set(row.deal_id, {
          deal_id: row.deal_id,
          company: d.company ?? '—',
          value: Number(d.value) || 0,
          entered_at: row.created_at,
        });
      }
      return Array.from(seen.values());
    },
  });
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
  const proposal = useStageEntryDeals('proposal-issued');
  const finalCredit = useStageEntryDeals('final-credit-items');
  const termsIssued = useStageEntryDeals('terms-issued');
  const inDueDil = useStageEntryDeals('in-due-diligence');
  const funded = useStageEntryDeals('funded-invoiced');
  const revenue = useNikiRevenueActuals();

  const isLoading =
    added.isLoading ||
    proposal.isLoading ||
    finalCredit.isLoading ||
    termsIssued.isLoading ||
    inDueDil.isLoading ||
    funded.isLoading ||
    revenue.isLoading;

  const rows = useMemo<MetricRow[]>(() => {
    return [
      aggregate('dealsOnBoard',         'Deals on Board',           'count',    added.data ?? []),
      aggregate('dollarsOnBoard',       'Dollars on Board',         'currency', added.data ?? []),
      aggregate('proposalsIssued',      'Proposals Issued #',       'count',    proposal.data ?? []),
      aggregate('dollarsProposed',      'Dollars Proposed',         'currency', proposal.data ?? []),
      aggregate('clientsSigned',        'Clients Signed',           'count',    finalCredit.data ?? []),
      aggregate('dollarsSigned',        'Dollars Signed',           'currency', finalCredit.data ?? []),
      aggregate('clientsReceivingTerms','Clients Receiving Terms',  'count',    termsIssued.data ?? []),
      aggregate('termsSigned',          'Terms Signed',             'count',    inDueDil.data ?? []),
      aggregate('volumeTermsSigned',    'Volume of Terms Signed',   'currency', inDueDil.data ?? []),
      aggregate('dealsClosed',          'Deals Closed',             'count',    funded.data ?? []),
      aggregate('dollarsFunded',        'Dollars Funded',           'currency', funded.data ?? []),
      aggregate('retainerRevenue',            'Retainer Revenue',  'currency', revenue.data?.retainer ?? []),
      aggregate('consultingMilestoneRevenue', 'Milestone Revenue', 'currency', revenue.data?.milestone ?? []),
      aggregate('feeRevenue',                 'Closing Fee',       'currency', revenue.data?.closing ?? []),
      aggregate('totalRevenue',               'Total Revenue',     'currency', revenue.data?.total ?? []),
    ];
  }, [added.data, proposal.data, finalCredit.data, termsIssued.data, inDueDil.data, funded.data, revenue.data]);

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

function normalizeCompany(name: string | null | undefined): string {
  return (name || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(llc|inc|corp|co|company|ltd|holdings?|group|technologies|holding)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type RevenueBuckets = {
  retainer: PerfDeal[];
  milestone: PerfDeal[];
  closing: PerfDeal[];
  total: PerfDeal[];
};

function useNikiRevenueActuals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['niki-perf-revenue-actuals'],
    enabled: !!user,
    queryFn: async (): Promise<RevenueBuckets> => {
      // 1. Niki deals (any pipeline) — build matchable normalized-name set.
      const { data: dealsData, error: dealsErr } = await supabase
        .from('deals')
        .select('id, company, value, deal_owner, manager')
        .or(`deal_owner.eq.${NIKI_NAME},manager.eq.${NIKI_NAME}`);
      if (dealsErr) throw dealsErr;
      const nikiDeals = (dealsData ?? []).filter((d: any) => !isExcludedDealName(d.company));
      const nikiCompanyMap = new Map<string, { id: string; company: string }>();
      for (const d of nikiDeals as any[]) {
        const k = normalizeCompany(d.company);
        if (k && !nikiCompanyMap.has(k)) {
          nikiCompanyMap.set(k, { id: d.id, company: d.company });
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
        const custKey = normalizeCompany(inv.customer_name);
        if (!custKey) continue;
        // Match by exact normalized equality OR substring containment.
        let match = nikiCompanyMap.get(custKey);
        if (!match) {
          for (const [k, v] of nikiCompanyMap) {
            if (k.length >= 4 && (custKey.includes(k) || k.includes(custKey))) {
              match = v;
              break;
            }
          }
        }
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

          let category: keyof RevenueBuckets | null = null;
          if (blob.includes('retainer')) category = 'retainer';
          else if (blob.includes('milestone') || blob.includes('consulting')) category = 'milestone';
          else if (
            blob.includes('closing fee') ||
            blob.includes('fee revenue') ||
            blob.includes('success fee') ||
            blob.includes('advisory fee')
          ) category = 'closing';
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