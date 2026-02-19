import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface ScheduledReport {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  report_type: string;
  report_config: Json;
  schedule_cron: string;
  schedule_timezone: string;
  delivery_method: string;
  delivery_config: Json;
  agent_id: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRun {
  id: string;
  scheduled_report_id: string;
  user_id: string;
  status: string;
  report_data: Json | null;
  summary_text: string | null;
  delivery_status: string | null;
  delivery_response: Json | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export const REPORT_TYPES = [
  { id: 'pipeline_summary', label: 'Pipeline Summary', emoji: '📊', description: 'Deal count, value, and stage breakdown' },
  { id: 'lender_performance', label: 'Lender Performance', emoji: '🏦', description: 'Lender deal counts, funding rates, and volume' },
  { id: 'stale_deals', label: 'Stale Deals Alert', emoji: '⚠️', description: 'Deals with no recent activity' },
  { id: 'weekly_activity', label: 'Weekly Activity Recap', emoji: '📅', description: 'Activities, new deals, and team updates' },
  { id: 'deal_velocity', label: 'Deal Velocity', emoji: '⚡', description: 'Average time in pipeline, fastest and slowest deals' },
] as const;

export const SCHEDULE_PRESETS = [
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Monday at 9am', cron: '0 9 * * 1' },
  { label: 'Monday & Thursday at 9am', cron: '0 9 * * 1,4' },
  { label: 'First of month at 9am', cron: '0 9 1 * *' },
  { label: 'Every Friday at 5pm', cron: '0 17 * * 5' },
] as const;

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useScheduledReports() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['scheduled-reports', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ScheduledReport[];
    },
    enabled: !!user,
  });
}

export function useReportRuns(scheduledReportId: string | undefined) {
  return useQuery({
    queryKey: ['report-runs', scheduledReportId],
    queryFn: async () => {
      if (!scheduledReportId) return [];

      const { data, error } = await supabase
        .from('report_runs')
        .select('*')
        .eq('scheduled_report_id', scheduledReportId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as ReportRun[];
    },
    enabled: !!scheduledReportId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateScheduledReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      report_type: string;
      report_config?: Json;
      schedule_cron: string;
      schedule_timezone?: string;
      delivery_method?: string;
      delivery_config?: Json;
      agent_id?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: report, error } = await supabase
        .from('scheduled_reports')
        .insert({
          ...data,
          user_id: user.id,
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return report as ScheduledReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Scheduled report created');
    },
    onError: (error) => {
      toast.error('Failed to create report: ' + error.message);
    },
  });
}

export function useUpdateScheduledReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const { data: report, error } = await supabase
        .from('scheduled_reports')
        .update(data as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return report as ScheduledReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Report updated');
    },
    onError: (error) => {
      toast.error('Failed to update report: ' + error.message);
    },
  });
}

export function useDeleteScheduledReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Report deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete report: ' + error.message);
    },
  });
}

export function useRunReportNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduledReportId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-scheduled-report', {
        body: {
          action: 'run_scheduled',
          scheduled_report_id: scheduledReportId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, scheduledReportId) => {
      queryClient.invalidateQueries({ queryKey: ['report-runs', scheduledReportId] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Report generated and delivered');
    },
    onError: (error) => {
      toast.error('Failed to run report: ' + error.message);
    },
  });
}

export function useGenerateAdHocReport() {
  return useMutation({
    mutationFn: async (data: {
      report_type: string;
      company_id?: string;
      config?: Record<string, unknown>;
      delivery?: { method: string; slack_channel_id?: string };
    }) => {
      const { data: result, error } = await supabase.functions.invoke('generate-scheduled-report', {
        body: { action: 'generate_report', ...data },
      });

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success('Report generated');
    },
    onError: (error) => {
      toast.error('Failed to generate report: ' + error.message);
    },
  });
}
