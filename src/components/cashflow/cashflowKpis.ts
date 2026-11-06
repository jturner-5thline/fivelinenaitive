/**
 * Pure headline KPI math for Finance > Cash Flow (Cash In, Cash Out, Net
 * Change, Peak Cash, Low Cash). Used by the Finance header and the MCP
 * `get_cashflow_metrics` tool so both report identical figures.
 */
import type { WeeklyData } from './types';

export interface CashPoint {
  value: number;
  weekEnding: string;
  weekKey: string;
}

export interface CashflowKpis {
  cashIn: number;
  cashOut: number;
  netChange: number;
  kpiRangeLabel: string;
  kpiWeekCount: number;
  kpiRangeStart: string | null;
  kpiRangeEnd: string | null;
  peakCash: CashPoint | null;
  lowCash: CashPoint | null;
  visibleRangeStart: string | null;
  visibleRangeEnd: string | null;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const weekEndingOf = (key: string, entry: any): string =>
  typeof entry?.week_ending === 'string' ? entry.week_ending : key;

export function computeCashflowKpis(
  weekly: WeeklyData | null | undefined,
  weeksFuture: number,
  weeksPast: number,
  todayISO: string = new Date().toISOString().split('T')[0],
): CashflowKpis {
  const sorted = Object.entries(weekly || {}).sort(([a], [b]) => a.localeCompare(b));
  let currentIdx = sorted.findIndex(([k, e]) => weekEndingOf(k, e) >= todayISO);
  if (currentIdx < 0) currentIdx = sorted.length - 1;

  // Cash In / Out / Net: current week → current week + weeksFuture.
  const fStart = Math.max(0, currentIdx);
  const fEnd = Math.min(sorted.length, fStart + 1 + Math.max(0, weeksFuture));
  const fwd = sorted.slice(fStart, fEnd);
  const cashIn = fwd.reduce((s, [, e]: any) => s + (Number(e?.['TOTAL RECEIPTS']) || 0), 0) || 0;
  const cashOut = fwd.reduce((s, [, e]: any) => s + (Number(e?.['TOTAL DISBURSEMENTS']) || 0), 0) || 0;
  let kpiRangeLabel = '—';
  let kpiRangeStart: string | null = null;
  let kpiRangeEnd: string | null = null;
  if (fwd.length > 0) {
    kpiRangeStart = weekEndingOf(fwd[0][0], fwd[0][1]);
    kpiRangeEnd = weekEndingOf(fwd[fwd.length - 1][0], fwd[fwd.length - 1][1]);
    kpiRangeLabel = `${fmtShortDate(kpiRangeStart)} – ${fmtShortDate(kpiRangeEnd)} (${fwd.length} ${fwd.length === 1 ? 'week' : 'weeks'})`;
  }

  // Peak / Low Ending Cash: visible window (weeksPast → weeksFuture).
  let peakCash: CashPoint | null = null;
  let lowCash: CashPoint | null = null;
  let visibleRangeStart: string | null = null;
  let visibleRangeEnd: string | null = null;
  if (sorted.length > 0) {
    const vStart = Math.max(0, currentIdx - Math.max(0, weeksPast));
    const vEnd = Math.min(sorted.length, currentIdx + 1 + Math.max(0, weeksFuture));
    const win = sorted.slice(vStart, vEnd);
    if (win.length > 0) {
      visibleRangeStart = weekEndingOf(win[0][0], win[0][1]);
      visibleRangeEnd = weekEndingOf(win[win.length - 1][0], win[win.length - 1][1]);
    }
    for (const [key, entry] of win) {
      const v = Number((entry as any)?.['ENDING CASH']);
      if (!Number.isFinite(v)) continue;
      const we = (entry as any)?.week_ending || key;
      if (peakCash === null || v > peakCash.value) peakCash = { value: v, weekEnding: we, weekKey: key };
      if (lowCash === null || v < lowCash.value) lowCash = { value: v, weekEnding: we, weekKey: key };
    }
  }

  return {
    cashIn,
    cashOut,
    netChange: cashIn - cashOut,
    kpiRangeLabel,
    kpiWeekCount: fwd.length,
    kpiRangeStart,
    kpiRangeEnd,
    peakCash,
    lowCash,
    visibleRangeStart,
    visibleRangeEnd,
  };
}
