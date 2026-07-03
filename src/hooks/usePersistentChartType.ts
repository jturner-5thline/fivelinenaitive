import { useEffect, useState } from "react";

const PREFIX = "lovable.chartType.";

export function usePersistentChartType<T extends string>(key: string, defaultValue: T) {
  const storageKey = PREFIX + key;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(storageKey);
      return (stored as T) || defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // ignore
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}