import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  loadPersistedRange,
  resolveRange,
  defaultGranularityForRange,
  type TimeRangePresetId,
} from '@/lib/insightsTimeRange';
import type { InsightsTimeRangeValue } from '@/components/insights/InsightsTimeRangeSelector';

/**
 * Single source of truth for the date range applied across the Sales & BD page
 * (Overview tab and Partners Pipeline tab). Mirrors FinServ's selector defaults
 * so users see consistent behavior across the platform.
 */
interface Ctx {
  range: InsightsTimeRangeValue;
  setRange: (v: InsightsTimeRangeValue) => void;
  /** Convenience accessors */
  start: Date;
  end: Date;
}

const SalesBdDateRangeContext = createContext<Ctx | null>(null);

export const SALES_BD_RANGE_BOARD_ID = 'sales-bd';

export function SalesBdDateRangeProvider({ children }: { children: ReactNode }) {
  const initialPersisted = useMemo(() => loadPersistedRange(SALES_BD_RANGE_BOARD_ID), []);
  const initialResolved = useMemo(() => {
    const id: TimeRangePresetId = initialPersisted?.presetId ?? 'ytd';
    return resolveRange(id, {
      custom: initialPersisted?.custom,
      includeCurrentMonth: initialPersisted?.includeCurrentMonth ?? true,
    });
  }, [initialPersisted]);

  const [range, setRange] = useState<InsightsTimeRangeValue>(() => ({
    presetId: initialPersisted?.presetId ?? 'ytd',
    granularity:
      initialPersisted?.granularity ??
      defaultGranularityForRange(initialResolved.start, initialResolved.end),
    custom: initialPersisted?.custom,
    includeCurrentMonth: initialPersisted?.includeCurrentMonth ?? true,
    resolved: initialResolved,
  }));

  const value = useMemo<Ctx>(() => {
    const start = new Date(range.resolved.start + 'T00:00:00');
    const end = new Date(range.resolved.end + 'T23:59:59');
    return { range, setRange, start, end };
  }, [range]);

  return (
    <SalesBdDateRangeContext.Provider value={value}>
      {children}
    </SalesBdDateRangeContext.Provider>
  );
}

export function useSalesBdDateRange(): Ctx {
  const ctx = useContext(SalesBdDateRangeContext);
  if (!ctx) {
    throw new Error('useSalesBdDateRange must be used within SalesBdDateRangeProvider');
  }
  return ctx;
}

/**
 * Safe variant: returns null when no provider is present so shared components
 * can still render outside of /sales-bd (e.g. on other pages that reuse them).
 */
export function useOptionalSalesBdDateRange(): Ctx | null {
  return useContext(SalesBdDateRangeContext);
}