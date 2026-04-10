import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface OutboundEmailTemplate {
  id: string;
  company_id: string;
  template_number: number;
  title: string;
  sequence_name: string | null;
  subject_line: string;
  body_rich_text: string;
  body_plain_text: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useOutboundEmailTemplates() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['outbound-email-templates', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('outbound_email_templates' as any)
        .select('*')
        .eq('company_id', company.id)
        .order('template_number', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as OutboundEmailTemplate[];
    },
    enabled: !!company?.id,
  });
}

export function useSaveOutboundEmailTemplate() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (template: Partial<OutboundEmailTemplate> & { title: string; subject_line: string; template_number: number }) => {
      if (!company?.id) throw new Error('No company');
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        ...template,
        company_id: company.id,
        updated_by: user?.id,
      };
      if (template.id) {
        const { data, error } = await supabase
          .from('outbound_email_templates' as any)
          .update(payload)
          .eq('id', template.id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as OutboundEmailTemplate;
      } else {
        payload.created_by = user?.id;
        const { data, error } = await supabase
          .from('outbound_email_templates' as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as OutboundEmailTemplate;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outbound-email-templates'] });
      toast.success('Template saved');
    },
    onError: (err: any) => {
      if (err?.message?.includes('unique') || err?.message?.includes('duplicate')) {
        toast.error('Template number already exists');
      } else {
        toast.error('Failed to save template');
      }
    },
  });
}

export function useDeleteOutboundEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('outbound_email_templates' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outbound-email-templates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });
}

export function useToggleOutboundEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('outbound_email_templates' as any)
        .update({ is_active } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outbound-email-templates'] });
      toast.success('Template status updated');
    },
    onError: () => toast.error('Failed to update template status'),
  });
}

export function useNextTemplateNumber() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['outbound-email-templates-next-number', company?.id],
    queryFn: async () => {
      if (!company?.id) return 1;
      const { data, error } = await supabase
        .from('outbound_email_templates' as any)
        .select('template_number')
        .eq('company_id', company.id)
        .order('template_number', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) return 1;
      return ((data[0] as any).template_number || 0) + 1;
    },
    enabled: !!company?.id,
  });
}
