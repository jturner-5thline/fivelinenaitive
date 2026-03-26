import { Loader2 } from 'lucide-react';
import { type TimeWindow, type KPIDetailCardConfig } from '@/components/widget-editor/widgetTypes';
import { useQBRevenueByWindow } from '@/hooks/useQBWindowData';
import { KPISummaryCard, type KPISubMetric } from '@/components/metrics/KPISummaryCard';

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
}: KPIDetailCardProps) {
  const mainEntityId = entityFilter && entityFilter !== 'all' ? entityFilter : null;
  const priorWindow = getPriorWindow(timeWindow);

  // Main value
  const { data: mainCurrent, isLoading: mainCurrentLoading } = useQBRevenueByWindow(timeWindow, mainEntityId);
  const { data: mainPrior, isLoading: mainPriorLoading } = useQBRevenueByWindow(priorWindow, mainEntityId);

  // Left breakdown
  const leftEntityId = kpiConfig.left.entityId || mainEntityId;
  const { data: leftCurrent, isLoading: leftCurrentLoading } = useQBRevenueByWindow(timeWindow, leftEntityId);
  const { data: leftPrior, isLoading: leftPriorLoading } = useQBRevenueByWindow(priorWindow, leftEntityId);

  // Right breakdown
  const rightEntityId = kpiConfig.right.entityId || mainEntityId;
  const { data: rightCurrent, isLoading: rightCurrentLoading } = useQBRevenueByWindow(
    kpiConfig.breakdownColumns === 2 ? timeWindow : 'ytd',
    kpiConfig.breakdownColumns === 2 ? rightEntityId : '__skip__',
  );
  const { data: rightPrior, isLoading: rightPriorLoading } = useQBRevenueByWindow(
    kpiConfig.breakdownColumns === 2 ? priorWindow : 'ytd',
    kpiConfig.breakdownColumns === 2 ? rightEntityId : '__skip__',
  );

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
    />
  );
}
