import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface ReportAISummary {
  id: string;
  report_id: string | null;
  owner_user_id: string;
  company_id: string | null;
  period_key: string;
  period_label: string;
  narrative: string;
  deltas: any[];
  alerts: any[];
  model: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useReportAISummaries(reportId?: string | null) {
  return useQuery({
    queryKey: ['report-ai-summaries', reportId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('report_ai_summaries' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (reportId) q = q.eq('report_id', reportId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ReportAISummary[];
    },
  });
}

export function useSaveReportAISummary() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (input: {
      reportId?: string | null;
      periodKey: string;
      periodLabel: string;
      narrative: string;
      deltas: any[];
      alerts: any[];
      model?: string;
      lock?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const payload = {
        report_id: input.reportId ?? null,
        owner_user_id: user.id,
        company_id: company?.id ?? null,
        period_key: input.periodKey,
        period_label: input.periodLabel,
        narrative: input.narrative,
        deltas: input.deltas,
        alerts: input.alerts,
        model: input.model ?? null,
        locked_at: input.lock ? new Date().toISOString() : null,
      };
      const { data, error } = await supabase
        .from('report_ai_summaries' as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ReportAISummary;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-ai-summaries'] });
      toast.success('AI summary saved to report');
    },
    onError: (err: any) => {
      toast.error('Failed to save summary: ' + (err?.message ?? 'unknown'));
    },
  });
}

export function useDeleteReportAISummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('report_ai_summaries' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-ai-summaries'] });
    },
  });
}