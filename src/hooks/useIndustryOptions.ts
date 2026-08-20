import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { INDUSTRY_OPTIONS } from '@/constants/industries';

export interface IndustryOption {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
}

/**
 * Industry options for the workspace. If the workspace has not customised the
 * list yet, the shared defaults are used.
 */
export function useIndustryOptions() {
  const { company } = useCompany();

  const query = useQuery<IndustryOption[]>({
    queryKey: ['industry-options', company?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_industry_options')
        .select('id, company_id, name, sort_order')
        .eq('company_id', company!.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as IndustryOption[];
    },
    enabled: !!company?.id,
    staleTime: 60_000,
  });

  const rows = query.data ?? [];
  const isCustomised = rows.length > 0;

  const options = useMemo(
    () => (isCustomised ? rows.map(r => r.name) : [...INDUSTRY_OPTIONS]),
    [rows, isCustomised],
  );

  return { ...query, rows, options, isCustomised };
}

export function useManageIndustryOptions() {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['industry-options'] });

  /** Materialise the defaults into the table so they can be edited/removed. */
  const ensureSeeded = async (): Promise<void> => {
    if (!company?.id) return;
    const { count, error } = await (supabase as any)
      .from('crm_industry_options')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id);
    if (error) throw error;
    if ((count ?? 0) > 0) return;
    const payload = INDUSTRY_OPTIONS.map((name, i) => ({
      company_id: company.id,
      name,
      sort_order: (i + 1) * 10,
    }));
    const { error: insertError } = await (supabase as any)
      .from('crm_industry_options')
      .insert(payload);
    if (insertError) throw insertError;
    await invalidate();
  };

  const add = useMutation({
    mutationFn: async (name: string) => {
      await ensureSeeded();
      const { error } = await (supabase as any)
        .from('crm_industry_options')
        .insert({ company_id: company!.id, name: name.trim(), sort_order: 9999 });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Industry added'); },
    onError: (e: any) => toast.error(e?.message || 'Failed to add industry'),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase as any)
        .from('crm_industry_options')
        .update({ name: name.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Industry updated'); },
    onError: (e: any) => toast.error(e?.message || 'Failed to update industry'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('crm_industry_options')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Industry removed'); },
    onError: (e: any) => toast.error(e?.message || 'Failed to remove industry'),
  });

  return { ensureSeeded, add, rename, remove };
}
