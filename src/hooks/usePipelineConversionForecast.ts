import { useMemo, useState, useCallback } from 'react';
import { useNikiPerformanceMetrics, NIKI_QUARTERS, type MetricRow, type MetricRowKey, type QuarterKey } from '@/hooks/useNikiPerformanceMetrics';
import { useNikiPerformancePlan } from '@/hooks/useNikiPerformancePlan';

export type ForecastStage =
  | 'deals_on_board'
  | 'proposals_issued'
  | 'clients_signed'
  | 'clients_receiving_terms'
  | 'terms_signed'
  | 'deals_closed';

export interface PipelineForecastTransition {
  id: string;
  fromStage: Exclude<ForecastStage, 'deals_closed'>;
  toStage: Exclude<ForecastStage, 'deals_on_board'>;
  /** 0..1 */
  conversionRate: number;
  /** Months to traverse this transition. */
  timelineMonths: number;
}

export interface PipelineForecastMonth {
  month: string; // YYYY-MM
  monthLabel: string;
  dealsOnBoard: number;
  proposalsIssued: number;
  clientsSigned: number;
  clientsReceivingTerms: number;
  termsSigned: number;
  dealsClosed: number;
  pipelineDollars: number;
  signedDollars: number;
  fundedDollars: number;
  projectedRevenue: number;
  planRevenue?: number;
  planPipelineDollars?: number;
  planDealsClosed?: number;
}

export const FORECAST_STAGE_LABELS: Record<ForecastStage, string> = {
  deals_on_board: 'Deals on the Board',
  proposals_issued: 'Proposals Issued',
  clients_signed: 'Clients Signed',
  clients_receiving_terms: 'Clients Receiving Terms',
  terms_signed: 'Terms Signed',
  deals_closed: 'Deals Closed',
};

export const DEFAULT_FORECAST_TRANSITIONS: PipelineForecastTransition[] = [
  { id: 't1', fromStage: 'deals_on_board', toStage: 'proposals_issued', conversionRate: 0.5, timelineMonths: 2 },
  { id: 't2', fromStage: 'proposals_issued', toStage: 'clients_signed', conversionRate: 0.4, timelineMonths: 1 },
  { id: 't3', fromStage: 'clients_signed', toStage: 'clients_receiving_terms', conversionRate: 0.8, timelineMonths: 1 },
  { id: 't4', fromStage: 'clients_receiving_terms', toStage: 'terms_signed', conversionRate: 0.75, timelineMonths: 1 },
  { id: 't5', fromStage: 'terms_signed', toStage: 'deals_closed', conversionRate: 0.9, timelineMonths: 2 },
];

const STAGE_TO_METRIC_KEY: Record<ForecastStage, MetricRowKey> = {
  deals_on_board: 'dealsOnBoard',
  proposals_issued: 'proposalsIssued',
  clients_signed: 'clientsSigned',
  clients_receiving_terms: 'clientsReceivingTerms',
  terms_signed: 'termsSigned',
  deals_closed: 'dealsClosed',
};

const STAGE_TO_DOLLAR_KEY: Partial<Record<ForecastStage, MetricRowKey>> = {
  deals_on_board: 'dollarsOnBoard',
  proposals_issued: 'dollarsProposed',
  clients_signed: 'dollarsSigned',
  terms_signed: 'volumeTermsSigned',
  deals_closed: 'dollarsFunded',
};

function currentQuarter(): QuarterKey {
  const m = new Date().getMonth();
  if (m <= 2) return 'Q1';
  if (m <= 5) return 'Q2';
  if (m <= 8) return 'Q3';
  return 'Q4';
}

function quarterForMonth(monthIndex0: number): QuarterKey {
  if (monthIndex0 <= 2) return 'Q1';
  if (monthIndex0 <= 5) return 'Q2';
  if (monthIndex0 <= 8) return 'Q3';
  return 'Q4';
}

export interface UsePipelineConversionForecast {
  transitions: PipelineForecastTransition[];
  setTransition: (id: string, patch: Partial<Pick<PipelineForecastTransition, 'conversionRate' | 'timelineMonths'>>) => void;
  reset: () => void;
  months: PipelineForecastMonth[];
  /** Baseline projection using DEFAULT_FORECAST_TRANSITIONS (unedited model). */
  baselineMonths: PipelineForecastMonth[];
  /** Aggregated per-transition forecasted volumes used in assumptions table. */
  transitionStats: Record<string, { avgExitVolume: number; avgEntryVolume: number; avgExitDollars: number }>;
  /** Avg deal $ per stage inferred from current actuals. */
  avgDollarsPerDeal: Record<ForecastStage, number>;
  baselineMonthlyInflow: number;
}

const HORIZON = 9;

export function usePipelineConversionForecast(): UsePipelineConversionForecast {
  const { rows } = useNikiPerformanceMetrics();
  const { plan } = useNikiPerformancePlan();

  const [transitions, setTransitions] = useState<PipelineForecastTransition[]>(DEFAULT_FORECAST_TRANSITIONS);

  const setTransition: UsePipelineConversionForecast['setTransition'] = useCallback((id, patch) => {
    setTransitions(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const reset = useCallback(() => setTransitions(DEFAULT_FORECAST_TRANSITIONS), []);

  const byKey = useMemo(() => {
    const m = new Map<MetricRowKey, MetricRow>();
    rows.forEach(r => m.set(r.key, r));
    return m;
  }, [rows]);

  const avgDollarsPerDeal = useMemo(() => {
    const out = {} as Record<ForecastStage, number>;
    (Object.keys(STAGE_TO_METRIC_KEY) as ForecastStage[]).forEach(s => {
      const countRow = byKey.get(STAGE_TO_METRIC_KEY[s]);
      const dollarKey = STAGE_TO_DOLLAR_KEY[s];
      const dollarRow = dollarKey ? byKey.get(dollarKey) : undefined;
      const c = countRow?.yearTotal ?? 0;
      const d = dollarRow?.yearTotal ?? 0;
      out[s] = c > 0 ? d / c : 0;
    });
    return out;
  }, [byKey]);

  const computeProjection = (txs: PipelineForecastTransition[]) => {
    const now = new Date();
    // Initial in-flight population at each stage = current-quarter actuals so far
    const cq = currentQuarter();
    const initialPop: Record<ForecastStage, number> = {
      deals_on_board: byKey.get('dealsOnBoard')?.byQuarter[cq].value ?? 0,
      proposals_issued: byKey.get('proposalsIssued')?.byQuarter[cq].value ?? 0,
      clients_signed: byKey.get('clientsSigned')?.byQuarter[cq].value ?? 0,
      clients_receiving_terms: byKey.get('clientsReceivingTerms')?.byQuarter[cq].value ?? 0,
      terms_signed: byKey.get('termsSigned')?.byQuarter[cq].value ?? 0,
      deals_closed: 0,
    };
    // Baseline monthly inflow into top of funnel = trailing quarter avg
    const baselineMonthlyInflow = Math.max(0, (byKey.get('dealsOnBoard')?.byQuarter[cq].value ?? 0) / 3);

    // Population evolves month-by-month. Per month, fraction moved out = conversionRate/timelineMonths.
    let pop = { ...initialPop };
    const monthsOut: PipelineForecastMonth[] = [];
    const stats: Record<string, { exit: number[]; entry: number[]; exitDollars: number[] }> = {};
    txs.forEach(t => { stats[t.id] = { exit: [], entry: [], exitDollars: [] }; });

    for (let i = 0; i < HORIZON; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const monthIdx = date.getMonth();
      const yyyymm = `${date.getFullYear()}-${String(monthIdx + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });

      // New inflow to top stage
      pop.deals_on_board += baselineMonthlyInflow;

      // Compute monthly movements
      const movements: Record<string, number> = {};
      txs.forEach(t => {
        const months = Math.max(0.25, t.timelineMonths);
        const monthlyFrac = Math.min(1, Math.max(0, t.conversionRate) / months);
        const moved = pop[t.fromStage] * monthlyFrac;
        movements[t.id] = moved;
      });
      txs.forEach(t => {
        const moved = movements[t.id];
        pop[t.fromStage] -= moved;
        pop[t.toStage] += moved;
        stats[t.id].exit.push(moved);
        stats[t.id].entry.push(moved);
        stats[t.id].exitDollars.push(moved * (avgDollarsPerDeal[t.fromStage] || 0));
      });

      // Snapshot
      const pipelineDollars = pop.deals_on_board * (avgDollarsPerDeal.deals_on_board || 0);
      const signedDollars = pop.clients_signed * (avgDollarsPerDeal.clients_signed || 0);
      // Deals closed accumulates; per-month delta funded is what arrived this month
      const dealsClosedThisMonth = movements[txs.find(t => t.toStage === 'deals_closed')?.id ?? ''] ?? 0;
      const fundedDollars = dealsClosedThisMonth * (avgDollarsPerDeal.deals_closed || 0);

      // Project revenue using current rep total revenue / funded ratio
      const totalRev = byKey.get('totalRevenue')?.yearTotal ?? 0;
      const totalFunded = byKey.get('dollarsFunded')?.yearTotal ?? 0;
      const revRatio = totalFunded > 0 ? totalRev / totalFunded : 0.05;
      const projectedRevenue = fundedDollars * revRatio;

      // Plan distribution: take current quarter plan and split per month
      const q = quarterForMonth(monthIdx);
      const planRevenue = (plan.totalRevenue?.[q] ?? 0) / 3;
      const planPipelineDollars = (plan.dollarsOnBoard?.[q] ?? 0) / 3;
      const planDealsClosed = (plan.dealsClosed?.[q] ?? 0) / 3;

      monthsOut.push({
        month: yyyymm,
        monthLabel: label,
        dealsOnBoard: pop.deals_on_board,
        proposalsIssued: pop.proposals_issued,
        clientsSigned: pop.clients_signed,
        clientsReceivingTerms: pop.clients_receiving_terms,
        termsSigned: pop.terms_signed,
        dealsClosed: dealsClosedThisMonth,
        pipelineDollars,
        signedDollars,
        fundedDollars,
        projectedRevenue,
        planRevenue,
        planPipelineDollars,
        planDealsClosed,
      });
    }

    const transitionStats: UsePipelineConversionForecast['transitionStats'] = {};
    Object.entries(stats).forEach(([id, s]) => {
      const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      transitionStats[id] = {
        avgExitVolume: avg(s.exit),
        avgEntryVolume: avg(s.entry),
        avgExitDollars: avg(s.exitDollars),
      };
    });

    return { months: monthsOut, transitionStats, baselineMonthlyInflow };
  };

  const { months, transitionStats, baselineMonthlyInflow } = useMemo(
    () => computeProjection(transitions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transitions, byKey, plan, avgDollarsPerDeal],
  );

  const baselineMonths = useMemo(
    () => computeProjection(DEFAULT_FORECAST_TRANSITIONS).months,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byKey, plan, avgDollarsPerDeal],
  );

  // suppress unused
  void NIKI_QUARTERS;

  return { transitions, setTransition, reset, months, baselineMonths, transitionStats, avgDollarsPerDeal, baselineMonthlyInflow };
}