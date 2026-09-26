import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useIndustryOptionsList } from '@/lib/industryOptions';
import { useSaveIndustryOptions } from '@/lib/industryOptionsStore';
import { INDUSTRY_OPTIONS } from '@/constants/industries';

/**
 * The Business Model dropdown on deals and the Industries selection on funding
 * sources share ONE list, stored per company so every teammate sees the same
 * options. Editing it here edits it everywhere.
 */
export function getDefaultBusinessModelOptions(): string[] {
  return [...INDUSTRY_OPTIONS];
}

export function useBusinessModelOptions() {
  const options = useIndustryOptionsList();
  const saveToCompany = useSaveIndustryOptions();
  const [isSaving, setIsSaving] = useState(false);

  const saveOptions = useCallback(
    async (next: string[]) => {
      setIsSaving(true);
      try {
        await saveToCompany(next.map(v => v.trim()).filter(Boolean));
      } finally {
        setIsSaving(false);
      }
    },
    [saveToCompany],
  );

  return { options, isLoading: false, saveOptions, isSaving };
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

/** Counts funding sources tagged with each of the given industry values. */
export async function countFundingSourcesUsingIndustries(values: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (values.length === 0) return result;
  const { data, error } = await supabase
    .from('master_lenders')
    .select('industries');
  if (error) throw error;
  const wanted = new Map(values.map(v => [v.trim().toLowerCase(), v]));
  for (const row of (data ?? []) as Array<{ industries: string[] | null }>) {
    for (const raw of row.industries ?? []) {
      const match = wanted.get(String(raw || '').trim().toLowerCase());
      if (match) result[match] = (result[match] ?? 0) + 1;
    }
  }
  return result;
}

/** Removes the given industry values from every funding source the user can edit. */
export async function removeIndustriesFromFundingSources(values: string[]): Promise<number> {
  if (values.length === 0) return 0;
  const wanted = new Set(values.map(v => v.trim().toLowerCase()));
  const { data, error } = await supabase
    .from('master_lenders')
    .select('id, industries')
    .overlaps('industries', values);
  if (error) throw error;
  let updated = 0;
  for (const row of (data ?? []) as Array<{ id: string; industries: string[] | null }>) {
    const next = (row.industries ?? []).filter(v => !wanted.has(String(v || '').trim().toLowerCase()));
    if (next.length === (row.industries ?? []).length) continue;
    const { error: upErr } = await supabase.from('master_lenders').update({ industries: next }).eq('id', row.id);
    if (!upErr) updated++;
  }
  return updated;
}
