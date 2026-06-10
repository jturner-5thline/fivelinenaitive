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
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { ReportState } from '../QuarterlyInsightsReport';

export interface LiveMetricPeriod {
  start: string; // ymd inclusive
  end: string;   // ymd inclusive
  label: string;
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

  return useMemo<LiveMetricResolution>(() => {
    if (!metricSourceId) return { supported: false, status: 'unmapped' };

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
  ]);
}
