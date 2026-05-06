import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  subDays,
  format as fmtDateFn,
  parse as parseDateFn,
} from 'date-fns';
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

/**
 * Global Month/Quarter "Reporting period" filter. When set, it OVERRIDES the
 * legacy timeframe (`tf`) so every widget on /insights aligns to a single
 * calendar month or quarter. URL params: `view=month|quarter` and
 * `period=YYYY-MM` or `YYYY-Qn`.
 */
export type ReportingView = 'month' | 'quarter';
export interface ReportingPeriod {
  view: ReportingView;
  /** Canonical token: `2026-04` for month, `2026-Q2` for quarter. */
  period: string;
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
  label: string; // "Apr 2026" or "Q2 2026"
}

const STORAGE_KEY = 'insights-timeframe-v1';
const REPORTING_STORAGE_KEY = 'insights-reporting-period-v1';

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

function quarterFromMonth(monthIndex0: number) {
  return Math.floor(monthIndex0 / 3) + 1;
}

function monthLabel(year: number, month1: number) {
  const d = new Date(year, month1 - 1, 1);
  return fmtDateFn(d, 'MMM yyyy');
}

function computeReportingPeriod(view: ReportingView, period: string): ReportingPeriod {
  if (view === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    const now = new Date();
    const year = m ? parseInt(m[1], 10) : now.getFullYear();
    const month1 = m ? parseInt(m[2], 10) : now.getMonth() + 1;
    const start = startOfMonth(new Date(year, month1 - 1, 1));
    const end = endOfMonth(start);
    return {
      view,
      period: `${year}-${pad(month1)}`,
      start: ymd(start),
      end: ymd(end),
      label: monthLabel(year, month1),
    };
  }
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  const now = new Date();
  const year = m ? parseInt(m[1], 10) : now.getFullYear();
  const q = m ? parseInt(m[2], 10) : quarterFromMonth(now.getMonth());
  const start = startOfQuarter(new Date(year, (q - 1) * 3, 1));
  const end = endOfQuarter(start);
  return {
    view,
    period: `${year}-Q${q}`,
    start: ymd(start),
    end: ymd(end),
    label: `Q${q} ${year}`,
  };
}

/** Default to the most recently *closed* month / current quarter. */
function defaultReportingPeriod(view: ReportingView): ReportingPeriod {
  const now = new Date();
  if (view === 'month') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return computeReportingPeriod('month', `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`);
  }
  const q = quarterFromMonth(now.getMonth());
  return computeReportingPeriod('quarter', `${now.getFullYear()}-Q${q}`);
}

function readInitialReporting(searchParams: URLSearchParams): ReportingPeriod | null {
  const view = searchParams.get('view');
  const period = searchParams.get('period');
  if ((view === 'month' || view === 'quarter') && period) {
    return computeReportingPeriod(view, period);
  }
  try {
    const raw = globalThis.localStorage?.getItem(REPORTING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if ((parsed?.view === 'month' || parsed?.view === 'quarter') && parsed?.period) {
        return computeReportingPeriod(parsed.view, parsed.period);
      }
    }
  } catch { /* ignore */ }
  return null;
}

interface ContextValue {
  timeframe: InsightsTimeframe;
  setTimeframe: (id: InsightsTimeframeId, custom?: { start: string; end: string }) => void;
  /** TimeWindow value for use in WidgetConfig.xAxis.window. */
  timeWindow: TimeWindow;
  customRange?: { start: string; end: string };
  /** QuarterOption-shaped value for legacy widgets that consume `selectedQuarter`. */
  selectedQuarter: QuarterOption;
  /**
   * Global Month/Quarter Reporting Period overlay (from header picker).
   * When non-null, all widgets should align to this single calendar window.
   */
  reportingPeriod: ReportingPeriod | null;
  setReportingPeriod: (next: ReportingPeriod | null) => void;
  /** Switch granularity while preserving intent (Apr 2026 ↔ Q2 2026). */
  switchReportingView: (view: ReportingView) => void;
}

const Ctx = createContext<ContextValue | null>(null);

export function InsightsTimeframeProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(() => readInitial(searchParams));
  const [reporting, setReporting] = useState<ReportingPeriod | null>(() => readInitialReporting(searchParams));

  const baseTimeframe = useMemo(() => computeRange(state.id, state.custom), [state]);
  // Reporting period (when active) wins as the global timeframe so every
  // downstream widget reading `timeframe.start/end` automatically aligns.
  const timeframe = useMemo<InsightsTimeframe>(() => {
    if (!reporting) return baseTimeframe;
    return {
      id: 'custom',
      start: reporting.start,
      end: reporting.end,
      label: reporting.label,
    };
  }, [baseTimeframe, reporting]);

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
    const nextRep = readInitialReporting(searchParams);
    setReporting(prev => {
      if (prev?.view === nextRep?.view && prev?.period === nextRep?.period) return prev;
      return nextRep;
    });
  }, [searchParams]);

  const customRange = state.id === 'custom' ? state.custom : undefined;

  const writeReportingToUrl = useCallback((next: ReportingPeriod | null) => {
    const sp = new URLSearchParams(searchParams);
    if (next) {
      sp.set('view', next.view);
      sp.set('period', next.period);
    } else {
      sp.delete('view');
      sp.delete('period');
    }
    setSearchParams(sp, { replace: true });
  }, [searchParams, setSearchParams]);

  const setReportingPeriod = useCallback((next: ReportingPeriod | null) => {
    setReporting(next);
    try {
      if (next) {
        globalThis.localStorage?.setItem(REPORTING_STORAGE_KEY, JSON.stringify({ view: next.view, period: next.period }));
      } else {
        globalThis.localStorage?.removeItem(REPORTING_STORAGE_KEY);
      }
    } catch { /* ignore */ }
    writeReportingToUrl(next);
  }, [writeReportingToUrl]);

  const switchReportingView = useCallback((view: ReportingView) => {
    const current = reporting ?? defaultReportingPeriod('month');
    if (current.view === view) return;
    if (view === 'quarter') {
      // month → quarter: map to that month's quarter
      const m = /^(\d{4})-(\d{2})$/.exec(current.period);
      if (m) {
        const year = parseInt(m[1], 10);
        const month0 = parseInt(m[2], 10) - 1;
        const q = quarterFromMonth(month0);
        setReportingPeriod(computeReportingPeriod('quarter', `${year}-Q${q}`));
        return;
      }
      setReportingPeriod(defaultReportingPeriod('quarter'));
      return;
    }
    // quarter → month: pick the most recent month within that quarter
    const m = /^(\d{4})-Q([1-4])$/.exec(current.period);
    if (m) {
      const year = parseInt(m[1], 10);
      const q = parseInt(m[2], 10);
      const now = new Date();
      let month1 = q * 3; // last month of quarter
      if (year === now.getFullYear() && q === quarterFromMonth(now.getMonth())) {
        // current quarter → use most recent closed month within it (or first if none)
        const recent = Math.max((q - 1) * 3 + 1, now.getMonth()); // now.getMonth() is 0-based prev-1+1
        month1 = Math.min(recent, q * 3);
      }
      setReportingPeriod(computeReportingPeriod('month', `${year}-${pad(month1)}`));
      return;
    }
    setReportingPeriod(defaultReportingPeriod('month'));
  }, [reporting, setReportingPeriod]);

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
    reportingPeriod: reporting,
    setReportingPeriod,
    switchReportingView,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Helpers exported for the picker UI. */
export const reportingPeriodHelpers = {
  computeReportingPeriod,
  defaultReportingPeriod,
  quarterFromMonth,
};

export function useInsightsTimeframe(): ContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInsightsTimeframe must be used inside InsightsTimeframeProvider');
  return ctx;
}

/** Safe accessor — returns null when used outside of an Insights tree. */
export function useInsightsTimeframeOptional(): ContextValue | null {
  return useContext(Ctx);
}
