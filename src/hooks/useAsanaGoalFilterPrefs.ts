import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  DEFAULT_ASANA_GOAL_FILTERS,
  type AsanaGoalFilterTemplates,
} from '@/components/metrics/dashboards/QuarterlyInsightsReport';

export interface AsanaGoalFilterOverride {
  quarterLabel?: string;
  halfLabel?: string;
}

export interface AsanaGoalFilterPrefs {
  filters: AsanaGoalFilterTemplates;
  override: AsanaGoalFilterOverride | null;
  exactMatch: boolean;
}

export interface UseAsanaGoalFilterPrefsResult extends AsanaGoalFilterPrefs {
  isLoaded: boolean;
  save: (next: Partial<AsanaGoalFilterPrefs>) => Promise<void>;
  reset: () => Promise<void>;
}

const DEFAULTS: AsanaGoalFilterPrefs = {
  filters: DEFAULT_ASANA_GOAL_FILTERS,
  override: null,
  exactMatch: false,
};

const LS_KEY_PREFIX = 'asanaGoalFilterPrefs:v1:';
const lsKey = (companyId: string | null) => `${LS_KEY_PREFIX}${companyId ?? 'global'}`;

function readLocalSnapshot(companyId: string | null): AsanaGoalFilterPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(lsKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const filters = parsed.filters && typeof parsed.filters === 'object'
      ? {
          quarters: { ...DEFAULT_ASANA_GOAL_FILTERS.quarters, ...(parsed.filters.quarters || {}) },
          halves: { ...DEFAULT_ASANA_GOAL_FILTERS.halves, ...(parsed.filters.halves || {}) },
        }
      : DEFAULT_ASANA_GOAL_FILTERS;
    return {
      filters,
      override: parsed.override ?? null,
      exactMatch: !!parsed.exactMatch,
    };
  } catch {
    return null;
  }
}

function writeLocalSnapshot(companyId: string | null, prefs: AsanaGoalFilterPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(companyId), JSON.stringify(prefs));
  } catch {
    /* quota / private mode — ignore */
  }
}

/**
 * Server-side persisted Asana Goals filter mapping & overrides.
 * Scoped per (user, company). Survives reloads / navigation.
 *
 * Also mirrors the current snapshot to localStorage (per company) so a
 * page reload hydrates instantly with the last-known values, before the
 * server round-trip resolves and reconciles them.
 */
export function useAsanaGoalFilterPrefs(): UseAsanaGoalFilterPrefsResult {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [prefs, setPrefs] = useState<AsanaGoalFilterPrefs>(() => readLocalSnapshot(null) ?? DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);
  const userIdRef = useRef<string | null>(null);

  // Initial fetch — ALWAYS use isLoaded guard so we never overwrite
  // saved server state with defaults during init (per platform standards).
  useEffect(() => {
    let cancelled = false;
    // Instant hydration from localStorage for THIS company before the
    // server round-trip completes.
    const local = readLocalSnapshot(companyId);
    if (local) setPrefs(local);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !companyId) {
        if (!cancelled) {
          const fallback = local ?? DEFAULTS;
          setPrefs(fallback);
          setIsLoaded(true);
        }
        return;
      }
      userIdRef.current = user.id;

      const { data, error } = await supabase
        .from('asana_goal_filter_prefs')
        .select('filters, override, exact_match')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('[AsanaGoalFilterPrefs] load failed:', error);
        setPrefs(local ?? DEFAULTS);
        setIsLoaded(true);
        return;
      }

      if (data) {
        const loadedFilters = (data.filters && typeof data.filters === 'object'
          ? (data.filters as Partial<AsanaGoalFilterTemplates>)
          : {}) as Partial<AsanaGoalFilterTemplates>;
        const next: AsanaGoalFilterPrefs = {
          filters: {
            quarters: { ...DEFAULT_ASANA_GOAL_FILTERS.quarters, ...(loadedFilters.quarters || {}) },
            halves: { ...DEFAULT_ASANA_GOAL_FILTERS.halves, ...(loadedFilters.halves || {}) },
          },
          override: (data.override as AsanaGoalFilterOverride | null) || null,
          exactMatch: !!data.exact_match,
        };
        setPrefs(next);
        writeLocalSnapshot(companyId, next);
      } else {
        const fallback = local ?? DEFAULTS;
        setPrefs(fallback);
        writeLocalSnapshot(companyId, fallback);
      }
      setIsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const save = useCallback(async (next: Partial<AsanaGoalFilterPrefs>) => {
    setPrefs(prev => {
      const merged: AsanaGoalFilterPrefs = {
        filters: next.filters ?? prev.filters,
        override: next.override === undefined ? prev.override : next.override,
        exactMatch: next.exactMatch ?? prev.exactMatch,
      };
      // Mirror to localStorage immediately for instant rehydration on reload.
      writeLocalSnapshot(companyId, merged);
      // Persist asynchronously; do not block UI
      (async () => {
        const userId = userIdRef.current;
        if (!userId || !companyId) return;
        const { error } = await supabase
          .from('asana_goal_filter_prefs')
          .upsert(
            [
              {
                user_id: userId,
                company_id: companyId,
                filters: JSON.parse(JSON.stringify(merged.filters)),
                override: merged.override ? JSON.parse(JSON.stringify(merged.override)) : null,
                exact_match: merged.exactMatch,
              },
            ],
            { onConflict: 'user_id,company_id' }
          );
        if (error) console.error('[AsanaGoalFilterPrefs] save failed:', error);
      })();
      return merged;
    });
  }, [companyId]);

  const reset = useCallback(async () => {
    setPrefs(DEFAULTS);
    writeLocalSnapshot(companyId, DEFAULTS);
    const userId = userIdRef.current;
    if (!userId || !companyId) return;
    const { error } = await supabase
      .from('asana_goal_filter_prefs')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId);
    if (error) console.error('[AsanaGoalFilterPrefs] reset failed:', error);
  }, [companyId]);

  return { ...prefs, isLoaded, save, reset };
}