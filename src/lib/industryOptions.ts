import { useEffect, useState } from 'react';
import { INDUSTRY_OPTIONS } from '@/constants/industries';

/**
 * Single source of truth for the industry dropdown options.
 *
 * The config screen writes the workspace list to localStorage. Removals are
 * additionally recorded in a dedicated "removed" list so that a canonical
 * default can never be re-merged back into the list on the next load.
 */
export const INDUSTRIES_STORAGE_KEY = 'lender-config-industries';
export const INDUSTRIES_REMOVED_STORAGE_KEY = 'lender-config-industries-removed';
export const INDUSTRY_OPTIONS_EVENT = 'industry-options-changed';

const norm = (v: string) => v.trim().toLowerCase();

export function getRemovedIndustries(): Set<string> {
  try {
    const raw = localStorage.getItem(INDUSTRIES_REMOVED_STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    return new Set(list.map(norm));
  } catch {
    return new Set();
  }
}

export function setRemovedIndustries(values: Iterable<string>): void {
  try {
    localStorage.setItem(
      INDUSTRIES_REMOVED_STORAGE_KEY,
      JSON.stringify(Array.from(new Set(Array.from(values, norm)))),
    );
    notifyIndustryOptionsChanged();
  } catch {
    /* ignore */
  }
}

export function addRemovedIndustry(value: string): void {
  const set = getRemovedIndustries();
  set.add(norm(value));
  setRemovedIndustries(set);
}

export function unremoveIndustry(value: string): void {
  const set = getRemovedIndustries();
  set.delete(norm(value));
  setRemovedIndustries(set);
}

export function notifyIndustryOptionsChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(INDUSTRY_OPTIONS_EVENT));
  } catch {
    /* ignore */
  }
}

/** Resolved list of industry options: saved list (or defaults) minus removals. */
export function getIndustryOptions(): string[] {
  const removed = getRemovedIndustries();
  let base: string[] = [...INDUSTRY_OPTIONS];
  try {
    const raw = localStorage.getItem(INDUSTRIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{ value?: string }>;
      const saved = parsed.map(i => (i?.value || '').trim()).filter(Boolean);
      if (saved.length > 0) base = saved;
    }
  } catch {
    /* fall back to defaults */
  }
  const seen = new Set<string>();
  return base.filter(v => {
    const k = norm(v);
    if (!k || removed.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** React hook mirroring getIndustryOptions(), kept in sync across tabs/screens. */
export function useIndustryOptionsList(): string[] {
  const [options, setOptions] = useState<string[]>(() => getIndustryOptions());

  useEffect(() => {
    const sync = () => setOptions(getIndustryOptions());
    window.addEventListener(INDUSTRY_OPTIONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(INDUSTRY_OPTIONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return options;
}
