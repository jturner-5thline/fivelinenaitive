import { useSyncExternalStore } from 'react';

export interface CashThresholds {
  /** Low water mark / Min Liquidity line, in dollars. */
  minLiquidity: number;
  /** Caution threshold (Low Cash alert), in dollars. */
  caution: number;
}

export const DEFAULT_CASH_THRESHOLDS: CashThresholds = { minLiquidity: 250_000, caution: 100_000 };
const KEY = 'cf-cash-thresholds-v1';
const listeners = new Set<() => void>();
let cache: CashThresholds | null = null;

export function sanitizeThresholds(raw: Partial<CashThresholds> | null | undefined): CashThresholds {
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  return {
    minLiquidity: ok(raw?.minLiquidity) ? (raw!.minLiquidity as number) : DEFAULT_CASH_THRESHOLDS.minLiquidity,
    caution: ok(raw?.caution) ? (raw!.caution as number) : DEFAULT_CASH_THRESHOLDS.caution,
  };
}

export function getCashThresholds(): CashThresholds {
  if (cache) return cache;
  try {
    cache = sanitizeThresholds(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    cache = { ...DEFAULT_CASH_THRESHOLDS };
  }
  return cache;
}

export function setCashThresholds(next: Partial<CashThresholds>) {
  cache = sanitizeThresholds({ ...getCashThresholds(), ...next });
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useCashThresholds(): CashThresholds {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getCashThresholds,
    () => DEFAULT_CASH_THRESHOLDS,
  );
}

/** "$250K" / "$1.5M" style label for chart legends. */
export function thresholdLabel(v: number): string {
  if (v >= 1_000_000) return `$${+(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${+(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}
