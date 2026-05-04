import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ──── Format Options ────
export interface KPIFormatOptions {
  /** Currency symbol prefix, default '$' */
  currencySymbol?: string;
  /** Decimal places for the main value, default 1 */
  decimalPlaces?: number;
  /** Abbreviation threshold: values above this use k/M/B. Default 1000 */
  abbreviationThreshold?: number;
}

export interface KPISubMetric {
  label: string;
  value: string | number;
  trendPercent?: number | null;
  trendDirection?: 'up' | 'down';
}

export interface KPISummaryCardProps {
  /** Card headline, e.g. "Total Revenue" */
  title: string;
  /** Main formatted value — or a number to auto-format */
  value: string | number;
  /** Percentage change for the trend badge */
  trendPercent: number | null;
  /** Arrow direction for coloring */
  trendDirection?: 'up' | 'down';
  /** Label next to the trend badge, e.g. "vs Previous Period" */
  trendLabel?: string;
  /** Comparison period label */
  comparisonPeriod?: string;
  /** Sub-metric breakdown rows (1 or 2 typically) */
  subMetrics?: KPISubMetric[];
  /** Whether to show the sub-metrics breakdown */
  showBreakdown?: boolean;
  /** Format options for auto-formatting numeric values */
  formatOptions?: KPIFormatOptions;
  /** Loading state */
  isLoading?: boolean;
  /** Compact layout (hides breakdown) */
  compact?: boolean;
  /** Optional className */
  className?: string;
  /** Optional click handler */
  onClick?: () => void;
  /** Footer label shown below in compact mode */
  footerLabel?: string;
  /**
   * Horizontal alignment of all card content (title, main value, trend row,
   * sub-metric columns). Defaults to 'left' to preserve existing behaviour
   * across the app — opt-in for widgets that want centred layout.
   */
  align?: 'left' | 'center';
}

/** Format a number using abbreviated notation */
function formatValue(
  raw: string | number,
  opts: KPIFormatOptions = {},
): string {
  if (typeof raw === 'string') return raw;
  const sym = opts.currencySymbol ?? '$';
  const dp = opts.decimalPlaces ?? 1;
  const threshold = opts.abbreviationThreshold ?? 1_000;
  const abs = Math.abs(raw);
  const sign = raw < 0 ? '-' : '';

  if (abs >= 1_000_000_000 && threshold <= 1_000_000_000)
    return `${sign}${sym}${(abs / 1_000_000_000).toFixed(dp)}B`;
  if (abs >= 1_000_000 && threshold <= 1_000_000)
    return `${sign}${sym}${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000 && threshold <= 1_000)
    return `${sign}${sym}${(abs / 1_000).toFixed(dp)}k`;
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp })}`;
}

/**
 * KPI Summary Card — a standardised, reusable KPI widget.
 *
 * Renders a headline value with trend badge, an optional divider, and
 * 1–N sub-metric breakdown columns beneath.
 */
export function KPISummaryCard({
  title,
  value,
  trendPercent,
  trendDirection,
  trendLabel,
  comparisonPeriod,
  subMetrics,
  showBreakdown = true,
  formatOptions,
  isLoading,
  compact,
  className,
  onClick,
  footerLabel,
  align = 'left',
}: KPISummaryCardProps) {
  const formattedValue = formatValue(value, formatOptions);

  // Infer direction from trendPercent if not explicitly supplied
  const effectiveDirection =
    trendDirection ?? (trendPercent !== null && trendPercent !== undefined ? (trendPercent >= 0 ? 'up' : 'down') : undefined);

  const hasBreakdown = showBreakdown && !compact && subMetrics && subMetrics.length > 0;
  const isCentered = align === 'center';

  return (
    <Card
      className={cn('h-full flex flex-col glass-module overflow-hidden', onClick && 'cursor-pointer glass-module-interactive', className)}
      onClick={onClick}
    >
      <div className="widget-drag-handle cursor-grab" />
      <CardContent
        className={cn(
          'flex-1 flex flex-col justify-center gap-2',
          compact ? 'p-3' : 'p-4',
          isCentered && 'items-center text-center',
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full min-h-[72px]">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Title */}
            <p
              className={cn(
                'font-medium uppercase tracking-wider text-muted-foreground',
                compact ? 'text-[10px]' : 'text-xs',
              )}
            >
              {title}
            </p>

            {/* Main value */}
            <p
              className={cn(
                'font-bold text-foreground leading-tight',
                compact ? 'text-xl' : 'text-2xl',
              )}
            >
              {formattedValue}
            </p>

            {/* Trend badge + label */}
            {trendPercent !== null && trendPercent !== undefined && (
              <div className={cn('flex items-center gap-1.5', isCentered && 'justify-center')}>
                <TrendBadge value={trendPercent} direction={effectiveDirection} />
                {(trendLabel || comparisonPeriod) && (
                  <span className="text-[10px] text-muted-foreground">
                    {trendLabel || comparisonPeriod}
                  </span>
                )}
              </div>
            )}

            {/* Compact footer */}
            {compact && footerLabel && (
              <p className="text-[9px] text-muted-foreground/60 text-center mt-1">
                {footerLabel}
              </p>
            )}

            {/* Breakdown section */}
            {hasBreakdown && (
              <>
                <Separator className="my-1" />
                <div
                  className={cn(
                    'grid gap-4',
                    subMetrics!.length === 1 ? 'grid-cols-1 text-center' : 'grid-cols-2',
                    isCentered && 'w-full text-center',
                  )}
                >
                  {subMetrics!.map((sm) => (
                    <SubMetricColumn
                      key={sm.label}
                      label={sm.label}
                      value={formatValue(sm.value, formatOptions)}
                      trendPercent={sm.trendPercent}
                      trendDirection={sm.trendDirection}
                      align={align}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ──── Internal sub-components ────

function SubMetricColumn({
  label,
  value,
  trendPercent,
  trendDirection,
  align = 'left',
}: {
  label: string;
  value: string;
  trendPercent?: number | null;
  trendDirection?: 'up' | 'down';
  align?: 'left' | 'center';
}) {
  const isCentered = align === 'center';
  return (
    <div className={cn('space-y-0.5', isCentered && 'flex flex-col items-center text-center')}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {trendPercent !== null && trendPercent !== undefined && (
        <TrendBadge value={trendPercent} direction={trendDirection} />
      )}
    </div>
  );
}

function TrendBadge({
  value,
  direction,
}: {
  value: number | null;
  direction?: 'up' | 'down';
}) {
  if (value === null || value === undefined) return null;
  const dir = direction ?? (value >= 0 ? 'up' : 'down');
  const isPositive = dir === 'up';
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-semibold rounded px-1 py-0.5 gap-0.5',
        isPositive ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10',
      )}
    >
      {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
