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

/** Removes the given industry values from Industries and Industries to Avoid on every editable funding source. */
export async function removeIndustriesFromFundingSources(values: string[]): Promise<number> {
  if (values.length === 0) return 0;
  const wanted = new Set(values.map(v => v.trim().toLowerCase()));
  const keep = (arr: string[] | null) => (arr ?? []).filter(v => !wanted.has(String(v || '').trim().toLowerCase()));
  const rows = new Map<string, { id: string; industries: string[] | null; industries_to_avoid: string[] | null }>();
  for (const col of ['industries', 'industries_to_avoid'] as const) {
    const { data, error } = await supabase
      .from('master_lenders')
      .select('id, industries, industries_to_avoid')
      .overlaps(col, values);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) rows.set(r.id, r);
  }
  let updated = 0;
  for (const row of rows.values()) {
    const ind = keep(row.industries);
    const avoid = keep(row.industries_to_avoid);
    if (ind.length === (row.industries ?? []).length && avoid.length === (row.industries_to_avoid ?? []).length) continue;
    const { error: upErr } = await supabase
      .from('master_lenders')
      .update({ industries: ind, industries_to_avoid: avoid })
      .eq('id', row.id);
    if (!upErr) updated++;
  }
  return updated;
}
