import { useCallback, useEffect, useState } from 'react';

/**
 * Settings: AI Assist → Automations → "Auto-suggest deal note from detected emails".
 * Defaults to ON. Persisted in localStorage so it survives reloads.
 */
const PREF_KEY = 'ai-assist.auto-suggest-deal-note-from-emails';

function read(): boolean {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function useAutoDealNoteSuggestionPref() {
  const [enabled, setEnabledState] = useState<boolean>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREF_KEY) setEnabledState(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(PREF_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    setEnabledState(next);
  }, []);

  return { enabled, setEnabled };
}

export function isAutoDealNoteSuggestionEnabled(): boolean {
  return read();
}