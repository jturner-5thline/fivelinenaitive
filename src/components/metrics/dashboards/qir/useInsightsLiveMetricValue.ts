/**
 * Live KPI metric resolver.
 *
 * Maps an Insights metric source id (matches METRIC_WIDGET_DATA_SOURCES.id)
 * to a live value pulled from the SAME hooks that power the canonical
 * source surfaces — namely:
 *
 *  - Controller Dashboard / QuickBooks Financial Dashboard
 *      → useQuickBooksMetrics(undefined, period)  (qb-*, xs-* QB-derived)
 *  - Weekly Rundown deal/pipeline widgets and the Insights deal stats
 *      → useMetricsData() + computeFilteredDealMetrics (active-pipeline,
 *        closed-won, total-fees, avg-deal-size, xs-* deal-derived)
 *  - HubSpot dashboard widgets
 *      → useHubSpotMetrics() (hs-*)
 *
 * Returning `supported: false` from this hook is the signal to the KPI
 * card that no canonical resolver is wired for the given metric id and
 * the card should render the "Unmapped" badge instead of a fabricated
 * value.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  endOfMonth,
  endOfQuarter,
  format,
  isWithinInterval,
  parse,
  parseISO,
  startOfMonth,
  startOfQuarter,
} from 'date-fns';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useHubSpotMetrics } from '@/hooks/useHubSpotMetrics';
import {
  FINSERV_PIPELINE_ID,
  ACTIVE_CLIENT_STAGE,
  applyActiveClientOverride,
  useFinServTotalRevenue,
} from '@/hooks/useFinServFinancialMetrics';
import { useCompany } from '@/hooks/useCompany';
import { buildBuckets } from '@/lib/insightsTimeRange';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { ReportState } from '../QuarterlyInsightsReport';
import { subMonths, subQuarters } from 'date-fns';

export interface LiveMetricPeriod {
  start: string; // ymd inclusive
  end: string;   // ymd inclusive
  label: string;
}

/**
 * Split a period into per-month sub-periods (used by the "By month"
 * toggle on KPI widgets when a quarter or multi-month range is
 * selected). Returns null when the range spans fewer than 2 months.
 */
export function getMonthlyBreakdownPeriods(
  period: LiveMetricPeriod | null | undefined,
): LiveMetricPeriod[] | null {
  if (!period) return null;
  const s = new Date(period.start + 'T00:00:00');
  const e = new Date(period.end + 'T00:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  const months: LiveMetricPeriod[] = [];
  let cursor = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cursor <= e) {
    const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const clampedStart = mStart < s ? s : mStart;
    const clampedEnd = mEnd > e ? e : mEnd;
    months.push({
      start: format(clampedStart, 'yyyy-MM-dd'),
      end: format(clampedEnd, 'yyyy-MM-dd'),
      label: format(mStart, 'MMM yyyy'),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  if (months.length < 2) return null;
  return months;
}

/** Derive a {start,end,label} period from a report's quarter/month state. */
export function deriveReportPeriod(
  s: Pick<ReportState, 'period' | 'quarter' | 'month'>,
): LiveMetricPeriod | null {
  try {
    if (s.period === 'monthly' && s.month) {
      const d = parse(s.month, 'LLLL yyyy', new Date());
      if (Number.isNaN(d.getTime())) return null;
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
        label: s.month,
      };
    }
    // Quarterly: "Q1 2026"
    if (s.quarter) {
      const [qPart, yearPart] = s.quarter.split(' ');
      const qNum = Number((qPart || '').replace(/[^\d]/g, ''));
      const year = Number(yearPart);
      if (!qNum || !year) return null;
      const monthIdx = (qNum - 1) * 3; // 0,3,6,9
      const anchor = new Date(year, monthIdx, 15);
      const start = startOfQuarter(anchor);
      const end = endOfQuarter(anchor);
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
        label: s.quarter,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Filter raw deals by updated_at within [start,end] (matches
 *  Insights' `computeFilteredDealMetrics` semantics). */
function filterDealsByPeriod(rawDeals: any[] | undefined, period: LiveMetricPeriod) {
  if (!rawDeals?.length) return [] as any[];
  return rawDeals.filter(d => {
    if (isExcludedDealName(d.company)) return false;
    if (!d.updated_at) return false;
    const updatedAt = parseISO(d.updated_at);
    if (Number.isNaN(updatedAt.getTime())) return false;
    return isWithinInterval(updatedAt, {
      start: parseISO(`${period.start}T00:00:00`),
      end: parseISO(`${period.end}T23:59:59`),
    });
  });
}

export type LiveMetricStatus = 'loading' | 'ready' | 'unmapped';

export interface LiveMetricResolution {
  /** Whether a canonical resolver exists for this metricSourceId. */
  supported: boolean;
  status: LiveMetricStatus;
  /** Numeric value (raw). Undefined when not yet loaded / unsupported. */
  value?: number;
  /** Human-readable source surface, for the "from" caption on the card. */
  sourceSurface?: string;
  /** Value for the immediately-preceding period of equal length (when available). */
  previousValue?: number;
  /** Absolute delta vs the previous period. */
  changeAbsolute?: number;
  /** Percentage change vs the previous period. */
  changePct?: number;
}

/**
 * Returns the LIVE value of a metric for the given report period.
 * The hook subscribes to the same React Query caches as the source
 * surfaces, so a Sync/Refresh on Controller Dashboard or Weekly Rundown
 * propagates here automatically.
 */
export function useInsightsLiveMetricValue(
  metricSourceId: string | null | undefined,
  period: LiveMetricPeriod | null,
): LiveMetricResolution {
  const dealMetrics = useMetricsData();
  const qb = useQuickBooksMetrics(undefined, period ? { start: period.start, end: period.end } : undefined);
  const hs = useHubSpotMetrics();
  const { company } = useCompany();

  // FinServ per-hour tiles share the same numerator source (FinServ P&L
  // snapshot) as the FinServ Financial Metrics dashboard, and the same
  // denominator (manual `revenue_per_hour_hours` inputs).
  const perHourEnabled =
    metricSourceId === 'finserv-revenue-per-hour' ||
    metricSourceId === 'finserv-profit-per-hour' ||
    metricSourceId === 'finserv-avg-revenue-per-client';
  const perHourPeriod = useMemo(
    () => perHourEnabled && period
      ? { start_date: period.start, end_date: period.end, label: period.label }
      : null,
    [perHourEnabled, period?.start, period?.end, period?.label],
  );
  const finservRev = useFinServTotalRevenue(perHourPeriod, 'monthly');
  const perHourMonthKeys = useMemo(
    () => perHourEnabled && period
      ? buildBuckets(period.start, period.end, 'monthly').map(b => b.key)
      : [],
    [perHourEnabled, period?.start, period?.end],
  );
  const perHourHours = useQuery({
    enabled: perHourEnabled && perHourMonthKeys.length > 0,
    queryKey: ['insights-live-finserv-per-hour-hours', company?.id ?? null, perHourMonthKeys.join('|')],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('metric_manual_inputs')
        .select('value')
        .eq('metric_key', 'revenue_per_hour_hours')
        .in('month_key', perHourMonthKeys);
      q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.value ?? 0), 0);
    },
  });

  // Utilization = sum(billable) / sum(capacity) across Scott/Siddhi/Kris
  // for every month bucket in the report period. Blended % returned.
  const utilEnabled = metricSourceId === 'finserv-utilization';
  const utilMonthKeys = useMemo(
    () => utilEnabled && period
      ? buildBuckets(period.start, period.end, 'monthly').map(b => b.key)
      : [],
    [utilEnabled, period?.start, period?.end],
  );
  const utilMetricKeys = useMemo(
    () => ['scott', 'siddhi', 'kris'].map(s => `util_pct_${s}`),
    [],
  );
  const utilization = useQuery({
    enabled: utilEnabled && utilMonthKeys.length > 0,
    queryKey: ['insights-live-finserv-utilization', company?.id ?? null, utilMonthKeys.join('|')],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('metric_manual_inputs')
        .select('value')
        .in('metric_key', utilMetricKeys)
        .in('month_key', utilMonthKeys);
      q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const vals: number[] = [];
      for (const r of data ?? []) {
        const v = (r as any).value;
        if (v != null && Number.isFinite(Number(v))) vals.push(Number(v));
      }
      return vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
    },
  });

  // ---- Brand Awareness (workbook-entered metrics) ----
  const isBrandAwareness = !!metricSourceId && metricSourceId.startsWith('ba-');
  const baKeys = useMemo(() => {
    const empty = {
      currentMonths: [] as string[],
      currentQuarters: [] as string[],
      priorMonths: [] as string[],
      priorQuarters: [] as string[],
    };
    if (!isBrandAwareness || !period) return empty;
    const monthBuckets = buildBuckets(period.start, period.end, 'monthly');
    const quarterBuckets = buildBuckets(period.start, period.end, 'quarterly');
    const priorMonths = monthBuckets.map(b => {
      const [y, m] = b.key.split('-').map(Number);
      const d = subMonths(new Date(y, m - 1, 1), monthBuckets.length);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const priorQuarters = quarterBuckets.map(b => {
      const m = /^(\d{4})-Q([1-4])$/.exec(b.key);
      if (!m) return b.key;
      const y = Number(m[1]);
      const q = Number(m[2]);
      const d = subQuarters(new Date(y, (q - 1) * 3, 1), quarterBuckets.length);
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    });
    return {
      currentMonths: monthBuckets.map(b => b.key),
      currentQuarters: quarterBuckets.map(b => b.key),
      priorMonths,
      priorQuarters,
    };
  }, [isBrandAwareness, period?.start, period?.end]);
  const brandAwareness = useQuery({
    enabled:
      isBrandAwareness &&
      !!metricSourceId &&
      (baKeys.currentMonths.length > 0 || baKeys.currentQuarters.length > 0),
    queryKey: [
      'insights-live-brand-awareness',
      metricSourceId,
      company?.id ?? null,
      baKeys.currentMonths.join('|'),
      baKeys.currentQuarters.join('|'),
      baKeys.priorMonths.join('|'),
      baKeys.priorQuarters.join('|'),
    ],
    staleTime: 30_000,
    queryFn: async () => {
      const allKeys = Array.from(new Set([
        ...baKeys.currentMonths, ...baKeys.currentQuarters,
        ...baKeys.priorMonths, ...baKeys.priorQuarters,
      ]));
      let q = (supabase.from('metric_manual_inputs') as any)
        .select('month_key, value')
        .eq('metric_key', metricSourceId as string)
        .in('month_key', allKeys);
      q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const isScore =
        metricSourceId === 'ba-ai-search-readiness-score' ||
        metricSourceId === 'ba-market-awareness-score';
      const collect = (keys: string[]): number[] => {
        const keySet = new Set(keys);
        const vals: number[] = [];
        for (const row of data ?? []) {
          if (!keySet.has(row.month_key)) continue;
          if (row.value === null || row.value === undefined) continue;
          const n = Number(row.value);
          if (Number.isFinite(n)) vals.push(n);
        }
        return vals;
      };
      const reduce = (vals: number[]): number | undefined => {
        if (vals.length === 0) return undefined;
        if (isScore) return vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((a, b) => a + b, 0);
      };
      // Prefer the quarterly workbook cell for the selected quarter
      // (e.g. `2026-Q2`). Fall back to aggregating the matching monthly
      // cells (Apr+May+Jun) only when no quarterly value has been entered.
      // Prevents double-counting when both are present.
      const pick = (monthKeys: string[], quarterKeys: string[]) => {
        const quarterly = collect(quarterKeys);
        if (quarterly.length > 0) return reduce(quarterly);
        return reduce(collect(monthKeys));
      };
      return {
        current: pick(baKeys.currentMonths, baKeys.currentQuarters),
        prior: pick(baKeys.priorMonths, baKeys.priorQuarters),
      };
    },
  });

  // FinServ pipeline snapshot — mirrors the FinServ Financial Metrics
  // dashboard's Total MRR / Total Clients query, made period-aware via
  // deal_stage_history so the report period selector actually moves the
  // returned scalar. Shared by both `finserv-total-mrr` and
  // `finserv-active-client-count` (same query, different reducer).
  const finservEnabled =
    metricSourceId === 'finserv-total-mrr' ||
    metricSourceId === 'finserv-active-client-count' ||
    metricSourceId === 'finserv-avg-revenue-per-client';
  const finserv = useQuery({
    enabled: finservEnabled,
    queryKey: [
      'insights-live-finserv-snapshot',
      FINSERV_PIPELINE_ID,
      period?.end ?? null,
    ],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: deals, error: dealsErr } = await supabase
        .from('deals')
        .select('id, stage, mrr, created_at')
        .eq('pipeline_id', FINSERV_PIPELINE_ID);
      if (dealsErr) throw dealsErr;
      const dealList = (deals ?? []) as Array<{
        id: string;
        stage: string | null;
        mrr: number | string | null;
        created_at: string;
      }>;
      const TERMINAL = new Set(['fs-churned', 'fs-closed-lost', 'fs-in-development']);

      // No period → current snapshot (matches source dashboard exactly).
      if (!period?.end) {
        let totalClients = 0;
        let totalMrr = 0;
        for (const d of dealList) {
          const stage = d.stage ?? '';
          if (stage === ACTIVE_CLIENT_STAGE) totalClients += 1;
          if (!TERMINAL.has(stage)) totalMrr += Number(d.mrr ?? 0);
        }
        return { totalClients: applyActiveClientOverride(new Date(), totalClients), totalMrr };
      }

      // Period-aware: reconstruct stage at period end via deal_stage_history.
      const { data: history, error: histErr } = await supabase
        .from('deal_stage_history')
        .select('deal_id, to_stage, changed_at')
        .eq('pipeline_id', FINSERV_PIPELINE_ID)
        .order('changed_at', { ascending: true });
      if (histErr) throw histErr;
      const historyByDeal = new Map<string, Array<{ to_stage: string | null; changed_at: string }>>();
      for (const h of history ?? []) {
        const arr = historyByDeal.get(h.deal_id) ?? [];
        arr.push({ to_stage: h.to_stage, changed_at: h.changed_at });
        historyByDeal.set(h.deal_id, arr);
      }
      const endBound = parseISO(`${period.end}T23:59:59`);
      const today = new Date();
      const effective = endBound > today ? today : endBound;
      const stageAt = (d: { id: string; stage: string | null; created_at: string }) => {
        const created = new Date(d.created_at);
        if (created > effective) return null;
        const hist = historyByDeal.get(d.id);
        if (hist && hist.length > 0) {
          let last: string | null = null;
          for (const h of hist) {
            if (new Date(h.changed_at) <= effective) last = h.to_stage;
            else break;
          }
          if (last !== null) return last;
        }
        return d.stage ?? null;
      };
      let totalClients = 0;
      let totalMrr = 0;
      for (const d of dealList) {
        const stage = stageAt(d);
        if (!stage) continue;
        if (stage === ACTIVE_CLIENT_STAGE) totalClients += 1;
        if (!TERMINAL.has(stage)) totalMrr += Number(d.mrr ?? 0);
      }
      return { totalClients: applyActiveClientOverride(effective, totalClients), totalMrr };
    },
  });

  return useMemo<LiveMetricResolution>(() => {
    if (!metricSourceId) return { supported: false, status: 'unmapped' };

    // ---- Brand Awareness (manual workbook inputs) ----
    if (metricSourceId.startsWith('ba-')) {
      if (!period) {
        return { supported: true, status: 'loading', sourceSurface: 'Brand Awareness' };
      }
      if (brandAwareness.isLoading) {
        return { supported: true, status: 'loading', sourceSurface: 'Brand Awareness' };
      }
      const current = brandAwareness.data?.current;
      const prior = brandAwareness.data?.prior;
      if (current === undefined) {
        return { supported: true, status: 'ready', value: 0, sourceSurface: 'Brand Awareness' };
      }
      const changeAbsolute = prior !== undefined ? current - prior : undefined;
      const changePct =
        prior !== undefined && prior !== 0
          ? ((current - prior) / Math.abs(prior)) * 100
          : undefined;
      return {
        supported: true,
        status: 'ready',
        value: current,
        previousValue: prior,
        changeAbsolute,
        changePct,
        sourceSurface: 'Brand Awareness',
      };
    }

    // ---- Deal/pipeline metrics (Weekly Rundown) ----
    // Fail-closed: only the four canonical scalar KPIs that map 1:1 to
    // Weekly Rundown's visible tiles get a live preview. Chart-backed
    // deal widgets (pipeline shape, manager performance, heatmaps,
    // waterfalls, forecasts, etc.) cannot be reduced to a single
    // canonical number that matches the source dashboard, so they are
    // reported as unmapped instead of fabricating an aggregate.
    const DEAL_SCALAR_IDS = new Set([
      'active-pipeline', 'closed-won', 'total-fees', 'avg-deal-size',
    ]);
    if (DEAL_SCALAR_IDS.has(metricSourceId)) {
      if (dealMetrics.isLoading || !dealMetrics.rawDeals) {
        return { supported: true, status: 'loading', sourceSurface: 'Weekly Rundown' };
      }
      const scoped = period ? filterDealsByPeriod(dealMetrics.rawDeals, period) : (dealMetrics.rawDeals ?? []);
      const active = scoped.filter(d => d.status !== 'archived');
      const closedWon = scoped.filter(d => d.status === 'archived' && d.stage === 'closed-won');
      const totalPipelineValue = active.reduce((s, d) => s + Number(d.value || 0), 0);
      const totalClosedWonValue = closedWon.reduce((s, d) => s + Number(d.value || 0), 0);
      const totalFees = closedWon.reduce((s, d) => s + Number(d.total_fee || 0), 0);
      const avg = closedWon.length > 0 ? totalClosedWonValue / closedWon.length : 0;
      const v =
        metricSourceId === 'active-pipeline' ? totalPipelineValue :
        metricSourceId === 'closed-won'      ? totalClosedWonValue :
        metricSourceId === 'total-fees'      ? totalFees :
        /* avg-deal-size */                    avg;
      return { supported: true, status: 'ready', value: v, sourceSurface: 'Weekly Rundown' };
    }

    // ---- QuickBooks metrics (Controller Dashboard) ----
    if (metricSourceId.startsWith('qb-')) {
      if (qb.isLoading || !qb.data) {
        return { supported: true, status: 'loading', sourceSurface: 'Controller Dashboard' };
      }
      const m = qb.data;
      const map: Record<string, number | undefined> = {
        'qb-total-revenue': m.totalRevenue,
        'qb-accounts-receivable': m.totalAR,
        'qb-total-payments': m.totalPayments,
        'qb-active-customers': m.activeCustomers,
        'qb-collection-rate': m.collectionRate,
        'qb-overdue-amount': m.overdueAmount,
        'qb-total-expenses': m.totalExpenses,
        'qb-total-ap': m.totalAP,
        'qb-net-income': m.netIncome,
        'qb-active-vendors': m.activeVendors,
        'qb-total-estimates': m.totalEstimates,
        'qb-total-credit-memos': m.totalCreditMemos,
      };
      if (metricSourceId in map) {
        return { supported: true, status: 'ready', value: map[metricSourceId] ?? 0, sourceSurface: 'Controller Dashboard' };
      }
      // Chart-backed QB widgets (revenue trend, AR/AP aging buckets,
      // top customers/vendors, expense by category, etc.) don't reduce
      // to a single canonical number on the source dashboard, so they
      // are reported unmapped instead of fabricating an aggregate.
      return { supported: false, status: 'unmapped', sourceSurface: 'Controller Dashboard' };
    }

    // ---- HubSpot metrics ----
    if (metricSourceId.startsWith('hs-')) {
      if (hs.isLoading || !hs.data) {
        return { supported: true, status: 'loading', sourceSurface: 'HubSpot Dashboard' };
      }
      const m = hs.data;
      const map: Record<string, number | undefined> = {
        'hs-total-deals': m.totalDeals,
        'hs-total-deal-value': m.totalDealValue,
        'hs-deals-won': m.dealsWon,
        'hs-deals-lost': m.dealsLost,
        'hs-win-rate': m.winRate,
        'hs-avg-deal-size': m.avgDealSize,
        'hs-total-contacts': m.totalContacts,
        'hs-total-companies': m.totalCompanies,
      };
      if (metricSourceId in map) {
        return { supported: true, status: 'ready', value: map[metricSourceId] ?? 0, sourceSurface: 'HubSpot Dashboard' };
      }
      // HubSpot chart widgets aren't a single canonical number — leave
      // them unmapped so the picker shows "No live data available".
      return { supported: false, status: 'unmapped', sourceSurface: 'HubSpot Dashboard' };
    }

    // ---- FinServ Financial Metrics (pipeline snapshot tiles) ----
    if (metricSourceId === 'finserv-total-mrr' || metricSourceId === 'finserv-active-client-count') {
      if (finserv.isLoading || !finserv.data) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      const v = metricSourceId === 'finserv-total-mrr'
        ? finserv.data.totalMrr
        : finserv.data.totalClients;
      return { supported: true, status: 'ready', value: v, sourceSurface: 'FinServ Financial Metrics' };
    }

    // ---- FinServ Financial Metrics (per-hour tiles) ----
    if (metricSourceId === 'finserv-revenue-per-hour' || metricSourceId === 'finserv-profit-per-hour') {
      if (!period) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      if (finservRev.isLoading || perHourHours.isLoading) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      const hours = perHourHours.data ?? 0;
      const numerator = metricSourceId === 'finserv-revenue-per-hour'
        ? finservRev.total
        : finservRev.operatingProfit;
      const v = hours > 0 ? numerator / hours : 0;
      return { supported: true, status: 'ready', value: v, sourceSurface: 'FinServ Financial Metrics' };
    }

    // ---- FinServ Financial Metrics (Utilization %) ----
    if (metricSourceId === 'finserv-utilization') {
      if (!period) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      if (utilization.isLoading) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      return { supported: true, status: 'ready', value: utilization.data ?? 0, sourceSurface: 'FinServ Financial Metrics' };
    }

    // ---- FinServ Financial Metrics (Avg. Revenue / Client) ----
    if (metricSourceId === 'finserv-avg-revenue-per-client') {
      if (!period) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      if (finservRev.isLoading || finserv.isLoading || !finserv.data) {
        return { supported: true, status: 'loading', sourceSurface: 'FinServ Financial Metrics' };
      }
      const clients = finserv.data.totalClients ?? 0;
      const v = clients > 0 ? (finservRev.total ?? 0) / clients : 0;
      return { supported: true, status: 'ready', value: v, sourceSurface: 'FinServ Financial Metrics' };
    }

    // ---- Cross-source metrics (combine deal + QB) ----
    if (metricSourceId === 'xs-revenue-per-deal') {
      if (qb.isLoading || hs.isLoading || !qb.data || !hs.data) {
        return { supported: true, status: 'loading', sourceSurface: 'Controller + HubSpot' };
      }
      const v = hs.data.dealsWon > 0 ? qb.data.totalRevenue / hs.data.dealsWon : 0;
      return { supported: true, status: 'ready', value: v, sourceSurface: 'Controller + HubSpot' };
    }
    if (metricSourceId === 'xs-ar-per-active-deal') {
      if (qb.isLoading || dealMetrics.isLoading || !qb.data || !dealMetrics.data) {
        return { supported: true, status: 'loading', sourceSurface: 'Controller + Weekly Rundown' };
      }
      const active = dealMetrics.data.activeDealsCount;
      const v = active > 0 ? qb.data.totalAR / active : 0;
      return { supported: true, status: 'ready', value: v, sourceSurface: 'Controller + Weekly Rundown' };
    }
    if (metricSourceId === 'xs-collection-rate-by-entity') {
      if (qb.isLoading || !qb.data) {
        return { supported: true, status: 'loading', sourceSurface: 'Controller Dashboard' };
      }
      return { supported: true, status: 'ready', value: qb.data.collectionRate, sourceSurface: 'Controller Dashboard' };
    }

    // Unknown id — no canonical source wired.
    return { supported: false, status: 'unmapped' };
  }, [
    metricSourceId,
    period?.start,
    period?.end,
    dealMetrics.isLoading,
    dealMetrics.rawDeals,
    dealMetrics.data,
    qb.isLoading,
    qb.data,
    hs.isLoading,
    hs.data,
    finserv.isLoading,
    finserv.data,
    finservRev.isLoading,
    finservRev.total,
    finservRev.operatingProfit,
    perHourHours.isLoading,
    perHourHours.data,
    brandAwareness.isLoading,
    brandAwareness.data,
  ]);
}
