import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCompanyOverride } from '@/contexts/AdminCompanyOverrideContext';
import { DEFAULT_DEAL_SOURCED_VIA_OPTIONS } from '@/constants/dealSourcedVia';

const QUERY_KEY = ['deal-sourced-via-options'];

async function resolveCompanyId(override: string | null): Promise<string | null> {
  if (override) return override;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.company_id ?? null;
}

function sanitize(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0),
    ),
  );
}

/**
 * Returns the per-workspace "Sourced Via" options. Falls back to the built-in
 * defaults if the company has not customized them yet.
 */
export function useDealSourcedViaOptions() {
  const override = useAdminCompanyOverride();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(override?.companyId ?? null);

  useEffect(() => {
    let cancelled = false;
    resolveCompanyId(override?.companyId ?? null).then((id) => {
      if (!cancelled) setCompanyId(id);
    });
    return () => { cancelled = true; };
  }, [override?.companyId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [...QUERY_KEY, companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('deal_sourced_via_options')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      const sanitized = sanitize((data as any)?.deal_sourced_via_options);
      return sanitized.length > 0 ? sanitized : [...DEFAULT_DEAL_SOURCED_VIA_OPTIONS];
    },
  });

  const saveOptions = useCallback(async (next: string[]) => {
    if (!companyId) throw new Error('No company resolved');
    const cleaned = sanitize(next);
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id')
      .eq('company_id', companyId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('company_settings')
        .update({ deal_sourced_via_options: cleaned as any })
        .eq('company_id', companyId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('company_settings')
        .insert({ company_id: companyId, deal_sourced_via_options: cleaned as any });
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [companyId, queryClient]);

  return {
    options: data ?? [...DEFAULT_DEAL_SOURCED_VIA_OPTIONS],
    isLoading,
    companyId,
    saveOptions,
    refetch,
  };
}