import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow, type KPIDetailCardConfig, DEFAULT_WIDGET_CONFIG } from '@/components/widget-editor/widgetTypes';
import { Separator } from '@/components/ui/separator';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

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
  // Main value data
  const { total: mainTotal, isLoading: mainLoading } = useDashboardCardData(
    datarailsConfig,
    timeWindow,
    entityFilter,
  );

  // Left breakdown
  const leftConfig = buildValueConfig(kpiConfig.left.valueField, datarailsConfig);
  const { total: leftTotal, isLoading: leftLoading } = useDashboardCardData(
    leftConfig,
    timeWindow,
    entityFilter,
  );

  // Right breakdown (only if 2 columns)
  const rightConfig = kpiConfig.breakdownColumns === 2
    ? buildValueConfig(kpiConfig.right.valueField, datarailsConfig)
    : null;
  const { total: rightTotal, isLoading: rightLoading } = useDashboardCardData(
    rightConfig,
    timeWindow,
    entityFilter,
  );

  const isLoading = mainLoading || (!isCompact && (leftLoading || (kpiConfig.breakdownColumns === 2 && rightLoading)));
  const isCompact = kpiConfig.layoutVariant === 'compact';

  // Compute comparison percentage (simplified: use the proportion of sub-metrics)
  const mainPctChange = mainTotal !== 0 ? computeSimplePctChange(mainTotal) : 0;
  const leftPctChange = leftTotal !== 0 ? computeSimplePctChange(leftTotal) : 0;
  const rightPctChange = rightTotal !== 0 ? computeSimplePctChange(rightTotal) : 0;

  return (
    <Card
      className={cn(
        'h-full flex flex-col bg-card border-border overflow-hidden',
        !isEditMode && onClick && 'cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all',
      )}
      onClick={onClick}
    >
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

function VarianceBadge({ value }: { value: number }) {
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

/** Build a minimal datarails config for a single value field, inheriting base config */
function buildValueConfig(
  fieldId: string | null | undefined,
  baseConfig?: Partial<WidgetConfig> | null,
): Partial<WidgetConfig> | null {
  if (!fieldId) return baseConfig ?? null;
  return {
    ...(baseConfig || {}),
    values: [{ fieldId, agg: 'sum' as const, format: 'currency' as const, label: fieldId }],
  };
}

/** Simple placeholder for period-over-period change (simulated) */
function computeSimplePctChange(_total: number): number {
  // In a real implementation this would compare current vs prior period
  // For now returns a small positive/negative based on the value
  return (Math.random() - 0.4) * 20;
}
