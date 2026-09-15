import { useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { getIndustryOptions } from '@/lib/industryOptions';

/**
 * Company-scoped list of Business Model dropdown options.
 *
 * Stored in company_settings.ai_settings.deal_info.business_model_options.
 * When nothing is configured yet, the canonical industry list is used as the
 * default so existing deals keep working unchanged.
 */
export function getDefaultBusinessModelOptions(): string[] {
  return getIndustryOptions();
}

export function useBusinessModelOptions() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['business_model_options', companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('ai_settings')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      const ai = ((data as any)?.ai_settings ?? {}) as Record<string, any>;
      const saved = ai?.deal_info?.business_model_options;
      if (Array.isArray(saved)) {
        const cleaned = saved.map((v: any) => String(v || '').trim()).filter(Boolean);
        if (cleaned.length > 0) return cleaned;
        // An explicitly emptied list is respected.
        if (saved.length === 0) return [];
      }
      return getDefaultBusinessModelOptions();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (options: string[]) => {
      if (!companyId) throw new Error('No company');
      const { data } = await supabase
        .from('company_settings')
        .select('ai_settings')
        .eq('company_id', companyId)
        .maybeSingle();
      const base = ((data as any)?.ai_settings ?? {}) as Record<string, any>;
      const cloned = JSON.parse(JSON.stringify(base));
      cloned.deal_info = cloned.deal_info ?? {};
      cloned.deal_info.business_model_options = options;
      const { error } = await supabase
        .from('company_settings')
        .upsert({ company_id: companyId, ai_settings: cloned }, { onConflict: 'company_id' });
      if (error) throw error;
      return options;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business_model_options', companyId] });
    },
  });

  const saveOptions = useCallback(
    (options: string[]) => saveMutation.mutateAsync(options),
    [saveMutation]
  );

  return {
    options: query.data ?? getDefaultBusinessModelOptions(),
    isLoading: query.isLoading,
    saveOptions,
    isSaving: saveMutation.isPending,
  };
}

/** Counts deals currently using each of the given business model values. */
export async function countDealsUsingBusinessModels(values: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (values.length === 0) return result;
  const { data, error } = await supabase
    .from('deals')
    .select('business_model')
    .not('business_model', 'is', null);
  if (error) throw error;
  const wanted = new Map(values.map(v => [v.trim().toLowerCase(), v]));
  for (const row of (data ?? []) as Array<{ business_model: string | null }>) {
    const key = String(row.business_model || '').trim().toLowerCase();
    const match = wanted.get(key);
    if (match) result[match] = (result[match] ?? 0) + 1;
  }
  return result;
}
