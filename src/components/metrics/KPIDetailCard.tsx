import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow, type KPIDetailCardConfig, DEFAULT_WIDGET_CONFIG } from '@/components/widget-editor/widgetTypes';
import { Separator } from '@/components/ui/separator';
import { useQBRevenueByWindow } from '@/hooks/useQBWindowData';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

/** Map a TimeWindow to the "previous" period for comparison */
function getPriorWindow(tw: TimeWindow): TimeWindow {
  switch (tw) {
    case 'mtd': return 'lastMonth';
    case 'qtd': return 'lastQuarter';
    case 'ytd': return 'lastYear';
    default: return 'lastYear';
  }
}

interface KPIDetailCardProps {
  kpiConfig: KPIDetailCardConfig;
  datarailsConfig?: Partial<WidgetConfig> | null;
  timeWindow: TimeWindow;
  entityFilter?: string | null;
  isEditMode?: boolean;
  onClick?: () => void;
}

/**
 * KPI Detail Card — renders a main value with comparison line,
 * a divider, and 1 or 2 breakdown columns underneath.
 */
export function KPIDetailCard({
  kpiConfig,
  datarailsConfig,
  timeWindow,
  entityFilter,
  isEditMode,
  onClick,
}: KPIDetailCardProps) {
  // Resolve entity for main value (uses card-level entityFilter or 'all')
  const mainEntityId = entityFilter && entityFilter !== 'all' ? entityFilter : null;

  // Main value — current period
  const { data: mainCurrent, isLoading: mainCurrentLoading } = useQBRevenueByWindow(timeWindow, mainEntityId);
  // Main value — prior period for comparison
  const priorWindow = getPriorWindow(timeWindow);
  const { data: mainPrior, isLoading: mainPriorLoading } = useQBRevenueByWindow(priorWindow, mainEntityId);

  // Left breakdown — use entity from kpiConfig.left.entityId
  const leftEntityId = kpiConfig.left.entityId || mainEntityId;
  const { data: leftCurrent, isLoading: leftCurrentLoading } = useQBRevenueByWindow(timeWindow, leftEntityId);
  const { data: leftPrior, isLoading: leftPriorLoading } = useQBRevenueByWindow(priorWindow, leftEntityId);

  // Right breakdown — use entity from kpiConfig.right.entityId
  const rightEntityId = kpiConfig.right.entityId || mainEntityId;
  const { data: rightCurrent, isLoading: rightCurrentLoading } = useQBRevenueByWindow(
    kpiConfig.breakdownColumns === 2 ? timeWindow : 'ytd', // only fetch if needed
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

  // Real period-over-period percentage change
  const mainPctChange = computePctChange(mainTotal, mainPrior?.total ?? 0);
  const leftPctChange = computePctChange(leftTotal, leftPrior?.total ?? 0);
  const rightPctChange = computePctChange(rightTotal, rightPrior?.total ?? 0);

  return (
    <Card
      className="h-full flex flex-col bg-card border-border overflow-hidden"
    >
      <div className="widget-drag-handle cursor-grab" />
      <CardContent className={cn(
        'flex-1 flex flex-col justify-center gap-2',
        isCompact ? 'p-3' : 'p-4',
      )}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Header title */}
            <p className={cn(
              'font-medium uppercase tracking-wider text-muted-foreground',
              isCompact ? 'text-[10px]' : 'text-xs',
            )}>
              {kpiConfig.cardTitle}
            </p>

            {/* Main value */}
            <p className={cn(
              'font-bold text-foreground leading-tight',
              isCompact ? 'text-xl' : 'text-2xl',
            )}>
              {formatCurrency(mainTotal)}
            </p>

            {/* Comparison line */}
            <div className="flex items-center gap-1.5">
              <VarianceBadge value={mainPctChange} />
              <span className="text-[10px] text-muted-foreground">
                {kpiConfig.comparisonMode}
              </span>
            </div>

            {/* Optional footer label — compact mode only */}
            {isCompact && kpiConfig.footerLabel && (
              <p className="text-[9px] text-muted-foreground/60 text-center mt-1">
                {kpiConfig.footerLabel}
              </p>
            )}

            {/* Breakdown section — hidden in compact mode */}
            {!isCompact && (
              <>
                <Separator className="my-1" />
                <div className={cn(
                  'grid gap-4',
                  kpiConfig.breakdownColumns === 1 ? 'grid-cols-1 text-center' : 'grid-cols-2',
                )}>
                  <BreakdownColumn
                    label={kpiConfig.left.label || '—'}
                    value={leftTotal}
                    pctChange={leftPctChange}
                  />
                  {kpiConfig.breakdownColumns === 2 && (
                    <BreakdownColumn
                      label={kpiConfig.right.label || '—'}
                      value={rightTotal}
                      pctChange={rightPctChange}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownColumn({ label, value, pctChange }: { label: string; value: number; pctChange: number }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{formatCurrency(value)}</p>
      <VarianceBadge value={pctChange} />
    </div>
  );
}

function VarianceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const isPositive = value >= 0;
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-semibold rounded px-1 py-0.5',
      isPositive ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10',
    )}>
      {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** Compute real period-over-period percentage change */
function computePctChange(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return ((current - prior) / Math.abs(prior)) * 100;
}
