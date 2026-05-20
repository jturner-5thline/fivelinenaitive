import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface ContactType {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_CONTACT_TYPES = ['Banker', 'Lender', 'Client', 'Prospect'];

export function useContactTypes(opts: { includeInactive?: boolean } = {}) {
  const { company } = useCompany();
  return useQuery<ContactType[]>({
    queryKey: ['contact-types', company?.id, opts.includeInactive ?? false],
    queryFn: async () => {
      let q = supabase
        .from('contact_types' as any)
        .select('*')
        .eq('company_id', company!.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (!opts.includeInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ContactType[];
    },
    enabled: !!company?.id,
  });
}

export function useCreateContactType() {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string | null; sort_order?: number }) => {
      const { data, error } = await (supabase as any)
        .from('contact_types')
        .insert({
          company_id: company!.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          sort_order: input.sort_order ?? 100,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ContactType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-types'] });
      toast.success('Contact type added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add contact type'),
  });
}

export function useUpdateContactType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ContactType> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('contact_types')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ContactType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-types'] });
      toast.success('Contact type updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update contact type'),
  });
}

export function useDeleteContactType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('contact_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-types'] });
      toast.success('Contact type deleted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to delete contact type'),
  });
}