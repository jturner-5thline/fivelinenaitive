import { useMemo } from 'react';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useHubSpotMetrics } from '@/hooks/useHubSpotMetrics';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { useInsightsAlertConfig, DEFAULT_ALERT_CONFIG } from '@/hooks/useInsightsAlertConfig';
import { differenceInCalendarMonths, subMonths, format as fmt, startOfMonth, endOfMonth, parseISO } from 'date-fns';

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
  /** Optional grouping label for UI segmentation. */
  group?: 'Financials' | 'Pipeline' | 'FinServ' | 'HubSpot' | 'Lenders';
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
  const { data: hsMetrics, isLoading: hsLoading } = useHubSpotMetrics();
  const tf = useInsightsTimeframeOptional();
  const { config: alertConfig } = useInsightsAlertConfig();

  const result = useMemo(() => {
    const monthly = dealMetrics?.monthlyData ?? [];
    const qbMonthly = qbMetrics?.monthlyRevenue ?? [];
    const hsMonthly = hsMetrics?.dealValueTrend ?? [];

    // Anchor "current" month from the active Insights timeframe (uses end date).
    // monthly arrays are ordered oldest -> newest with index 11 = current month.
    const now = new Date();
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : now;
    const monthsBack = Math.max(0, Math.min(11, differenceInCalendarMonths(now, anchor)));
    const curIdx = 11 - monthsBack;
    const prevIdx = curIdx - 1;
    const yoyIdx = curIdx - 12; // out-of-window when not -12 worth of data

    const pick = <T,>(arr: T[], i: number): T | undefined => (i >= 0 && i < arr.length ? arr[i] : undefined);

    const cur = pick(monthly, curIdx);
    const prev = pick(monthly, prevIdx);
    const yoy = pick(monthly, yoyIdx) ?? pick(monthly, 0);
    const qbCur = pick(qbMonthly, curIdx);
    const qbPrev = pick(qbMonthly, prevIdx);
    const qbYoy = pick(qbMonthly, yoyIdx) ?? pick(qbMonthly, 0);
    const hsCur = pick(hsMonthly, curIdx);
    const hsPrev = pick(hsMonthly, prevIdx);
    const hsYoy = pick(hsMonthly, yoyIdx) ?? pick(hsMonthly, 0);

    const raw: PeriodDelta[] = [
      {
        key: 'qb-revenue',
        label: 'Revenue',
        format: 'currency',
        group: 'Financials',
        current: qbCur?.revenue ?? 0,
        prevPeriod: qbPrev?.revenue ?? 0,
        prevYear: qbYoy?.revenue ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'qb-payments',
        label: 'Payments Received',
        format: 'currency',
        group: 'Financials',
        current: qbCur?.payments ?? 0,
        prevPeriod: qbPrev?.payments ?? 0,
        prevYear: qbYoy?.payments ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'qb-expenses',
        label: 'Expenses',
        format: 'currency',
        group: 'Financials',
        current: qbCur?.expenses ?? 0,
        prevPeriod: qbPrev?.expenses ?? 0,
        prevYear: qbYoy?.expenses ?? 0,
        goodWhen: 'down',
      },
      {
        key: 'closed-won-value',
        label: 'Closed Won Value',
        format: 'currency',
        group: 'Pipeline',
        current: cur?.closedWonValue ?? 0,
        prevPeriod: prev?.closedWonValue ?? 0,
        prevYear: yoy?.closedWonValue ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'total-fees',
        label: 'Total Fees',
        format: 'currency',
        group: 'Pipeline',
        current: cur?.totalFees ?? 0,
        prevPeriod: prev?.totalFees ?? 0,
        prevYear: yoy?.totalFees ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'deal-count',
        label: 'Deals (period)',
        format: 'number',
        group: 'Pipeline',
        current: cur?.dealCount ?? 0,
        prevPeriod: prev?.dealCount ?? 0,
        prevYear: yoy?.dealCount ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'ar-balance',
        label: 'Accounts Receivable',
        format: 'currency',
        group: 'Financials',
        current: qbMetrics?.totalAR ?? 0,
        prevPeriod: qbMetrics?.totalAR ?? 0, // snapshot only — no historical AR
        prevYear: qbMetrics?.totalAR ?? 0,
        goodWhen: 'down',
      },
      // HubSpot pipeline activity (created in period)
      {
        key: 'hs-deal-value',
        label: 'HubSpot Deal Value (created)',
        format: 'currency',
        group: 'HubSpot',
        current: hsCur?.value ?? 0,
        prevPeriod: hsPrev?.value ?? 0,
        prevYear: hsYoy?.value ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'hs-deal-count',
        label: 'HubSpot Deals (created)',
        format: 'number',
        group: 'HubSpot',
        current: hsCur?.count ?? 0,
        prevPeriod: hsPrev?.count ?? 0,
        prevYear: hsYoy?.count ?? 0,
        goodWhen: 'up',
      },
      // Snapshot-only: HubSpot pipeline + win rate
      {
        key: 'hs-pipeline-value',
        label: 'HubSpot Open Pipeline',
        format: 'currency',
        group: 'HubSpot',
        current: hsMetrics?.totalDealValue ?? 0,
        prevPeriod: hsMetrics?.totalDealValue ?? 0,
        prevYear: hsMetrics?.totalDealValue ?? 0,
        goodWhen: 'up',
      },
      {
        key: 'hs-win-rate',
        label: 'HubSpot Win Rate',
        format: 'percent',
        group: 'HubSpot',
        current: hsMetrics?.winRate ?? 0,
        prevPeriod: hsMetrics?.winRate ?? 0,
        prevYear: hsMetrics?.winRate ?? 0,
        goodWhen: 'up',
      },
    ];

    const disabledSet = new Set(alertConfig.disabledMetrics);
    const allDeltas: DeltaResult[] = raw.map(d => {
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
    const deltas = allDeltas.filter(d => !disabledSet.has(d.key));

    // Trend alerts: thresholds are user-configurable (see useInsightsAlertConfig).
    const { positiveThreshold, warningThreshold, criticalThreshold } = alertConfig;
    const alerts: TrendAlert[] = [];
    for (const d of deltas) {
      if (d.pctMoM == null) continue;
      const abs = Math.abs(d.pctMoM);
      if (d.sentimentMoM === 'improvement' && d.pctMoM !== 0 && abs >= positiveThreshold) {
        alerts.push({
          id: `${d.key}-up`,
          level: 'positive',
          metric: d.label,
          message: `${d.label} ${d.goodWhen === 'down' ? 'fell' : 'grew'} ${abs.toFixed(0)}% vs. last month`,
        });
      } else if (d.sentimentMoM === 'decline' && abs >= criticalThreshold) {
        alerts.push({
          id: `${d.key}-crit`,
          level: 'critical',
          metric: d.label,
          message: `${d.label} ${d.goodWhen === 'down' ? 'increased' : 'fell'} ${abs.toFixed(0)}% vs. last month — investigate`,
        });
      } else if (d.sentimentMoM === 'decline' && abs >= warningThreshold) {
        alerts.push({
          id: `${d.key}-warn`,
          level: 'warning',
          metric: d.label,
          message: `${d.label} ${d.goodWhen === 'down' ? 'rose' : 'declined'} ${abs.toFixed(0)}% vs. last month`,
        });
      }
    }

    return { deltas, alerts, allDeltas };
  }, [dealMetrics, qbMetrics, hsMetrics, tf?.timeframe.end, alertConfig]);

  return {
    deltas: result.deltas,
    alerts: result.alerts,
    /** All available metrics (incl. disabled) — useful for settings UIs. */
    allMetrics: result.allDeltas.map(d => ({ key: d.key, label: d.label, group: d.group })),
    isLoading: dealsLoading || qbLoading || hsLoading,
    /** Stable key for the active period — used to keep persisted summaries scoped. */
    periodKey: tf?.timeframe.id === 'custom'
      ? `custom:${tf?.timeframe.start}_${tf?.timeframe.end}`
      : (tf?.timeframe.id ?? 'mtd'),
    periodLabel: tf?.timeframe.label ?? 'Current period',
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