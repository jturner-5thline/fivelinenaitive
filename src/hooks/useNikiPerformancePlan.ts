import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { MetricRowKey, QuarterKey } from '@/hooks/useNikiPerformanceMetrics';

/**
 * Quarter-driven Performance Plan for Niki Heikali — 2026.
 *
 * The edit grid is the source of truth for quarterly targets. The 2026 total
 * column is always derived as Q1+Q2+Q3+Q4. Stored per-user in localStorage so
 * each user can tune their own targets without affecting other users.
 *
 * Schema: normalized as `plan[metric_key][quarter] = target_value`.
 */

const MM = 1_000_000;
const K = 1_000;

// All plan-only keys (no actuals tracked yet in the scorecard)
export type PipelineSnapshotKey =
  | 'dealsInDevelopment'
  | 'dollarsInDevelopment'
  | 'activeDeals'
  | 'activeDealVolume'
  | 'dealsInDiligence'
  | 'dollarsInDiligence';

export type RevenueKey =
  | 'retainerRevenue'
  | 'consultingMilestoneRevenue'
  | 'feeRevenue'
  | 'totalRevenue';

export type PlanMetricKey = MetricRowKey | PipelineSnapshotKey | RevenueKey;

export type QuarterlyTargets = Record<QuarterKey, number>;
export type ResolvedTargets = QuarterlyTargets & { total: number };

export interface PlanMetricDef {
  key: PlanMetricKey;
  label: string;
  unit: 'count' | 'currency';
}

export interface PlanSectionDef {
  title: string;
  metrics: PlanMetricDef[];
}

export const PLAN_SECTIONS: PlanSectionDef[] = [
  {
    title: 'Plan',
    metrics: [
      { key: 'dealsOnBoard',          label: 'Deals on Board',          unit: 'count' },
      { key: 'dollarsOnBoard',        label: 'Dollars on Board',        unit: 'currency' },
      { key: 'proposalsIssued',       label: 'Proposals Issued #',      unit: 'count' },
      { key: 'dollarsProposed',       label: 'Dollars Proposed',        unit: 'currency' },
      { key: 'clientsSigned',         label: 'Clients Signed',          unit: 'count' },
      { key: 'dollarsSigned',         label: 'Dollars Signed',          unit: 'currency' },
      { key: 'clientsReceivingTerms', label: 'Clients Receiving Terms', unit: 'count' },
      { key: 'termsSigned',           label: 'Terms Signed',            unit: 'count' },
      { key: 'volumeTermsSigned',     label: 'Volume of Terms Signed',  unit: 'currency' },
      { key: 'dealsClosed',           label: 'Deals Closed',            unit: 'count' },
      { key: 'dollarsFunded',         label: 'Dollars Funded',          unit: 'currency' },
    ],
  },
  {
    title: 'Pipeline Snapshot',
    metrics: [
      { key: 'dealsInDevelopment',   label: 'Deals In Development',  unit: 'count' },
      { key: 'dollarsInDevelopment', label: 'Dollars in Development', unit: 'currency' },
      { key: 'activeDeals',          label: 'Active Deals',           unit: 'count' },
      { key: 'activeDealVolume',     label: 'Active Deal Volume',     unit: 'currency' },
      { key: 'dealsInDiligence',     label: 'Deals in Diligence',     unit: 'count' },
      { key: 'dollarsInDiligence',   label: 'Dollars in Diligence',   unit: 'currency' },
    ],
  },
  {
    title: 'Revenue',
    metrics: [
      { key: 'retainerRevenue',            label: 'Retainer Revenue',              unit: 'currency' },
      { key: 'consultingMilestoneRevenue', label: 'Consulting / Milestone Revenue', unit: 'currency' },
      { key: 'feeRevenue',                 label: 'Fee Revenue',                   unit: 'currency' },
      { key: 'totalRevenue',               label: 'Total Revenue',                 unit: 'currency' },
    ],
  },
];

export const PLAN_METRICS: PlanMetricDef[] = PLAN_SECTIONS.flatMap((s) => s.metrics);

export const PLAN_METRIC_LABELS: Record<PlanMetricKey, string> = PLAN_METRICS.reduce(
  (acc, m) => { acc[m.key] = m.label; return acc; },
  {} as Record<PlanMetricKey, string>,
);

export const PLAN_METRIC_UNITS: Record<PlanMetricKey, 'count' | 'currency'> = PLAN_METRICS.reduce(
  (acc, m) => { acc[m.key] = m.unit; return acc; },
  {} as Record<PlanMetricKey, 'count' | 'currency'>,
);

/**
 * Default Q1–Q4 plan targets for 2026 (sourced from the approved Niki
 * Rep Performance & Pipeline Model sheet). Values are stored in raw units
 * (USD for currency).
 */
export const NIKI_DEFAULT_PLAN_2026: Record<PlanMetricKey, QuarterlyTargets> = {
  // Plan
  dealsOnBoard:          { Q1: 9,         Q2: 9,         Q3: 9,         Q4: 9 },
  dollarsOnBoard:        { Q1: 54.5 * MM, Q2: 54.5 * MM, Q3: 54.5 * MM, Q4: 54.5 * MM },
  proposalsIssued:       { Q1: 6,         Q2: 6,         Q3: 6,         Q4: 6 },
  dollarsProposed:       { Q1: 36 * MM,   Q2: 36 * MM,   Q3: 36 * MM,   Q4: 36 * MM },
  clientsSigned:         { Q1: 3,         Q2: 3,         Q3: 3,         Q4: 3 },
  dollarsSigned:         { Q1: 8 * MM,    Q2: 8 * MM,    Q3: 8 * MM,    Q4: 8 * MM },
  clientsReceivingTerms: { Q1: 3,         Q2: 3,         Q3: 3,         Q4: 3 },
  termsSigned:           { Q1: 3,         Q2: 3,         Q3: 3,         Q4: 3 },
  volumeTermsSigned:     { Q1: 12 * MM,   Q2: 13.4 * MM, Q3: 18 * MM,   Q4: 18 * MM },
  dealsClosed:           { Q1: 3,         Q2: 3,         Q3: 3,         Q4: 3 },
  dollarsFunded:         { Q1: 12 * MM,   Q2: 13.4 * MM, Q3: 18 * MM,   Q4: 18 * MM },
  // Pipeline Snapshot — stock measures (end-of-quarter snapshot, not a flow)
  dealsInDevelopment:    { Q1: 16,           Q2: 22,           Q3: 28,           Q4: 34 },
  dollarsInDevelopment:  { Q1: 162.9 * MM,   Q2: 172.1 * MM,   Q3: 181.4 * MM,   Q4: 190.7 * MM },
  activeDeals:           { Q1: 5,            Q2: 3,            Q3: 0,            Q4: -3 },
  activeDealVolume:      { Q1: 48 * MM,      Q2: 40.6 * MM,    Q3: 40.6 * MM,    Q4: 40.6 * MM },
  dealsInDiligence:      { Q1: 4,            Q2: 4,            Q3: 4,            Q4: 4 },
  dollarsInDiligence:    { Q1: 25.9 * MM,    Q2: 25.9 * MM,    Q3: 25.9 * MM,    Q4: 25.9 * MM },
  // Revenue (raw USD; from Rep Performance sheet, Q-2026 columns)
  retainerRevenue:             { Q1: 21_750,  Q2: 21_750,  Q3: 21_750,  Q4: 21_750 },
  consultingMilestoneRevenue:  { Q1: 54_450,  Q2: 54_450,  Q3: 54_450,  Q4: 54_450 },
  feeRevenue:                  { Q1: 300_000, Q2: 335_000, Q3: 450_000, Q4: 450_000 },
  totalRevenue:                { Q1: 376_200, Q2: 411_200, Q3: 526_200, Q4: 526_200 },
};

/**
 * 2026 annual totals that are NOT a simple Q1+Q2+Q3+Q4 sum. These come
 * straight from the approved plan sheet — typically because the metric is
 * either a stock (pipeline snapshot, latest = year value) or because the
 * sheet caps the annual total independently of the quarterly cadence.
 */
export const NIKI_DEFAULT_PLAN_TOTAL_OVERRIDES_2026: Partial<Record<PlanMetricKey, number>> = {
  // Flow totals from the sheet that differ from raw sum
  dollarsOnBoard: 218.2 * MM,
  dollarsSigned:  8 * MM,
  // Pipeline Snapshot — stock measures: the 2026 column reflects the
  // end-of-year snapshot (Q4), not a sum of quarterly snapshots.
  dealsInDevelopment:   34,
  dollarsInDevelopment: 190.7 * MM,
  activeDeals:          -3,
  activeDealVolume:     40.6 * MM,
  dealsInDiligence:     4,
  dollarsInDiligence:   25.9 * MM,
};

function resolveTotals(
  plan: Record<PlanMetricKey, QuarterlyTargets>,
): Record<PlanMetricKey, ResolvedTargets> {
  const out = {} as Record<PlanMetricKey, ResolvedTargets>;
  for (const m of PLAN_METRICS) {
    const q = plan[m.key] ?? NIKI_DEFAULT_PLAN_2026[m.key];
    const override = NIKI_DEFAULT_PLAN_TOTAL_OVERRIDES_2026[m.key];
    out[m.key] = {
      ...q,
      total: override !== undefined ? override : q.Q1 + q.Q2 + q.Q3 + q.Q4,
    };
  }
  return out;
}

export interface UseNikiPerformancePlan {
  /** Resolved plan: per-metric quarterly targets + derived 2026 total. */
  plan: Record<PlanMetricKey, ResolvedTargets>;
  /** Raw editable per-quarter targets (no derived total). */
  rawPlan: Record<PlanMetricKey, QuarterlyTargets>;
  /** True once user-specific overrides have been loaded from storage. */
  isLoaded: boolean;
  /** Update a single quarter target. */
  setTarget: (key: PlanMetricKey, q: QuarterKey, value: number) => void;
  /** Reset to the sheet defaults. */
  resetAll: () => void;
}

function useNikiPerformancePlanState(): UseNikiPerformancePlan {
  const { user } = useAuth();
  // v2 — reseeds prior incorrect quarterly defaults with the approved sheet.
  const storageKey = user?.id ? `nikiPerf.plan.v2.${user.id}` : 'nikiPerf.plan.v2.anon';
  const [rawPlan, setRawPlan] = useState<Record<PlanMetricKey, QuarterlyTargets>>(
    () => structuredCloneDefault(),
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<PlanMetricKey, Partial<QuarterlyTargets>>>;
        const next = structuredCloneDefault();
        for (const m of PLAN_METRICS) {
          const saved = parsed[m.key];
          if (saved) {
            next[m.key] = {
              Q1: Number.isFinite(saved.Q1) ? Number(saved.Q1) : next[m.key].Q1,
              Q2: Number.isFinite(saved.Q2) ? Number(saved.Q2) : next[m.key].Q2,
              Q3: Number.isFinite(saved.Q3) ? Number(saved.Q3) : next[m.key].Q3,
              Q4: Number.isFinite(saved.Q4) ? Number(saved.Q4) : next[m.key].Q4,
            };
          }
        }
        setRawPlan(next);
      } else {
        setRawPlan(structuredCloneDefault());
      }
    } catch {
      setRawPlan(structuredCloneDefault());
    }
    setIsLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rawPlan));
    } catch {}
  }, [isLoaded, storageKey, rawPlan]);

  const setTarget = useCallback((key: PlanMetricKey, q: QuarterKey, value: number) => {
    setRawPlan((prev) => ({
      ...prev,
      [key]: { ...prev[key], [q]: Number.isFinite(value) ? value : 0 },
    }));
  }, []);

  const resetAll = useCallback(() => {
    setRawPlan(structuredCloneDefault());
  }, []);

  const plan = useMemo(() => resolveTotals(rawPlan), [rawPlan]);

  return { plan, rawPlan, isLoaded, setTarget, resetAll };
}

const NikiPerformancePlanContext = createContext<UseNikiPerformancePlan | null>(null);

export function NikiPerformancePlanProvider({ children }: { children: ReactNode }) {
  const value = useNikiPerformancePlanState();
  return createElement(NikiPerformancePlanContext.Provider, { value }, children);
}

export function useNikiPerformancePlan(): UseNikiPerformancePlan {
  const ctx = useContext(NikiPerformancePlanContext);
  if (!ctx) {
    // Static fallback when used outside a provider — returns sheet defaults.
    const raw = structuredCloneDefault();
    return {
      plan: resolveTotals(raw),
      rawPlan: raw,
      isLoaded: true,
      setTarget: () => {},
      resetAll: () => {},
    };
  }
  return ctx;
}

function structuredCloneDefault(): Record<PlanMetricKey, QuarterlyTargets> {
  const out = {} as Record<PlanMetricKey, QuarterlyTargets>;
  for (const m of PLAN_METRICS) {
    const d = NIKI_DEFAULT_PLAN_2026[m.key];
    out[m.key] = { Q1: d.Q1, Q2: d.Q2, Q3: d.Q3, Q4: d.Q4 };
  }
  return out;
}