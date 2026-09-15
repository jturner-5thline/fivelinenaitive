import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { GEO_OPTIONS } from '@/constants/geoOptions';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

/**
 * Geographic Preference options are stored per company in
 * company_settings.geo_preference_options. Defaults apply until edited.
 */
export function getDefaultGeoOptions(): string[] {
  return [...GEO_OPTIONS];
}

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values
    .map(v => String(v ?? '').trim())
    .filter(v => {
      if (!v) return false;
      const k = v.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

async function fetchGeoOptions(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('geo_preference_options')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  const saved = clean((data as { geo_preference_options?: unknown } | null)?.geo_preference_options);
  return saved.length > 0 ? saved : getDefaultGeoOptions();
}

export function useGeoOptionsList(): string[] {
  const { company } = useCompany();
  const { data } = useQuery({
    queryKey: ['geo-preference-options', company?.id],
    queryFn: () => fetchGeoOptions(company!.id),
    enabled: !!company?.id,
    staleTime: 60_000,
  });
  return data ?? getDefaultGeoOptions();
}

export function useSaveGeoOptions() {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  return useCallback(
    async (values: string[]) => {
      if (!company?.id) throw new Error('No company selected');
      const cleaned = clean(values);
      const { error } = await supabase
        .from('company_settings')
        .upsert(
          { company_id: company.id, geo_preference_options: cleaned },
          { onConflict: 'company_id' },
        );
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['geo-preference-options', company.id] });
    },
    [company?.id, queryClient],
  );
}

/** Counts funding sources currently tagged with each of the given geographies. */
export async function countFundingSourcesUsingGeographies(
  values: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (values.length === 0) return result;
  const { data, error } = await supabase.from('master_lenders').select('geographies');
  if (error) throw error;
  const wanted = new Map(values.map(v => [v.trim().toLowerCase(), v]));
  for (const row of ((data ?? []) as unknown as Array<{ geographies: string[] | null }>)) {
    const tags = new Set<string>();
    for (const raw of row.geographies ?? []) {
      const k = String(raw || '').trim().toLowerCase();
      if (k) tags.add(k);
    }
    for (const k of tags) {
      const match = wanted.get(k);
      if (match) result[match] = (result[match] ?? 0) + 1;
    }
  }
  return result;
}
