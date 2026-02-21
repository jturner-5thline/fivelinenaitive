import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface ReportWidget {
  id: string;
  report_id: string;
  type: 'chart' | 'table' | 'kpi' | 'text' | 'ai_narrative';
  title: string | null;
  position: number;
  width: number;
  query_config: Record<string, any>;
  visualization_config: Record<string, any>;
  ai_annotation: string | null;
  ai_annotation_sources: any;
  created_at: string;
  updated_at: string;
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string;
  company_id: string | null;
  visibility: string;
  shared_with_user_ids: string[];
  data_sources: string[];
  global_filters: Record<string, any>;
  layout_config: Record<string, any>;
  is_locked: boolean;
  ai_summary_enabled: boolean;
  ai_regenerate_on_run: boolean;
  created_at: string;
  updated_at: string;
  report_widgets?: ReportWidget[];
}

export const METRIC_OPTIONS = [
  { id: 'deal_count', label: 'Deal Count', category: 'pipeline', type: 'number' },
  { id: 'deal_value', label: 'Total Deal Value', category: 'pipeline', type: 'currency' },
  { id: 'avg_deal_value', label: 'Avg Deal Value', category: 'pipeline', type: 'currency' },
  { id: 'lender_count', label: 'Total Lenders', category: 'lenders', type: 'number' },
  { id: 'active_lenders', label: 'Active Lenders', category: 'lenders', type: 'number' },
  { id: 'passed_lenders', label: 'Passed Lenders', category: 'lenders', type: 'number' },
  { id: 'pass_rate', label: 'Pass Rate', category: 'lenders', type: 'percent' },
  { id: 'conversion_rate', label: 'Conversion Rate', category: 'performance', type: 'percent' },
  { id: 'avg_time_in_stage', label: 'Avg Time in Stage', category: 'performance', type: 'days' },
  { id: 'total_fees', label: 'Total Fees', category: 'financial', type: 'currency' },
  { id: 'retainer_fees', label: 'Retainer Fees', category: 'financial', type: 'currency' },
  { id: 'success_fees', label: 'Success Fees', category: 'financial', type: 'currency' },
  { id: 'milestone_count', label: 'Milestones Completed', category: 'performance', type: 'number' },
  { id: 'activity_count', label: 'Activities Logged', category: 'performance', type: 'number' },
] as const;

export const DIMENSION_OPTIONS = [
  { id: 'stage', label: 'Deal Stage' },
  { id: 'status', label: 'Deal Status' },
  { id: 'manager', label: 'Manager' },
  { id: 'engagement_type', label: 'Engagement Type' },
  { id: 'lender_name', label: 'Lender Name' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'quarter', label: 'Quarter' },
] as const;

export const CHART_TYPES = [
  { id: 'bar', label: 'Bar Chart', icon: '📊' },
  { id: 'line', label: 'Line Chart', icon: '📈' },
  { id: 'area', label: 'Area Chart', icon: '📉' },
  { id: 'pie', label: 'Pie Chart', icon: '🥧' },
  { id: 'stacked_bar', label: 'Stacked Bar', icon: '📊' },
] as const;

export function useReportDefinitions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['report-definitions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_definitions')
        .select('*, report_widgets(*)')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ReportDefinition[];
    },
    enabled: !!user,
  });
}

export function useReportDefinition(id: string | undefined) {
  return useQuery({
    queryKey: ['report-definition', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('report_definitions')
        .select('*, report_widgets(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ReportDefinition;
    },
    enabled: !!id,
  });
}

export function useSaveReportDefinition() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async ({
      definition,
      widgets,
    }: {
      definition: Partial<ReportDefinition> & { name: string };
      widgets: Omit<ReportWidget, 'id' | 'report_id' | 'created_at' | 'updated_at'>[];
    }) => {
      if (!user) throw new Error('Not authenticated');

      let reportId = definition.id;

      if (reportId) {
        // Update existing
        const { error } = await supabase
          .from('report_definitions')
          .update({
            name: definition.name,
            description: definition.description,
            visibility: definition.visibility,
            shared_with_user_ids: definition.shared_with_user_ids,
            data_sources: definition.data_sources,
            global_filters: definition.global_filters,
            layout_config: definition.layout_config,
            is_locked: definition.is_locked,
            ai_summary_enabled: definition.ai_summary_enabled,
            ai_regenerate_on_run: definition.ai_regenerate_on_run,
          })
          .eq('id', reportId);

        if (error) throw error;

        // Delete existing widgets and re-insert
        await supabase.from('report_widgets').delete().eq('report_id', reportId);
      } else {
        // Create new
        const { data: newReport, error } = await supabase
          .from('report_definitions')
          .insert({
            name: definition.name,
            description: definition.description || null,
            owner_user_id: user.id,
            company_id: company?.id || null,
            visibility: definition.visibility || 'private',
            shared_with_user_ids: definition.shared_with_user_ids || [],
            data_sources: definition.data_sources || ['deals'],
            global_filters: definition.global_filters || {},
            layout_config: definition.layout_config || { columns: 2 },
            is_locked: definition.is_locked || false,
            ai_summary_enabled: definition.ai_summary_enabled || false,
            ai_regenerate_on_run: definition.ai_regenerate_on_run ?? true,
          })
          .select()
          .single();

        if (error) throw error;
        reportId = newReport.id;
      }

      // Insert widgets
      if (widgets.length > 0) {
        const widgetsToInsert = widgets.map((w, i) => ({
          report_id: reportId!,
          type: w.type,
          title: w.title,
          position: w.position ?? i,
          width: w.width ?? 1,
          query_config: w.query_config || {},
          visualization_config: w.visualization_config || {},
          ai_annotation: w.ai_annotation || null,
          ai_annotation_sources: w.ai_annotation_sources || null,
        }));

        const { error: widgetError } = await supabase
          .from('report_widgets')
          .insert(widgetsToInsert);

        if (widgetError) throw widgetError;
      }

      return reportId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-definitions'] });
      toast.success('Report saved');
    },
    onError: (error) => {
      toast.error('Failed to save report: ' + error.message);
    },
  });
}

export function useDeleteReportDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('report_definitions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-definitions'] });
      toast.success('Report deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });
}
