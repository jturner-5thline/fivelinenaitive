import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, Info } from 'lucide-react';
import { useComputedKpi } from '@/hooks/useComputedKpis';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { InsightsDrilldownDrawer } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function AvgRevenuePerClientWidget() {
  const { data: kpi, isLoading, error } = useComputedKpi('avg_revenue_per_new_client_signed_ytd');
  const [open, setOpen] = useState(false);

  const isStale = kpi?.status === 'stale' || kpi?.status === 'error';
  const hasError = !!error || kpi?.status === 'error';
  const denomIsZero = kpi && kpi.denominator_value === 0;

  const mainValue = denomIsZero ? '—' : formatCurrency(kpi?.metric_value);
  const lastRefreshed = kpi?.last_refreshed_at
    ? formatDistanceToNow(new Date(kpi.last_refreshed_at), { addSuffix: true })
    : null;

  return (
    <>
    <Card
      onClick={() => !isLoading && kpi && setOpen(true)}
      className={cn(
        'h-full flex flex-col bg-card border-border overflow-hidden cursor-pointer hover:border-primary/40 transition-colors',
        isStale && 'border-warning/50',
      )}
    >
      <CardContent className="flex-1 flex flex-col justify-center gap-2 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full min-h-[72px]">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasError && !kpi ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[72px] text-muted-foreground text-sm">
            <p>Unable to load metric</p>
            <p className="text-xs mt-1">Data source unavailable</p>
          </div>
        ) : (
          <>
            {/* Title row */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Average Revenue per New Client Signed
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs text-xs space-y-1.5 p-3">
                    <p className="font-semibold">Calculation Details</p>
                    <div className="space-y-1">
                      <p>
                        <span className="text-muted-foreground">YTD Total Revenue:</span>{' '}
                        {formatCurrency(kpi?.numerator_value)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">YTD Deals → Final Credit Items:</span>{' '}
                        {kpi?.denominator_value ?? '—'}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Last Refreshed:</span>{' '}
                        {lastRefreshed ?? 'Never'}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Period:</span>{' '}
                        {kpi ? `${kpi.period_start} → ${kpi.period_end}` : '—'}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Main value */}
            <p className="text-2xl font-bold text-foreground leading-tight">
              {mainValue}
            </p>

            {/* Subtitle */}
            <p className="text-[10px] text-muted-foreground">
              YTD Total Income / YTD Deals Entering Final Credit Items
            </p>

            {/* Staleness / freshness indicator */}
            <div className="flex items-center gap-1.5 mt-1">
              {isStale ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-warning font-medium">
                  <RefreshCw className="h-2.5 w-2.5" />
                  Stale data
                </span>
              ) : lastRefreshed ? (
                <span className="text-[10px] text-muted-foreground/60">
                  Updated {lastRefreshed}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
    <InsightsDrilldownDrawer
      open={open}
      onClose={() => setOpen(false)}
      context={{
        sourceId: 'kpi:avg-rev-per-client',
        sourceLabel: 'Average Revenue per New Client Signed',
        selection: mainValue,
        periodLabel: kpi ? `${kpi.period_start} → ${kpi.period_end}` : undefined,
      }}
      columns={[
        { key: 'metric', label: 'Input' },
        { key: 'value', label: 'Value', align: 'right' },
      ]}
      rows={kpi ? [
        { metric: 'YTD Total Revenue', value: formatCurrency(kpi.numerator_value) },
        { metric: 'YTD Deals → Final Credit Items', value: kpi.denominator_value ?? '—' },
        { metric: 'Average per Client', value: denomIsZero ? '—' : formatCurrency(kpi.metric_value) },
        { metric: 'Last Refreshed', value: lastRefreshed ?? 'Never' },
      ] : []}
      emptyHint="This KPI has no recorded inputs yet."
    />
    </>
  );
}
