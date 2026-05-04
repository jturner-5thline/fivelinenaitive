import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, startOfQuarter, startOfYear, subDays, format as fmtDateFn } from 'date-fns';
import type { TimeWindow } from '@/components/widget-editor/widgetTypes';
import {
  buildCustomPeriod,
  type QuarterOption,
} from '@/hooks/useQBQuarterlyRevenue';

/**
 * Unified timeframe selector that drives every widget on the Weekly Rundown
 * (Insights) dashboard. Replaces the previous mix of:
 *   - Quarter/Custom PeriodPicker
 *   - Per-card MTD/QTD/YTD badges
 *   - Executive Dashboard week arrows
 *
 * All widgets read `selectedQuarter` (a QuarterOption-shaped value, kept for
 * backwards compatibility) and `timeWindow` from this context. URL param
 * `?tf=` persists the choice across reloads.
 */

export type InsightsTimeframeId =
  | '7d'
  | '30d'
  | '90d'
  | 'mtd'
  | 'qtd'
  | 'ytd'
  | 'custom';

export interface InsightsTimeframe {
  id: InsightsTimeframeId;
  /** Always populated. start/end are inclusive YYYY-MM-DD in local time. */
  start: string;
  end: string;
  label: string;
}

const STORAGE_KEY = 'insights-timeframe-v1';

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function computeRange(id: InsightsTimeframeId, custom?: { start: string; end: string }): InsightsTimeframe {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (id) {
    case '7d': {
      const s = subDays(today, 6);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 7 days' };
    }
    case '30d': {
      const s = subDays(today, 29);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 30 days' };
    }
    case '90d': {
      const s = subDays(today, 89);
      return { id, start: ymd(s), end: ymd(today), label: 'Last 90 days' };
    }
    case 'mtd':
      return { id, start: ymd(startOfMonth(today)), end: ymd(today), label: 'Month to date' };
    case 'qtd':
      return { id, start: ymd(startOfQuarter(today)), end: ymd(today), label: 'Quarter to date' };
    case 'ytd':
      return { id, start: ymd(startOfYear(today)), end: ymd(today), label: 'Year to date' };
    case 'custom': {
      if (custom?.start && custom?.end) {
        const s = new Date(custom.start + 'T00:00:00');
        const e = new Date(custom.end + 'T00:00:00');
        return {
          id,
          start: custom.start,
          end: custom.end,
          label: `${fmtDateFn(s, 'MMM d, yyyy')} – ${fmtDateFn(e, 'MMM d, yyyy')}`,
        };
      }
      // Fallback to YTD if custom is incomplete
      return computeRange('ytd');
    }
  }
}

function readInitial(searchParams: URLSearchParams): { id: InsightsTimeframeId; custom?: { start: string; end: string } } {
  const tf = searchParams.get('tf');
  const cs = searchParams.get('tfStart');
  const ce = searchParams.get('tfEnd');
  if (tf === 'custom' && cs && ce) return { id: 'custom', custom: { start: cs, end: ce } };
  if (tf && ['7d', '30d', '90d', 'mtd', 'qtd', 'ytd'].includes(tf)) return { id: tf as InsightsTimeframeId };
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id === 'custom' && parsed.custom) return { id: 'custom', custom: parsed.custom };
      if (parsed?.id) return { id: parsed.id };
    }
  } catch { /* ignore */ }
  return { id: 'qtd' };
}

interface ContextValue {
  timeframe: InsightsTimeframe;
  setTimeframe: (id: InsightsTimeframeId, custom?: { start: string; end: string }) => void;
  /** TimeWindow value for use in WidgetConfig.xAxis.window. */
  timeWindow: TimeWindow;
  customRange?: { start: string; end: string };
  /** QuarterOption-shaped value for legacy widgets that consume `selectedQuarter`. */
  selectedQuarter: QuarterOption;
}

const Ctx = createContext<ContextValue | null>(null);

export function InsightsTimeframeProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(() => readInitial(searchParams));

  const timeframe = useMemo(() => computeRange(state.id, state.custom), [state]);

  const setTimeframe = useCallback((id: InsightsTimeframeId, custom?: { start: string; end: string }) => {
    setState({ id, custom });
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ id, custom }));
    } catch { /* ignore */ }
    const sp = new URLSearchParams(searchParams);
    sp.set('tf', id);
    if (id === 'custom' && custom) {
      sp.set('tfStart', custom.start);
      sp.set('tfEnd', custom.end);
    } else {
      sp.delete('tfStart');
      sp.delete('tfEnd');
    }
    setSearchParams(sp, { replace: true });
  }, [searchParams, setSearchParams]);

  // Sync if URL changes externally
  useEffect(() => {
    const next = readInitial(searchParams);
    setState(prev => {
      if (prev.id === next.id && prev.custom?.start === next.custom?.start && prev.custom?.end === next.custom?.end) {
        return prev;
      }
      return next;
    });
  }, [searchParams]);

  const customRange = state.id === 'custom' ? state.custom : undefined;

  // Build a QuarterOption-shaped value so all existing widgets keep working.
  const selectedQuarter = useMemo<QuarterOption>(() => {
    const s = new Date(timeframe.start + 'T00:00:00');
    const e = new Date(timeframe.end + 'T00:00:00');
    const q = buildCustomPeriod(s, e);
    return { ...q, label: timeframe.label };
  }, [timeframe]);

  const value: ContextValue = {
    timeframe,
    setTimeframe,
    timeWindow: state.id as TimeWindow,
    customRange,
    selectedQuarter,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInsightsTimeframe(): ContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInsightsTimeframe must be used inside InsightsTimeframeProvider');
  return ctx;
}

/** Safe accessor — returns null when used outside of an Insights tree. */
export function useInsightsTimeframeOptional(): ContextValue | null {
  return useContext(Ctx);
}
