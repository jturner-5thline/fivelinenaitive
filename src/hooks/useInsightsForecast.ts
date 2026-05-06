import { useMemo } from 'react';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { differenceInCalendarMonths, parseISO } from 'date-fns';

export interface ForecastPoint {
  metricKey: string;
  label: string;
  format: 'currency' | 'number' | 'percent';
  current: number;
  trailing3Avg: number;
  /** Linear projection for next period using slope of trailing 6 months. */
  nextProjection: number;
  /** Confidence band ±  (1 stdev) of trailing 6 deltas. */
  band: number;
  goodWhen: 'up' | 'down';
}

function linearProjection(series: number[]): { next: number; band: number; avg: number } {
  if (series.length === 0) return { next: 0, band: 0, avg: 0 };
  const n = series.length;
  const xs = series.map((_, i) => i);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = series.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (series[i] - meanY), 0);
  const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0) || 1;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const next = intercept + slope * n;
  const deltas = series.slice(1).map((v, i) => v - series[i]);
  const dMean = deltas.reduce((s, v) => s + v, 0) / Math.max(1, deltas.length);
  const variance = deltas.reduce((s, v) => s + (v - dMean) ** 2, 0) / Math.max(1, deltas.length);
  const band = Math.sqrt(variance);
  return { next: Math.max(0, next), band, avg: meanY };
}

export function useInsightsForecast(): { forecasts: ForecastPoint[]; isLoading: boolean } {
  const { data: deals, isLoading: dl } = useMetricsData();
  const { data: qb, isLoading: ql } = useQuickBooksMetrics();
  const tf = useInsightsTimeframeOptional();

  const forecasts = useMemo<ForecastPoint[]>(() => {
    const now = new Date();
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : now;
    const monthsBack = Math.max(0, Math.min(11, differenceInCalendarMonths(now, anchor)));
    const curIdx = 11 - monthsBack;
    const slice = (arr: number[]) => arr.slice(Math.max(0, curIdx - 5), curIdx + 1);

    const out: ForecastPoint[] = [];
    const qbMonthly = qb?.monthlyRevenue ?? [];
    if (qbMonthly.length) {
      const rev = qbMonthly.map(m => m.revenue);
      const exp = qbMonthly.map(m => m.expenses);
      const pay = qbMonthly.map(m => m.payments);
      const r = linearProjection(slice(rev));
      const e = linearProjection(slice(exp));
      const p = linearProjection(slice(pay));
      out.push({ metricKey: 'qb-revenue', label: 'Revenue', format: 'currency', current: rev[curIdx] ?? 0, trailing3Avg: r.avg, nextProjection: r.next, band: r.band, goodWhen: 'up' });
      out.push({ metricKey: 'qb-expenses', label: 'Expenses', format: 'currency', current: exp[curIdx] ?? 0, trailing3Avg: e.avg, nextProjection: e.next, band: e.band, goodWhen: 'down' });
      out.push({ metricKey: 'qb-payments', label: 'Payments Received', format: 'currency', current: pay[curIdx] ?? 0, trailing3Avg: p.avg, nextProjection: p.next, band: p.band, goodWhen: 'up' });
    }
    const monthly = deals?.monthlyData ?? [];
    if (monthly.length) {
      const cw = monthly.map(m => m.closedWonValue);
      const fees = monthly.map(m => m.totalFees);
      const r = linearProjection(slice(cw));
      const f = linearProjection(slice(fees));
      out.push({ metricKey: 'closed-won-value', label: 'Closed Won Value', format: 'currency', current: cw[curIdx] ?? 0, trailing3Avg: r.avg, nextProjection: r.next, band: r.band, goodWhen: 'up' });
      out.push({ metricKey: 'total-fees', label: 'Total Fees', format: 'currency', current: fees[curIdx] ?? 0, trailing3Avg: f.avg, nextProjection: f.next, band: f.band, goodWhen: 'up' });
    }
    return out;
  }, [deals, qb, tf?.timeframe.end]);

  return { forecasts, isLoading: dl || ql };
}
