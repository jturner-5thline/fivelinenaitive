import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface MetricTarget {
  id: string;
  owner_user_id: string;
  company_id: string | null;
  metric_key: string;
  metric_label: string;
  period_month: string | null;
  target_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useInsightsTargets() {
  return useQuery({
    queryKey: ['insights-metric-targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights_metric_targets' as any)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MetricTarget[];
    },
  });
}

export function useUpsertMetricTarget() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (input: {
      metricKey: string;
      metricLabel: string;
      periodMonth?: string | null;
      targetValue: number;
      notes?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const payload: any = {
        owner_user_id: user.id,
        company_id: company?.id ?? null,
        metric_key: input.metricKey,
        metric_label: input.metricLabel,
        period_month: input.periodMonth ?? null,
        target_value: input.targetValue,
        notes: input.notes ?? null,
      };
      const { data, error } = await supabase
        .from('insights_metric_targets' as any)
        .upsert(payload, { onConflict: 'company_id,metric_key,period_month' })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as MetricTarget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights-metric-targets'] });
      toast.success('Target saved');
    },
    onError: (e: any) => toast.error('Failed to save target: ' + (e?.message ?? 'unknown')),
  });
}

export function useDeleteMetricTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insights_metric_targets' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights-metric-targets'] }),
  });
}
