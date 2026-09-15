import { useEffect, useState } from 'react';
import { GEO_OPTIONS } from '@/constants/geoOptions';
import { supabase } from '@/integrations/supabase/client';

/**
 * Editable list of Geographic Preference options.
 * The workspace list is stored in localStorage; defaults are used until edited.
 */
export const GEO_OPTIONS_STORAGE_KEY = 'lender-config-geographies';
export const GEO_OPTIONS_EVENT = 'geo-options-changed';

export function getDefaultGeoOptions(): string[] {
  return [...GEO_OPTIONS];
}

export function getGeoOptions(): string[] {
  try {
    const raw = localStorage.getItem(GEO_OPTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const cleaned = (Array.isArray(parsed) ? parsed : [])
        .map(v => String(v || '').trim())
        .filter(Boolean);
      if (cleaned.length > 0) {
        const seen = new Set<string>();
        return cleaned.filter(v => {
          const k = v.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
    }
  } catch {
    /* fall back to defaults */
  }
  return getDefaultGeoOptions();
}

export function saveGeoOptions(values: string[]): void {
  const cleaned = values.map(v => v.trim()).filter(Boolean);
  localStorage.setItem(GEO_OPTIONS_STORAGE_KEY, JSON.stringify(cleaned));
  try {
    window.dispatchEvent(new CustomEvent(GEO_OPTIONS_EVENT));
  } catch {
    /* ignore */
  }
}

export function useGeoOptionsList(): string[] {
  const [options, setOptions] = useState<string[]>(() => getGeoOptions());
  useEffect(() => {
    const sync = () => setOptions(getGeoOptions());
    window.addEventListener(GEO_OPTIONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GEO_OPTIONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return options;
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
  for (const row of ((data ?? []) as unknown as Array<{ geographies: string[] | null; geography?: string | null }>)) {
    const tags = new Set<string>();
    for (const raw of row.geographies ?? []) {
      const k = String(raw || '').trim().toLowerCase();
      if (k) tags.add(k);
    }
    for (const raw of String(row.geography || '').split(',')) {
      const k = raw.trim().toLowerCase();
      if (k) tags.add(k);
    }
    for (const k of tags) {
      const match = wanted.get(k);
      if (match) result[match] = (result[match] ?? 0) + 1;
    }
  }
  return result;
}
