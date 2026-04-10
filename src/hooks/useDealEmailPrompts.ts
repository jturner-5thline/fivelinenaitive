import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface DealEmailPrompt {
  id: string;
  deal_id: string;
  company_id: string;
  workflow_key: string;
  workflow_name: string;
  trigger_reason: string;
  email_template_number: number;
  recipients_json: Array<{ name: string; email: string }>;
  cc_json: Array<{ name: string; email: string }>;
  merged_subject: string;
  merged_body_html: string;
  status: 'pending' | 'dismissed' | 'sent';
  triggered_at: string;
  sent_at: string | null;
  sent_by: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useDealEmailPrompts(dealId: string | undefined) {
  const { company } = useCompany();

  const query = useQuery({
    queryKey: ['deal-email-prompts', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_email_prompts')
        .select('*')
        .eq('deal_id', dealId)
        .order('triggered_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DealEmailPrompt[];
    },
    enabled: !!dealId,
  });

  const pendingCount = (query.data || []).filter(p => p.status === 'pending').length;

  return { ...query, pendingCount };
}

export function useCreateEmailPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prompt: Omit<DealEmailPrompt, 'id' | 'created_at' | 'updated_at' | 'sent_at' | 'sent_by' | 'dismissed_at' | 'dismissed_by'>) => {
      const { data, error } = await supabase
        .from('deal_email_prompts')
        .insert(prompt as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DealEmailPrompt;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['deal-email-prompts', data.deal_id] });
    },
  });
}

export function useDismissEmailPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ promptId, dealId }: { promptId: string; dealId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('deal_email_prompts')
        .update({
          status: 'dismissed',
          dismissed_at: new Date().toISOString(),
          dismissed_by: user?.id,
        } as any)
        .eq('id', promptId);
      if (error) throw error;
      return dealId;
    },
    onSuccess: (dealId) => {
      qc.invalidateQueries({ queryKey: ['deal-email-prompts', dealId] });
      toast.success('Email prompt dismissed');
    },
  });
}

export function useMarkEmailSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ promptId, dealId }: { promptId: string; dealId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('deal_email_prompts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_by: user?.id,
        } as any)
        .eq('id', promptId);
      if (error) throw error;
      return dealId;
    },
    onSuccess: (dealId) => {
      qc.invalidateQueries({ queryKey: ['deal-email-prompts', dealId] });
      toast.success('Email marked as sent');
    },
  });
}
