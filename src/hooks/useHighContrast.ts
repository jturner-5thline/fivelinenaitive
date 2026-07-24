import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'a11y:high-contrast';
const CLASS_NAME = 'high-contrast';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function applyClass(enabled: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(CLASS_NAME, enabled);
}

export function useHighContrast() {
  const [enabled, setEnabled] = useState<boolean>(readInitial);

  useEffect(() => {
    applyClass(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [enabled]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabled(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return { enabled, setEnabled, toggle };
}

/** Call once at app startup to hydrate the class before first paint effects. */
export function initHighContrast() {
  applyClass(readInitial());
}