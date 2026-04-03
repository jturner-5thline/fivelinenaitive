import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FinancialInsight {
  executive_summary: string;
  positive_trends: Array<{ title: string; detail: string; metric_refs: string[] }>;
  risks: Array<{ title: string; detail: string; severity: string; metric_refs: string[] }>;
  growth_observations: string;
  margin_observations: string;
  liquidity_leverage_observations: string;
  debt_servicing_observations: string;
  anomalies: Array<{ title: string; detail: string; severity: string; period: string; metric_key: string }>;
  follow_up_questions: string[];
}

export interface ChartSpec {
  chart_type: string;
  title: string;
  subtitle?: string;
  metric_keys: string[];
  comparison_keys?: string[];
  x_axis_period_type: string;
  default_time_range: string;
  y_axis_format: string;
  narrative_focus: string;
  confidence: number;
  follow_up_questions: string[];
}

export interface FinancialQAResponse {
  answer: string;
  cited_metrics: Array<{ metric_key: string; period: string; value: number; formatted: string }>;
  chart_suggestion: ChartSpec | null;
  confidence: number;
  caveats: string[];
  follow_up_questions: string[];
}

export interface AnomalyReview {
  data_quality_score: number;
  issues: Array<{
    severity: string;
    type: string;
    title: string;
    detail: string;
    affected_metric: string;
    affected_periods: string[];
    recommendation: string;
  }>;
  summary: string;
}

export function useFinancialAI(dealId: string) {
  const [insights, setInsights] = useState<FinancialInsight | null>(null);
  const [anomalyReview, setAnomalyReview] = useState<AnomalyReview | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(false);
  const [isLoadingQA, setIsLoadingQA] = useState(false);
  const cacheRef = useRef<Map<string, any>>(new Map());

  // Check for cached insights
  const loadCachedInsights = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('deal_financial_insights' as any)
        .select('insight_type, structured_output, is_stale, generated_at')
        .eq('deal_id', dealId);

      if (data) {
        for (const row of data as any[]) {
          if (!row.is_stale) {
            if (row.insight_type === 'insights') setInsights(row.structured_output);
            if (row.insight_type === 'anomaly_review') setAnomalyReview(row.structured_output);
          }
        }
      }
    } catch { /* ignore */ }
  }, [dealId]);

  const generateInsights = useCallback(async (): Promise<FinancialInsight | null> => {
    if (isLoadingInsights) return null;
    setIsLoadingInsights(true);
    try {
      const { data, error } = await supabase.functions.invoke('financial-ai', {
        body: { action: 'insights', deal_id: dealId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate insights');
      setInsights(data.data);
      return data.data;
    } catch (err) {
      console.error('Failed to generate insights:', err);
      toast.error('Failed to generate financial insights');
      return null;
    } finally {
      setIsLoadingInsights(false);
    }
  }, [dealId, isLoadingInsights]);

  const generateChartSpec = useCallback(async (request: string): Promise<ChartSpec | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('financial-ai', {
        body: { action: 'chart_spec', deal_id: dealId, chart_request: request },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      return data.data;
    } catch (err) {
      console.error('Failed to generate chart spec:', err);
      toast.error('Failed to generate chart');
      return null;
    }
  }, [dealId]);

  const reviewAnomalies = useCallback(async (): Promise<AnomalyReview | null> => {
    if (isLoadingAnomalies) return null;
    setIsLoadingAnomalies(true);
    try {
      const { data, error } = await supabase.functions.invoke('financial-ai', {
        body: { action: 'anomaly_review', deal_id: dealId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      setAnomalyReview(data.data);
      return data.data;
    } catch (err) {
      console.error('Failed to review anomalies:', err);
      toast.error('Failed to review data quality');
      return null;
    } finally {
      setIsLoadingAnomalies(false);
    }
  }, [dealId, isLoadingAnomalies]);

  const askFinancialQuestion = useCallback(async (question: string): Promise<FinancialQAResponse | null> => {
    if (isLoadingQA) return null;
    setIsLoadingQA(true);
    try {
      // Check cache
      const cacheKey = `qa:${question.toLowerCase().trim()}`;
      if (cacheRef.current.has(cacheKey)) {
        setIsLoadingQA(false);
        return cacheRef.current.get(cacheKey);
      }

      const { data, error } = await supabase.functions.invoke('financial-ai', {
        body: { action: 'financial_qa', deal_id: dealId, query: question },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');

      cacheRef.current.set(cacheKey, data.data);
      return data.data;
    } catch (err) {
      console.error('Failed to answer question:', err);
      toast.error('Failed to get AI response');
      return null;
    } finally {
      setIsLoadingQA(false);
    }
  }, [dealId, isLoadingQA]);

  return {
    insights,
    anomalyReview,
    isLoadingInsights,
    isLoadingAnomalies,
    isLoadingQA,
    loadCachedInsights,
    generateInsights,
    generateChartSpec,
    reviewAnomalies,
    askFinancialQuestion,
  };
}
