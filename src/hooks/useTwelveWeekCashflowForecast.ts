import { useMemo } from 'react';
import { useCompany } from '@/hooks/useCompany';
import {
  pickForwardWeeks,
  useFinanceWeeklyBalance,
  type ForwardWeekPoint,
} from '@/components/cashflow/financeWeeklyBalance';

export type ForecastWeek = ForwardWeekPoint;

/**
 * /insights "12-Week Cashflow Forecast" data source.
 *
 * This is a thin slice over the canonical Finance weekly balance series — it
 * does NOT compute anything itself. Both Finance and Insights read from
 * `buildFinanceWeeklyBalance`, so the 12 values shown here are guaranteed
 * to match the corresponding "Ending Cash" values in Finance week-for-week.
 */
export function useTwelveWeekCashflowForecast(): {
  weeks: ForecastWeek[];
  isLoading: boolean;
} {
  const { company } = useCompany();
  const { result, isLoading } = useFinanceWeeklyBalance(company?.id);
  const weeks = useMemo(() => pickForwardWeeks(result, 12), [result]);
  return { weeks, isLoading };
}
