import { useMemo } from 'react';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface PeriodDelta {
  key: string;
  label: string;
  /** 'currency' | 'number' | 'percent' */
  format: 'currency' | 'number' | 'percent';
  current: number;
  prevPeriod: number;
  prevYear: number;
  /** Direction where "up" is desirable. */
  goodWhen: 'up' | 'down';
}

export interface DeltaResult extends PeriodDelta {
  changeMoM: number;          // absolute change vs prior month
  pctMoM: number | null;       // null if base = 0
  changeYoY: number;
  pctYoY: number | null;
  directionMoM: DeltaDirection;
  directionYoY: DeltaDirection;
  /** "improvement" | "decline" | "neutral" — accounts for goodWhen polarity. */
  sentimentMoM: 'improvement' | 'decline' | 'neutral';
  sentimentYoY: 'improvement' | 'decline' | 'neutral';
}

export interface TrendAlert {
  id: string;
  level: 'positive' | 'warning' | 'critical';
  metric: string;
  message: string;
}

function pctChange(current: number, base: number): number | null {
  if (!base || base === 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

function direction(current: number, base: number): DeltaDirection {
  if (current > base) return 'up';
  if (current < base) return 'down';
  return 'flat';
}

function sentiment(dir: DeltaDirection, goodWhen: 'up' | 'down'): 'improvement' | 'decline' | 'neutral' {
  if (dir === 'flat') return 'neutral';
  if (goodWhen === 'up') return dir === 'up' ? 'improvement' : 'decline';
  return dir === 'down' ? 'improvement' : 'decline';
}

/**
 * Period-over-period comparison engine for the Insights dashboard.
 * Derives current vs prior month vs same month last year from the rolling
 * 12-month arrays already produced by useMetricsData / useQuickBooksMetrics.
 * Surfaces a list of metric deltas + auto-generated trend alerts.
 */
export function useInsightsComparison() {
  const { data: dealMetrics, isLoading: dealsLoading } = useMetricsData();
  const { data: qbMetrics, isLoading: qbLoading } = useQuickBooksMetrics();

  const result = useMemo(() => {
    const monthly = dealMetrics?.monthlyData ?? [];
    const qbMonthly = qbMetrics?.monthlyRevenue ?? [];

    // Index 11 = current month, 10 = prior month, 0 = same month last year.
    const cur = monthly[11];
    const prev = monthly[10];
    const yoy = monthly[0];
    const qbCur = qbMonthly[11];
    const qbPrev = qbMonthly[10];
    const qbYoy = qbMonthly[0];

    const raw: PeriodDelta[] = [
      {
        key: 'qb-revenue',
        label: 'Revenue',
        format: 'currency',
        current: qbCur?.revenue ?? 0,
        prevPeriod: qbPrev?.revenue ?? 0,
        prevYear: qbYoy?.revenue ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'qb-payments',
        label: 'Payments Received',
        format: 'currency',
        current: qbCur?.payments ?? 0,
        prevPeriod: qbPrev?.payments ?? 0,
        prevYear: qbYoy?.payments ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'qb-expenses',
        label: 'Expenses',
        format: 'currency',
        current: qbCur?.expenses ?? 0,
        prevPeriod: qbPrev?.expenses ?? 0,
        prevYear: qbYoy?.expenses ?? 0,
        goodWhen: 'down',
      },
      {
        key: 'closed-won-value',
        label: 'Closed Won Value',
        format: 'currency',
        current: cur?.closedWonValue ?? 0,
        prevPeriod: prev?.closedWonValue ?? 0,
        prevYear: yoy?.closedWonValue ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'total-fees',
        label: 'Total Fees',
        format: 'currency',
        current: cur?.totalFees ?? 0,
        prevPeriod: prev?.totalFees ?? 0,
        prevYear: yoy?.totalFees ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'deal-count',
        label: 'Deals (period)',
        format: 'number',
        current: cur?.dealCount ?? 0,
        prevPeriod: prev?.dealCount ?? 0,
        prevYear: yoy?.dealCount ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'ar-balance',
        label: 'Accounts Receivable',
        format: 'currency',
        current: qbMetrics?.totalAR ?? 0,
        prevPeriod: qbMetrics?.totalAR ?? 0, // snapshot only — no historical AR
        prevYear: qbMetrics?.totalAR ?? 0,
        goodWhen: 'down',
      },
    ];

    const deltas: DeltaResult[] = raw.map(d => {
      const dirM = direction(d.current, d.prevPeriod);
      const dirY = direction(d.current, d.prevYear);
      return {
        ...d,
        changeMoM: d.current - d.prevPeriod,
        pctMoM: pctChange(d.current, d.prevPeriod),
        changeYoY: d.current - d.prevYear,
        pctYoY: pctChange(d.current, d.prevYear),
        directionMoM: dirM,
        directionYoY: dirY,
        sentimentMoM: sentiment(dirM, d.goodWhen),
        sentimentYoY: sentiment(dirY, d.goodWhen),
      };
    });

    // Trend alerts: >20% improvement = positive, >10% decline = warning, >25% decline = critical.
    const alerts: TrendAlert[] = [];
    for (const d of deltas) {
      if (d.pctMoM == null) continue;
      const abs = Math.abs(d.pctMoM);
      if (d.sentimentMoM === 'improvement' && d.pctMoM !== 0 && abs >= 20) {
        alerts.push({
          id: `${d.key}-up`,
          level: 'positive',
          metric: d.label,
          message: `${d.label} ${d.goodWhen === 'down' ? 'fell' : 'grew'} ${abs.toFixed(0)}% vs. last month`,
        });
      } else if (d.sentimentMoM === 'decline' && abs >= 25) {
        alerts.push({
          id: `${d.key}-crit`,
          level: 'critical',
          metric: d.label,
          message: `${d.label} ${d.goodWhen === 'down' ? 'increased' : 'fell'} ${abs.toFixed(0)}% vs. last month — investigate`,
        });
      } else if (d.sentimentMoM === 'decline' && abs >= 10) {
        alerts.push({
          id: `${d.key}-warn`,
          level: 'warning',
          metric: d.label,
          message: `${d.label} ${d.goodWhen === 'down' ? 'rose' : 'declined'} ${abs.toFixed(0)}% vs. last month`,
        });
      }
    }

    return { deltas, alerts };
  }, [dealMetrics, qbMetrics]);

  return {
    deltas: result.deltas,
    alerts: result.alerts,
    isLoading: dealsLoading || qbLoading,
  };
}

/** Render helper: compact value formatter matching the dashboard style. */
export function formatDeltaValue(value: number, fmt: PeriodDelta['format']): string {
  if (fmt === 'percent') return `${value.toFixed(1)}%`;
  if (fmt === 'number') return value.toLocaleString();
  // currency
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}