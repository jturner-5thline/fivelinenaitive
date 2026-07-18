/**
 * Context that lets Debt Advisory Metrics KPI tiles switch their delta chip
 * between "Variance" (period-over-period, the default) and "Performance to
 * Plan" (actual vs. Master Plan value for the selected period).
 */
import { createContext, useContext } from 'react';

export type ComparisonMode = 'variance' | 'plan';

export interface ComparisonModeContextValue {
  mode: ComparisonMode;
  /** Master Plan values keyed by widget key (see DEBT_ADVISORY_KPI_TO_PLAN). */
  planValues: Map<string, number>;
  /** Human label for the resolved period (e.g. "Q3 2026"). */
  periodLabel: string;
  isPlanLoading: boolean;
}

export const ComparisonModeContext = createContext<ComparisonModeContextValue>({
  mode: 'variance',
  planValues: new Map(),
  periodLabel: '',
  isPlanLoading: false,
});

export function useComparisonMode(): ComparisonModeContextValue {
  return useContext(ComparisonModeContext);
}
