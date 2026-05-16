import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { startOfMonth, startOfQuarter, startOfYear, subMonths, subYears, subDays, differenceInCalendarDays, endOfDay, addDays } from 'date-fns';
import { QBO_ENTITIES } from '@/config/qboEntities';

export type RangePreset = 'MTD' | 'QTD' | 'YTD' | 'TTM' | 'custom';
export type Comparison = 'prior-year' | 'prior-period' | 'none';
export type Granularity = 'day' | 'week' | 'month' | 'quarter';

export interface DateRange {
  preset: RangePreset;
  start: string; // ISO
  end: string;   // ISO
}

export interface RevenueFiltersState {
  entities: string[];           // realm IDs
  range: DateRange;
  comparison: Comparison;
  granularity: Granularity;
}

const STORAGE_KEY = 'insights:revenue-customers:filters:v1';
const ALL_REALMS = QBO_ENTITIES.map(e => e.realmId);

export function computePresetRange(preset: RangePreset, now = new Date()): DateRange {
  const end = endOfDay(now);
  let start: Date;
  switch (preset) {
    case 'MTD': start = startOfMonth(now); break;
    case 'QTD': start = startOfQuarter(now); break;
    case 'YTD': start = startOfYear(now); break;
    case 'TTM': start = subMonths(now, 12); break;
    default:    start = startOfYear(now);
  }
  return { preset, start: start.toISOString(), end: end.toISOString() };
}

const DEFAULT_STATE: RevenueFiltersState = {
  entities: ALL_REALMS,
  range: computePresetRange('YTD'),
  comparison: 'prior-year',
  granularity: 'month',
};

interface Ctx {
  filters: RevenueFiltersState;
  setEntities: (e: string[]) => void;
  setRange: (r: DateRange) => void;
  setPreset: (p: RangePreset) => void;
  setComparison: (c: Comparison) => void;
  setGranularity: (g: Granularity) => void;
  reset: () => void;
  comparisonRange: { start: string; end: string } | null;
}

const RevenueFiltersContext = createContext<Ctx | null>(null);

export function RevenueFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<RevenueFiltersState>(() => {
    if (typeof window === 'undefined') return DEFAULT_STATE;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_STATE;
      const parsed = JSON.parse(raw) as RevenueFiltersState;
      // Refresh preset-driven ranges so dates stay current across sessions
      if (parsed.range?.preset && parsed.range.preset !== 'custom') {
        parsed.range = computePresetRange(parsed.range.preset);
      }
      return { ...DEFAULT_STATE, ...parsed };
    } catch {
      return DEFAULT_STATE;
    }
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);

  const setEntities = useCallback((entities: string[]) => setFilters(f => ({ ...f, entities })), []);
  const setRange = useCallback((range: DateRange) => setFilters(f => ({ ...f, range })), []);
  const setPreset = useCallback((p: RangePreset) => setFilters(f => ({ ...f, range: computePresetRange(p) })), []);
  const setComparison = useCallback((comparison: Comparison) => setFilters(f => ({ ...f, comparison })), []);
  const setGranularity = useCallback((granularity: Granularity) => setFilters(f => ({ ...f, granularity })), []);
  const reset = useCallback(() => setFilters(DEFAULT_STATE), []);

  const comparisonRange = useMemo(() => {
    if (filters.comparison === 'none') return null;
    const s = new Date(filters.range.start);
    const e = new Date(filters.range.end);
    if (filters.comparison === 'prior-year') {
      return { start: subYears(s, 1).toISOString(), end: subYears(e, 1).toISOString() };
    }
    // prior-period: shift back by length of current period
    const days = Math.max(1, differenceInCalendarDays(e, s) + 1);
    return {
      start: subDays(s, days).toISOString(),
      end: subDays(e, days).toISOString(),
    };
  }, [filters.range, filters.comparison]);

  const value = useMemo<Ctx>(() => ({
    filters, setEntities, setRange, setPreset, setComparison, setGranularity, reset, comparisonRange,
  }), [filters, setEntities, setRange, setPreset, setComparison, setGranularity, reset, comparisonRange]);

  return <RevenueFiltersContext.Provider value={value}>{children}</RevenueFiltersContext.Provider>;
}

export function useRevenueFilters() {
  const ctx = useContext(RevenueFiltersContext);
  if (!ctx) throw new Error('useRevenueFilters must be used within RevenueFiltersProvider');
  return ctx;
}

export { ALL_REALMS };
// re-export to avoid unused warnings on internal helpers
export const _utils = { addDays };