import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { ContactTaggingRule } from '@/lib/contactTaggingRules';

export type { ContactTaggingRule };

export function useContactTaggingRules(opts: { activeOnly?: boolean } = {}) {
  const { company } = useCompany();
  return useQuery<ContactTaggingRule[]>({
    queryKey: ['contact-tagging-rules', company?.id, opts.activeOnly ?? false],
    queryFn: async () => {
      let q = (supabase as any)
        .from('contact_tagging_rules')
        .select('*')
        .eq('company_id', company!.id)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });
      if (opts.activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ContactTaggingRule[];
    },
    enabled: !!company?.id,
    staleTime: 60_000,
  });
}

export function useSaveContactTaggingRule() {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (input: Partial<ContactTaggingRule> & { match_value: string; tag: string }) => {
      const payload = {
        company_id: company!.id,
        name: input.name?.trim() || null,
        match_field: input.match_field || 'domain',
        match_operator: input.match_operator || 'is',
        match_value: input.match_value.trim(),
        tag: input.tag.trim(),
        is_active: input.is_active ?? true,
        priority: input.priority ?? 100,
      };
      if (input.id) {
        const { data, error } = await (supabase as any)
          .from('contact_tagging_rules')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single();
        if (error) throw error;
        return data as ContactTaggingRule;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from('contact_tagging_rules')
        .insert({ ...payload, created_by: userRes.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as ContactTaggingRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-tagging-rules'] });
      toast.success('Tagging rule saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save rule'),
  });
}

export function useDeleteContactTaggingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('contact_tagging_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-tagging-rules'] });
      toast.success('Tagging rule deleted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to delete rule'),
  });
}
