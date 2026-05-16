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
 * Default Q1–Q4 plan targets for 2026 (sourced from the Rep Performance &
 * Pipeline Model sheet). Values are stored in raw units (USD for currency).
 */
export const NIKI_DEFAULT_PLAN_2026: Record<PlanMetricKey, QuarterlyTargets> = {
  // Plan
  dealsOnBoard:          { Q1: 33,        Q2: 33,        Q3: 33,        Q4: 33 },
  dollarsOnBoard:        { Q1: 90.9 * MM, Q2: 90.9 * MM, Q3: 90.9 * MM, Q4: 151.5 * MM },
  proposalsIssued:       { Q1: 21,        Q2: 21,        Q3: 21,        Q4: 21 },
  dollarsProposed:       { Q1: 60 * MM,   Q2: 60 * MM,   Q3: 60 * MM,   Q4: 80 * MM },
  clientsSigned:         { Q1: 11,        Q2: 12,        Q3: 12,        Q4: 12 },
  dollarsSigned:         { Q1: 32 * MM,   Q2: 36 * MM,   Q3: 36 * MM,   Q4: 36 * MM },
  clientsReceivingTerms: { Q1: 12,        Q2: 11,        Q3: 12,        Q4: 12 },
  termsSigned:           { Q1: 12,        Q2: 11,        Q3: 12,        Q4: 12 },
  volumeTermsSigned:     { Q1: 30 * MM,   Q2: 27.4 * MM, Q3: 36 * MM,   Q4: 36 * MM },
  dealsClosed:           { Q1: 6,         Q2: 12,        Q3: 11,        Q4: 12 },
  dollarsFunded:         { Q1: 24 * MM,   Q2: 31.4 * MM, Q3: 32 * MM,   Q4: 36 * MM },
  // Pipeline Snapshot — stock measures, default 0 until user sets a target
  dealsInDevelopment:    { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
  dollarsInDevelopment:  { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
  activeDeals:           { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
  activeDealVolume:      { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
  dealsInDiligence:      { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
  dollarsInDiligence:    { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
  // Revenue (from Rep Performance sheet, Q-2026 columns)
  retainerRevenue:             { Q1: 36.3 * K,  Q2: 43.5 * K,  Q3: 43.5 * K,  Q4: 43.5 * K },
  consultingMilestoneRevenue:  { Q1: 158.7 * K, Q2: 134.0 * K, Q3: 158.7 * K, Q4: 158.7 * K },
  feeRevenue:                  { Q1: 600 * K,   Q2: 755 * K,   Q3: 770 * K,   Q4: 870 * K },
  totalRevenue:                { Q1: 790 * K,   Q2: 930 * K,   Q3: 970 * K,   Q4: 1070 * K },
};

function resolveTotals(
  plan: Record<PlanMetricKey, QuarterlyTargets>,
): Record<PlanMetricKey, ResolvedTargets> {
  const out = {} as Record<PlanMetricKey, ResolvedTargets>;
  for (const m of PLAN_METRICS) {
    const q = plan[m.key] ?? NIKI_DEFAULT_PLAN_2026[m.key];
    out[m.key] = { ...q, total: q.Q1 + q.Q2 + q.Q3 + q.Q4 };
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
  const storageKey = user?.id ? `nikiPerf.plan.${user.id}` : 'nikiPerf.plan.anon';
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