import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface ReferralSourceRecord {
  id: string;
  name: string;
  type: string;
  source_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  number_of_referrals: number;
  notes: string | null;
  relationship_owner_id: string | null;
  company_id: string;
  promoted_to_partner_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useReferralSourcesList() {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['referral_sources_pipeline', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources' as any)
        .select('*')
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ReferralSourceRecord[];
    },
  });
}

export function useCreateReferralSource() {
  const { company } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: Partial<ReferralSourceRecord>) => {
      const { data, error } = await supabase
        .from('referral_sources' as any)
        .insert({ ...values, company_id: company!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral_sources_pipeline'] });
      toast.success('Referral source added');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateReferralSource() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<ReferralSourceRecord> & { id: string }) => {
      const { error } = await supabase
        .from('referral_sources' as any)
        .update(values)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral_sources_pipeline'] });
      toast.success('Referral source updated');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteReferralSource() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('referral_sources' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral_sources_pipeline'] });
      toast.success('Referral source deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
