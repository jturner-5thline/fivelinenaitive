import { useMemo } from 'react';
import { useQBPreviewData, type PreviewDataPoint } from '@/hooks/useQBPreviewData';
import { useQBRevenueByWindow } from '@/hooks/useQBWindowData';
import { type WidgetConfig, type TimeWindow, DEFAULT_WIDGET_CONFIG } from '@/components/widget-editor/widgetTypes';

export interface DashboardCardDataResult {
  chartData: PreviewDataPoint[];
  total: number;
  seriesKeys: string[];
  isLoading: boolean;
}

export function useDashboardCardData(
  datarailsConfig: Partial<WidgetConfig> | undefined | null,
  timeWindow: TimeWindow,
  entityFilter?: string | null,
  customRange?: { start: string; end: string },
): DashboardCardDataResult {
  const resolvedConfig = useMemo<WidgetConfig | null>(() => {
    if (!datarailsConfig || !datarailsConfig.values || datarailsConfig.values.length === 0) {
      return null;
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
        window: timeWindow,
        customRange: timeWindow === 'custom' ? customRange : undefined,
      },
      values: datarailsConfig.values,
      filters: datarailsConfig.filters ?? [],
    } as WidgetConfig;
  }, [datarailsConfig, timeWindow, entityFilter, customRange?.start, customRange?.end]);

  const hasFullConfig = !!resolvedConfig;

  // Path A: datarailsConfig present → same hook as editor
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
