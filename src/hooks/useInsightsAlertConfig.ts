import { useCallback, useEffect, useState } from 'react';

export interface InsightsAlertConfig {
  /** % MoM improvement required to fire a positive alert */
  positiveThreshold: number;
  /** % MoM decline required to fire a warning */
  warningThreshold: number;
  /** % MoM decline required to fire a critical alert */
  criticalThreshold: number;
  /** Metric keys explicitly disabled from the comparison + alerts. */
  disabledMetrics: string[];
}

export const DEFAULT_ALERT_CONFIG: InsightsAlertConfig = {
  positiveThreshold: 20,
  warningThreshold: 10,
  criticalThreshold: 25,
  disabledMetrics: [],
};

const STORAGE_KEY = 'insights-alert-config-v1';

function readConfig(): InsightsAlertConfig {
  if (typeof window === 'undefined') return DEFAULT_ALERT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      positiveThreshold: Number(parsed.positiveThreshold ?? DEFAULT_ALERT_CONFIG.positiveThreshold),
      warningThreshold: Number(parsed.warningThreshold ?? DEFAULT_ALERT_CONFIG.warningThreshold),
      criticalThreshold: Number(parsed.criticalThreshold ?? DEFAULT_ALERT_CONFIG.criticalThreshold),
      disabledMetrics: Array.isArray(parsed.disabledMetrics) ? parsed.disabledMetrics : [],
    };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

/**
 * Per-user trend alert thresholds + metric coverage settings.
 * Persisted in localStorage; broadcast across hook instances via a custom event
 * so the AI Summary, Compare dialog, and Ask-AI chat all stay in sync.
 */
export function useInsightsAlertConfig() {
  const [config, setConfig] = useState<InsightsAlertConfig>(() => readConfig());

  useEffect(() => {
    const onChange = () => setConfig(readConfig());
    window.addEventListener('insights-alert-config-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('insights-alert-config-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const update = useCallback((next: Partial<InsightsAlertConfig>) => {
    const merged = { ...readConfig(), ...next };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('insights-alert-config-changed'));
    setConfig(merged);
  }, []);

  const reset = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('insights-alert-config-changed'));
    setConfig(DEFAULT_ALERT_CONFIG);
  }, []);

  const toggleMetric = useCallback((key: string, enabled: boolean) => {
    const cur = readConfig();
    const set = new Set(cur.disabledMetrics);
    if (enabled) set.delete(key);
    else set.add(key);
    update({ disabledMetrics: Array.from(set) });
  }, [update]);

  return { config, update, reset, toggleMetric };
}