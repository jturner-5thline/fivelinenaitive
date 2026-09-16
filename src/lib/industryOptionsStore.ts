import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  INDUSTRIES_STORAGE_KEY,
  getIndustryOptions,
  setRemovedIndustries,
  notifyIndustryOptionsChanged,
} from '@/lib/industryOptions';

/**
 * The Business Model (deals) / Industries (funding sources) list is ONE shared
 * workspace list, stored per company in `company_settings.industry_options`.
 *
 * Many screens read the list synchronously via `getIndustryOptions()`, so the
 * server list is mirrored into the existing localStorage cache on load. The
 * server copy is authoritative: hydrating clears the local "removed" list.
 */

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values
    .map((v) => String(v ?? '').trim())
    .filter((v) => {
      if (!v) return false;
      const k = v.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function writeIndustryOptionsCache(values: string[]): void {
  try {
    localStorage.setItem(
      INDUSTRIES_STORAGE_KEY,
      JSON.stringify(values.map((value, i) => ({ id: String(i + 1), value, isDefault: false }))),
    );
    // The saved list is authoritative; stale local removals must not hide it.
    setRemovedIndustries([]);
  } catch {
    /* ignore */
  }
  notifyIndustryOptionsChanged();
}

export async function fetchCompanyIndustryOptions(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('industry_options')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return clean((data as { industry_options?: unknown } | null)?.industry_options);
}

/**
 * Mount once inside the authenticated shell: pulls the workspace list and
 * mirrors it into the local cache every other screen reads.
 */
export function useIndustryOptionsSync(): void {
  const { company } = useCompany();
  const { data } = useQuery({
    queryKey: ['industry-options', company?.id],
    queryFn: () => fetchCompanyIndustryOptions(company!.id),
    enabled: !!company?.id,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data && data.length > 0) writeIndustryOptionsCache(data);
  }, [data]);
}

export function useSaveIndustryOptions() {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  return useCallback(
    async (values: string[]) => {
      const cleaned = clean(values);
      if (!company?.id) throw new Error('No company selected');
      const { error } = await supabase
        .from('company_settings')
        .upsert({ company_id: company.id, industry_options: cleaned }, { onConflict: 'company_id' });
      if (error) throw error;
      writeIndustryOptionsCache(cleaned);
      await queryClient.invalidateQueries({ queryKey: ['industry-options', company.id] });
      return getIndustryOptions();
    },
    [company?.id, queryClient],
  );
}
