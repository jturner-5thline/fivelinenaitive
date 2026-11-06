/**
 * React wrapper around the pure Finance weekly balance builder. The pure
 * logic lives in financeWeeklyBalanceCore.ts so server code (MCP) can reuse it.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useScheduledCashFlows } from './useScheduledCashFlows';
import { useQuickbooksDerivedCashFlows } from './useQuickbooksDerivedCashFlows';
import { useDealCashflowOverrides } from './useDealCashflowOverrides';
import { useDealProjectedCashFlows } from './useDealProjectedCashFlows';
import { useCashInItems } from './useCashInItems';
import type { ScheduledCashFlow } from './scheduledCashFlows';
import type { WeeklyOverrides } from './types';
import {
  buildFinanceWeeklyBalance,
  composeCombinedScheduledItems,
  type FinanceWeeklyBalanceResult,
} from './financeWeeklyBalanceCore';

export * from './financeWeeklyBalanceCore';

/**
 * Convenience hook — fetches all inputs and returns the same weekly series
 * Finance renders. Use this from any surface (e.g. /insights widgets) that
 * needs the canonical weekly balance without duplicating fetch wiring.
 *
 * Finance itself calls the input hooks directly (it needs the raw mutation
 * APIs from `useScheduledCashFlows`/`useCashInItems` for editing) and feeds
 * them into `buildFinanceWeeklyBalance`. The end result is the same map, by
 * construction.
 */
export function useFinanceWeeklyBalance(companyId: string | undefined): {
  result: FinanceWeeklyBalanceResult;
  combinedScheduledItems: ScheduledCashFlow[];
  weeklyOverrides: WeeklyOverrides;
  isLoading: boolean;
} {
  const { items: scheduledItems, isLoading: schedLoading } = useScheduledCashFlows(companyId);
  const { items: qbDerivedItems } = useQuickbooksDerivedCashFlows(!!companyId);
  const { overrides: dealOverrides } = useDealCashflowOverrides(companyId);
  const { items: dealProjectedItems } = useDealProjectedCashFlows(
    companyId,
    !!companyId,
    dealOverrides,
  );
  const { items: cashInDbItems } = useCashInItems();

  const [weeklyOverrides, setWeeklyOverrides] = useState<WeeklyOverrides>({});
  const [overridesLoading, setOverridesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setWeeklyOverrides({});
      setOverridesLoading(false);
      return;
    }
    setOverridesLoading(true);
    (async () => {
      const { data } = await supabase
        .from('cash_flow_imports' as any)
        .select('weekly_overrides')
        .eq('company_id', companyId)
        .maybeSingle();
      if (!active) return;
      const wo = (data as any)?.weekly_overrides;
      setWeeklyOverrides(
        wo && typeof wo === 'object' && !Array.isArray(wo) ? (wo as WeeklyOverrides) : {},
      );
      setOverridesLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [companyId]);

  const combinedScheduledItems = useMemo(
    () =>
      composeCombinedScheduledItems({
        qbDerivedItems,
        dealProjectedItems,
        scheduledItems,
        cashInDbItems,
        companyId,
      }),
    [qbDerivedItems, dealProjectedItems, scheduledItems, cashInDbItems, companyId],
  );

  const result = useMemo(
    () => buildFinanceWeeklyBalance({ combinedScheduledItems, weeklyOverrides }),
    [combinedScheduledItems, weeklyOverrides],
  );

  return {
    result,
    combinedScheduledItems,
    weeklyOverrides,
    isLoading: schedLoading || overridesLoading,
  };
}
