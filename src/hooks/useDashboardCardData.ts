import { useMemo } from 'react';
import { useQBPreviewData, type PreviewDataPoint } from '@/hooks/useQBPreviewData';
import { useQBRevenueByWindow } from '@/hooks/useQBWindowData';
import { type WidgetConfig, type TimeWindow, DEFAULT_WIDGET_CONFIG } from '@/components/widget-editor/widgetTypes';

export interface DashboardCardDataResult {
  /** Chart data points — keys are 'period' + dynamic series labels */
  chartData: PreviewDataPoint[];
  /** Total numeric value across all series */
  total: number;
  /** Dynamic series keys (everything except 'period') */
  seriesKeys: string[];
  isLoading: boolean;
}

/**
 * Resolves chart data for a management-snapshot dashboard card.
 *
 * If the card has a saved datarailsConfig (i.e. was configured via the widget editor),
 * we use the exact same `useQBPreviewData` hook the editor preview uses — ensuring
 * perfect parity.
 *
 * Otherwise we fall back to the simpler `useQBRevenueByWindow` aggregation.
 */
export function useDashboardCardData(
  datarailsConfig: Partial<WidgetConfig> | undefined | null,
  timeWindow: TimeWindow,
  entityFilter?: string | null,
): DashboardCardDataResult {
  // Build a WidgetConfig from the saved datarailsConfig, patching in the
  // current timeWindow (which may have been changed via PeriodBadge dropdown).
  const resolvedConfig = useMemo<WidgetConfig | null>(() => {
    if (!datarailsConfig || !datarailsConfig.values || datarailsConfig.values.length === 0) {
      return null; // no datarails config → use fallback
    }

    return {
      ...DEFAULT_WIDGET_CONFIG,
      ...datarailsConfig,
      id: datarailsConfig.id ?? 'dashboard-card',
      name: datarailsConfig.name ?? 'Card',
      entityId: datarailsConfig.entityId ?? (entityFilter && entityFilter !== 'all' ? entityFilter : undefined),
      xAxis: {
        ...DEFAULT_WIDGET_CONFIG.xAxis,
        ...(datarailsConfig.xAxis ?? {}),
        window: timeWindow, // always use the dashboard-level window override
      },
      values: datarailsConfig.values,
      filters: datarailsConfig.filters ?? [],
    } as WidgetConfig;
  }, [datarailsConfig, timeWindow, entityFilter]);

  // Path A: use full datarailsConfig → same hook the editor uses
  const hasFullConfig = !!resolvedConfig;
  const { data: previewData, isLoading: previewLoading } = useQBPreviewData(
    resolvedConfig ?? DEFAULT_WIDGET_CONFIG,
  );

  // Path B: fallback to simple revenue aggregation
  const { data: fallbackRevenue, isLoading: fallbackLoading } = useQBRevenueByWindow(
    timeWindow,
    entityFilter && entityFilter !== 'all' ? entityFilter : null,
  );

  return useMemo<DashboardCardDataResult>(() => {
    if (hasFullConfig) {
      const data = previewData ?? [];
      const keys = new Set<string>();
      for (const pt of data) {
        for (const k of Object.keys(pt)) {
          if (k !== 'period') keys.add(k);
        }
      }
      const seriesKeys = Array.from(keys);
      const total = data.reduce((sum, pt) => {
        for (const k of seriesKeys) {
          sum += (typeof pt[k] === 'number' ? (pt[k] as number) : 0);
        }
        return sum;
      }, 0);
      return { chartData: data, total, seriesKeys, isLoading: previewLoading };
    }

    // Fallback
    const periods = fallbackRevenue?.periods ?? [];
    const chartData: PreviewDataPoint[] = periods.map(p => ({
      period: p.period,
      Revenue: p.amount,
    }));
    return {
      chartData,
      total: fallbackRevenue?.total ?? 0,
      seriesKeys: ['Revenue'],
      isLoading: fallbackLoading,
    };
  }, [hasFullConfig, previewData, previewLoading, fallbackRevenue, fallbackLoading]);
}
