import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ComputedMetric {
  id: string;
  deal_id: string;
  metric_key: string;
  metric_label: string;
  category: string;
  subcategory: string | null;
  period_type: string;
  period_label: string;
  value: number | null;
  unit_type: string;
  is_actual: boolean;
  is_projection: boolean;
  trend_direction: string | null;
  trend_magnitude: string | null;
  is_outlier: boolean;
  is_missing: boolean;
  confidence: number;
  computed_at: string;
}

export interface MetricSummary {
  key: string;
  label: string;
  category: string;
  latestValue: number | null;
  latestPeriod: string;
  unit: string;
  trend: string | null;
  magnitude: string | null;
  isOutlier: boolean;
  values: Array<{ period: string; value: number | null }>;
}

export function useComputedMetrics(dealId: string) {
  const [metrics, setMetrics] = useState<ComputedMetric[]>([]);
  const [summaries, setSummaries] = useState<MetricSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [lastComputedAt, setLastComputedAt] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const loadMetrics = useCallback(async () => {
    if (!dealId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_computed_metrics' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('period_label');

      if (error) throw error;
      const rows = (data || []) as unknown as ComputedMetric[];
      setMetrics(rows);

      // Build summaries
      const byKey = new Map<string, ComputedMetric[]>();
      for (const r of rows) {
        if (!byKey.has(r.metric_key)) byKey.set(r.metric_key, []);
        byKey.get(r.metric_key)!.push(r);
      }

      const sums: MetricSummary[] = [];
      for (const [key, vals] of byKey) {
        const latest = vals[vals.length - 1];
        sums.push({
          key,
          label: latest.metric_label,
          category: latest.category,
          latestValue: latest.value,
          latestPeriod: latest.period_label,
          unit: latest.unit_type,
          trend: latest.trend_direction,
          magnitude: latest.trend_magnitude,
          isOutlier: latest.is_outlier,
          values: vals.map(v => ({ period: v.period_label, value: v.value })),
        });
      }
      setSummaries(sums);

      if (rows.length > 0) {
        setLastComputedAt(rows[rows.length - 1].computed_at);
      }
    } catch (err) {
      console.error('Failed to load computed metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  const computeMetrics = useCallback(async () => {
    if (!dealId || isComputing) return;
    setIsComputing(true);
    try {
      const { data, error } = await supabase.functions.invoke('compute-financial-metrics', {
        body: { deal_id: dealId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Computation failed');
      toast.success(`Computed ${data.metrics_count} metrics across ${data.periods} periods`);
      await loadMetrics();
    } catch (err) {
      console.error('Metrics computation failed:', err);
      toast.error('Failed to compute financial metrics');
    } finally {
      setIsComputing(false);
    }
  }, [dealId, isComputing, loadMetrics]);

  // Get metrics for a specific key
  const getMetricSeries = useCallback((metricKey: string) => {
    return metrics
      .filter(m => m.metric_key === metricKey)
      .map(m => ({ period: m.period_label, value: m.value, trend: m.trend_direction }));
  }, [metrics]);

  // Get latest value for a metric
  const getLatestMetric = useCallback((metricKey: string): ComputedMetric | null => {
    const series = metrics.filter(m => m.metric_key === metricKey);
    return series.length > 0 ? series[series.length - 1] : null;
  }, [metrics]);

  // Get all metrics for a category
  const getMetricsByCategory = useCallback((category: string) => {
    return summaries.filter(s => s.category === category);
  }, [summaries]);

  // Load on mount
  useEffect(() => {
    if (!loadedRef.current && dealId) {
      loadedRef.current = true;
      loadMetrics();
    }
  }, [dealId, loadMetrics]);

  return {
    metrics,
    summaries,
    isLoading,
    isComputing,
    lastComputedAt,
    loadMetrics,
    computeMetrics,
    getMetricSeries,
    getLatestMetric,
    getMetricsByCategory,
  };
}
