import { useCallback, useEffect, useState } from 'react';

export type DebtAdvisoryComparisonMode = 'variance' | 'plan';

const STORAGE_KEY = 'debt-advisory-comparison-mode';
const EVENT_NAME = 'debt-advisory-comparison-mode:change';

function readInitial(): DebtAdvisoryComparisonMode {
  if (typeof window === 'undefined') return 'variance';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'plan' ? 'plan' : 'variance';
}

export function useDebtAdvisoryComparisonMode(): [
  DebtAdvisoryComparisonMode,
  (mode: DebtAdvisoryComparisonMode) => void,
] {
  const [mode, setModeState] = useState<DebtAdvisoryComparisonMode>(readInitial);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DebtAdvisoryComparisonMode>).detail;
      if (detail === 'variance' || detail === 'plan') setModeState(detail);
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
  }, []);

  const setMode = useCallback((next: DebtAdvisoryComparisonMode) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
    }
  }, []);

  return [mode, setMode];
}