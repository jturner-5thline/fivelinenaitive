import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface EmailWorkflow {
  id: string;
  company_id: string;
  name: string;
  sequence_type: string;
  action_type: string;
  trigger_type: string;
  trigger_event: string;
  pipeline_name: string | null;
  stage_name: string | null;
  email_template_number: number | null;
  email_template_id: string | null;
  email_template_title: string | null;
  send_timing: string | null;
  audience: string | null;
  comm_type: string | null;
  default_subject: string | null;
  notes: string | null;
  show_in_deal_prompt: boolean;
  requires_approval: boolean;
  auto_recommend_cc: boolean;
  prevent_duplicate_send: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useEmailWorkflows() {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['email-workflows', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('email_workflows' as any)
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EmailWorkflow[];
    },
    enabled: !!company?.id,
  });
}

export function useEmailWorkflowsByStage(companyId: string | undefined) {
  return useQuery({
    queryKey: ['email-workflows-by-stage', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('email_workflows' as any)
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('show_in_deal_prompt', true)
        .eq('trigger_type', 'stage_enter');
      if (error) throw error;
      return (data || []) as unknown as EmailWorkflow[];
    },
    enabled: !!companyId,
  });
}

export function useSaveEmailWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workflow: Partial<EmailWorkflow> & { company_id: string }) => {
      if (workflow.id) {
        const { id, created_at, updated_at, ...rest } = workflow;
        const { error } = await supabase
          .from('email_workflows' as any)
          .update(rest as any)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { id, created_at, updated_at, ...rest } = workflow;
        const { error } = await supabase
          .from('email_workflows' as any)
          .insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-workflows'] });
      qc.invalidateQueries({ queryKey: ['email-workflows-by-stage'] });
      toast.success('Workflow saved');
    },
    onError: () => toast.error('Failed to save workflow'),
  });
}

export function useToggleEmailWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('email_workflows' as any)
        .update({ is_active } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-workflows'] });
      qc.invalidateQueries({ queryKey: ['email-workflows-by-stage'] });
      toast.success('Workflow updated');
    },
  });
}
