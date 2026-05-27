import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * useState backed by localStorage. Hydrates synchronously on first render so
 * the very first paint already reflects the persisted value, then mirrors
 * every subsequent change back to localStorage.
 *
 * Safe to call with `undefined` keys (will simply not persist until a key is
 * available — useful for per-user namespacing).
 */
export function useLocalStorageState<T>(
  key: string | null | undefined,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const read = useCallback((): T => {
    if (!key || typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [state, setState] = useState<T>(read);
  const lastKeyRef = useRef(key);

  // Re-hydrate when the key flips (e.g. once a user-id-scoped key is known).
  useEffect(() => {
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      setState(read());
    }
  }, [key, read]);

  useEffect(() => {
    if (!key || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Quota / serialization error — ignore.
    }
  }, [key, state]);

  return [state, setState];
}