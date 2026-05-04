import { Loader2 } from 'lucide-react';
import { type TimeWindow, type KPIDetailCardConfig } from '@/components/widget-editor/widgetTypes';
import {
  useQBRevenueByWindow,
  useQBRevenueByDateRange,
  getPriorDateRange,
} from '@/hooks/useQBWindowData';
import { KPISummaryCard, type KPISubMetric } from '@/components/metrics/KPISummaryCard';
import type { QuarterOption } from '@/hooks/useQBQuarterlyRevenue';

/** Map a TimeWindow to the "previous" period for comparison */
function getPriorWindow(tw: TimeWindow): TimeWindow {
  switch (tw) {
    case 'mtd': return 'lastMonth';
    case 'qtd': return 'lastQuarter';
    case 'ytd': return 'lastYear';
    default: return 'lastYear';
  }
}

/** Compute real period-over-period percentage change */
function computePctChange(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

interface KPIDetailCardProps {
  kpiConfig: KPIDetailCardConfig;
  datarailsConfig?: unknown;
  timeWindow: TimeWindow;
  entityFilter?: string | null;
  isEditMode?: boolean;
  onClick?: () => void;
  /**
   * When provided, the card pulls revenue for this exact period (and computes
   * the period-over-period delta against the immediately preceding span of
   * the same length) instead of the symbolic `timeWindow`. Used by the
   * Insights dashboard to wire the top revenue card to the page-level
   * quarter dropdown so all three figures + deltas update in lockstep.
   */
  selectedPeriod?: QuarterOption | null;
}

/**
 * KPI Detail Card — now delegates rendering to the standardised KPISummaryCard.
 * Keeps all data-fetching logic here (QB hooks) and maps to KPISummaryCard props.
 */
export function KPIDetailCard({
  kpiConfig,
  timeWindow,
  entityFilter,
  onClick,
  selectedPeriod,
}: KPIDetailCardProps) {
  const mainEntityId = entityFilter && entityFilter !== 'all' ? entityFilter : null;
  const priorWindow = getPriorWindow(timeWindow);

  const leftEntityId = kpiConfig.left.entityId || mainEntityId;
  const rightEntityId = kpiConfig.right.entityId || mainEntityId;

  // ── Period selection ────────────────────────────────────────────────
  // When the dashboard supplies an explicit `selectedPeriod` (e.g. the
  // Q2 2026 / monthly dropdown on /insights), we drive every value and
  // every comparison off that exact range so all three figures + deltas
  // recompute in lockstep with the dropdown. Otherwise we fall back to
  // the symbolic TimeWindow → preset prior-window mapping.
  const useRange = !!selectedPeriod;
  const range = selectedPeriod
    ? { start: selectedPeriod.startDate, end: selectedPeriod.endDate }
    : { start: null as string | null, end: null as string | null };
  const priorRange = selectedPeriod
    ? getPriorDateRange(selectedPeriod.startDate, selectedPeriod.endDate)
    : { start: null as string | null, end: null as string | null };

  // Main value (TOTAL — all integrated entities when no entityFilter is set)
  const winMainCur = useQBRevenueByWindow(useRange ? 'all' : timeWindow, useRange ? '__skip__' : mainEntityId);
  const winMainPri = useQBRevenueByWindow(useRange ? 'all' : priorWindow, useRange ? '__skip__' : mainEntityId);
  const rngMainCur = useQBRevenueByDateRange(useRange ? range.start : null, useRange ? range.end : null, mainEntityId);
  const rngMainPri = useQBRevenueByDateRange(useRange ? priorRange.start : null, useRange ? priorRange.end : null, mainEntityId);

  const mainCurrent = useRange ? rngMainCur.data : winMainCur.data;
  const mainPrior = useRange ? rngMainPri.data : winMainPri.data;
  const mainCurrentLoading = useRange ? rngMainCur.isLoading : winMainCur.isLoading;
  const mainPriorLoading = useRange ? rngMainPri.isLoading : winMainPri.isLoading;

  // Left breakdown (DEBT — pinned realmId)
  const winLeftCur = useQBRevenueByWindow(useRange ? 'all' : timeWindow, useRange ? '__skip__' : leftEntityId);
  const winLeftPri = useQBRevenueByWindow(useRange ? 'all' : priorWindow, useRange ? '__skip__' : leftEntityId);
  const rngLeftCur = useQBRevenueByDateRange(useRange ? range.start : null, useRange ? range.end : null, leftEntityId);
  const rngLeftPri = useQBRevenueByDateRange(useRange ? priorRange.start : null, useRange ? priorRange.end : null, leftEntityId);

  const leftCurrent = useRange ? rngLeftCur.data : winLeftCur.data;
  const leftPrior = useRange ? rngLeftPri.data : winLeftPri.data;
  const leftCurrentLoading = useRange ? rngLeftCur.isLoading : winLeftCur.isLoading;
  const leftPriorLoading = useRange ? rngLeftPri.isLoading : winLeftPri.isLoading;

  // Right breakdown (FINSERV — pinned realmId)
  const wantRight = kpiConfig.breakdownColumns === 2;
  const winRightCur = useQBRevenueByWindow(
    useRange ? 'all' : (wantRight ? timeWindow : 'ytd'),
    useRange || !wantRight ? '__skip__' : rightEntityId,
  );
  const winRightPri = useQBRevenueByWindow(
    useRange ? 'all' : (wantRight ? priorWindow : 'ytd'),
    useRange || !wantRight ? '__skip__' : rightEntityId,
  );
  const rngRightCur = useQBRevenueByDateRange(
    useRange && wantRight ? range.start : null,
    useRange && wantRight ? range.end : null,
    rightEntityId,
  );
  const rngRightPri = useQBRevenueByDateRange(
    useRange && wantRight ? priorRange.start : null,
    useRange && wantRight ? priorRange.end : null,
    rightEntityId,
  );

  const rightCurrent = useRange ? rngRightCur.data : winRightCur.data;
  const rightPrior = useRange ? rngRightPri.data : winRightPri.data;
  const rightCurrentLoading = useRange ? rngRightCur.isLoading : winRightCur.isLoading;
  const rightPriorLoading = useRange ? rngRightPri.isLoading : winRightPri.isLoading;

  const mainTotal = mainCurrent?.total ?? 0;
  const leftTotal = leftCurrent?.total ?? 0;
  const rightTotal = rightCurrent?.total ?? 0;

  const isCompact = kpiConfig.layoutVariant === 'compact';
  const isLoading = mainCurrentLoading || mainPriorLoading ||
    (!isCompact && (leftCurrentLoading || leftPriorLoading ||
      (kpiConfig.breakdownColumns === 2 && (rightCurrentLoading || rightPriorLoading))));

  const mainPctChange = computePctChange(mainTotal, mainPrior?.total ?? 0);
  const leftPctChange = computePctChange(leftTotal, leftPrior?.total ?? 0);
  const rightPctChange = computePctChange(rightTotal, rightPrior?.total ?? 0);

  // Build sub-metrics array
  const subMetrics: KPISubMetric[] = [];
  if (!isCompact) {
    subMetrics.push({
      label: kpiConfig.left.label || '—',
      value: leftTotal,
      trendPercent: leftPctChange,
      trendDirection: leftPctChange !== null ? (leftPctChange >= 0 ? 'up' : 'down') : undefined,
    });
    if (kpiConfig.breakdownColumns === 2) {
      subMetrics.push({
        label: kpiConfig.right.label || '—',
        value: rightTotal,
        trendPercent: rightPctChange,
        trendDirection: rightPctChange !== null ? (rightPctChange >= 0 ? 'up' : 'down') : undefined,
      });
    }
  }

  return (
    <KPISummaryCard
      title={kpiConfig.cardTitle}
      value={mainTotal}
      trendPercent={mainPctChange}
      trendDirection={mainPctChange !== null ? (mainPctChange >= 0 ? 'up' : 'down') : undefined}
      trendLabel={kpiConfig.comparisonMode}
      subMetrics={subMetrics}
      showBreakdown={!isCompact}
      compact={isCompact}
      footerLabel={kpiConfig.footerLabel}
      isLoading={isLoading}
      onClick={onClick}
      align="center"
    />
  );
}
