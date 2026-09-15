import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  INDUSTRIES_STORAGE_KEY,
  getIndustryOptions,
  useIndustryOptionsList,
  addRemovedIndustry,
  unremoveIndustry,
  notifyIndustryOptionsChanged,
} from '@/lib/industryOptions';
import { INDUSTRY_OPTIONS } from '@/constants/industries';

/**
 * The Business Model dropdown on deals and the Industries selection on funding
 * sources share ONE list. Editing it here edits it everywhere.
 */
export function getDefaultBusinessModelOptions(): string[] {
  return [...INDUSTRY_OPTIONS];
}

export function useBusinessModelOptions() {
  const options = useIndustryOptionsList();

  const saveOptions = useCallback(async (next: string[]) => {
    const previous = getIndustryOptions();
    const cleaned = next.map(v => v.trim()).filter(Boolean);
    const nextKeys = new Set(cleaned.map(v => v.toLowerCase()));

    // Removals are permanent so canonical defaults never re-merge on reload.
    for (const prev of previous) {
      if (!nextKeys.has(prev.trim().toLowerCase())) addRemovedIndustry(prev);
    }
    for (const value of cleaned) unremoveIndustry(value);

    localStorage.setItem(
      INDUSTRIES_STORAGE_KEY,
      JSON.stringify(cleaned.map((value, i) => ({ id: String(i + 1), value, isDefault: false }))),
    );
    notifyIndustryOptionsChanged();
  }, []);

  return { options, isLoading: false, saveOptions, isSaving: false };
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
