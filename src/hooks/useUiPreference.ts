import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Persist a UI preference (e.g. column width) to the database so it
 * survives page reloads.  Falls back to localStorage while the DB
 * round-trip is in flight.
 */
export function useUiPreference<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const cached = localStorage.getItem(`ui_pref_${key}`);
      if (cached) return JSON.parse(cached) as T;
    } catch { /* ignore */ }
    return defaultValue;
  });

  const loaded = useRef(false);
  const saving = useRef(false);

  // Load from DB on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await (supabase as any)
        .from('user_ui_preferences')
        .select('preference_value')
        .eq('user_id', user.id)
        .eq('preference_key', key)
        .maybeSingle();

      if (cancelled) return;
      loaded.current = true;

      if (data?.preference_value != null) {
        const dbVal = data.preference_value as T;
        setValue(dbVal);
        localStorage.setItem(`ui_pref_${key}`, JSON.stringify(dbVal));
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  // Persist to DB (debounced on the caller side)
  const persist = useCallback(async (newValue: T) => {
    setValue(newValue);
    localStorage.setItem(`ui_pref_${key}`, JSON.stringify(newValue));

    if (saving.current) return;
    saving.current = true;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await (supabase as any)
        .from('user_ui_preferences')
        .upsert(
          {
            user_id: user.id,
            preference_key: key,
            preference_value: newValue,
          },
          { onConflict: 'user_id,preference_key' }
        );
    } finally {
      saving.current = false;
    }
  }, [key]);

  return [value, persist] as const;
}
