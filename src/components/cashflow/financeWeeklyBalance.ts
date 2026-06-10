/**
 * Single source of truth for the Finance > Cash Flow weekly balance series.
 *
 * Both Finance (CashFlowManager) and the /insights "12-Week Cashflow Forecast"
 * widget consume this. The shape of `weeklyWithScheduled` is the same WeeklyData
 * map Finance renders in its weekly grid: `ENDING CASH` per Saturday-start /
 * Friday-end week, after the historical seed + override replay and the
 * `mergeScheduledIntoWeekly` roll-forward.
 *
 * Keep this pure (no hooks, no IO) so it can be reused, unit-tested, and called
 * from anywhere with the canonical inputs. The `useFinanceWeeklyBalance` hook
 * below is the convenience wrapper that fetches the inputs and pipes them in.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useScheduledCashFlows } from './useScheduledCashFlows';
import { useQuickbooksDerivedCashFlows } from './useQuickbooksDerivedCashFlows';
import { useDealCashflowOverrides } from './useDealCashflowOverrides';
import { useDealProjectedCashFlows } from './useDealProjectedCashFlows';
import { useCashInItems, type CashInDbItem } from './useCashInItems';
import { WEEKLY_HISTORICAL_SEED, LAST_HISTORICAL_WEEK_ENDING } from './weeklyHistoricalSeed';
import { mergeScheduledIntoWeekly, type ScheduledCashFlow } from './scheduledCashFlows';
import type { WeeklyData, WeeklyOverrides } from './types';

function parseISO(s: string): Date {
  return new Date(s + 'T00:00:00');
}
function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Default horizon used by Finance (extended further if scheduled entries reach beyond). */
const DEFAULT_HORIZON_END = '2026-12-25';

export interface FinanceWeeklyBalanceInputs {
  combinedScheduledItems: ScheduledCashFlow[];
  weeklyOverrides: WeeklyOverrides;
}

export interface FinanceWeeklyBalanceResult {
  /** Historical-seed + forward grid BEFORE the scheduled merge. */
  rawWeekly: WeeklyData;
  /** Final unfiltered weekly grid with ENDING CASH that Finance renders. */
  weeklyWithScheduled: WeeklyData;
  /** Chronologically sorted week-start keys (YYYY-MM-DD, Saturday). */
  sortedKeys: string[];
}

/**
 * Pure builder. Given the canonical inputs (scheduled items composition + weekly
 * overrides), produces the exact same WeeklyData map Finance uses. No filters
 * are applied — Finance applies Entity/Category filters on top.
 */
export function buildFinanceWeeklyBalance(
  inputs: FinanceWeeklyBalanceInputs,
): FinanceWeeklyBalanceResult {
  const { combinedScheduledItems, weeklyOverrides } = inputs;

  // 1) Replay the historical seed with overrides applied. This is identical
  //    to the historical-seed branch in CashFlowManager.
  const rawWeekly: WeeklyData = {};
  let lastHistoricalEnd = 0;
  let lastHistoricalAddl = 0;
  let lastHistoricalWeekNum = 0;
  let prevTotalCashOnHand = 0;
  const historicalKeys = Object.keys(WEEKLY_HISTORICAL_SEED).sort();
  for (let i = 0; i < historicalKeys.length; i++) {
    const k = historicalKeys[i];
    const entry = WEEKLY_HISTORICAL_SEED[k] as any;
    const ov = weeklyOverrides?.[k];
    const seededBegin = Number(entry['BEGINNING CASH']);
    const seededEnd = Number(entry['ENDING CASH']);
    const seededNet = Number(entry['NET CHANGE'] ?? entry['TOTAL NET CASH CHANGE']);
    const seededAddl =
      Number(
        entry['Addl Liquidity Chase Tax Reserve MT Chk'] ??
          entry["Add'l Liquidity (Delayed Draw)"],
      ) || 0;
    const hasBeginningOverride = ov?.beginningCash !== undefined && ov.beginningCash !== null;
    const hasEndingOverride = ov?.endingCash !== undefined && ov.endingCash !== null;
    const beginningCash = hasBeginningOverride
      ? Math.round(Number(ov!.beginningCash))
      : Number.isFinite(seededBegin)
      ? Math.round(seededBegin)
      : 0;
    const endingCash = hasEndingOverride
      ? Math.round(Number(ov!.endingCash))
      : hasBeginningOverride && Number.isFinite(seededNet)
      ? Math.round(beginningCash + seededNet)
      : Number.isFinite(seededEnd)
      ? Math.round(seededEnd)
      : beginningCash;
    const hasAddlOverride = ov?.addlLiquidity !== undefined && ov.addlLiquidity !== null;
    const addlLiquidity = hasAddlOverride
      ? Math.round(Number(ov!.addlLiquidity))
      : i === 0
      ? Math.round(seededAddl)
      : Math.round(prevTotalCashOnHand);
    const totalCashOnHand = Math.round(endingCash + addlLiquidity);

    rawWeekly[k] = {
      ...entry,
      'BEGINNING CASH': beginningCash,
      'ENDING CASH': endingCash,
      "Add'l Liquidity (Delayed Draw)": addlLiquidity,
      'TOTAL CASH ON HAND': totalCashOnHand,
    } as any;
    lastHistoricalEnd = endingCash;
    lastHistoricalAddl = addlLiquidity;
    lastHistoricalWeekNum = Number(entry.week_num) || lastHistoricalWeekNum;
    prevTotalCashOnHand = totalCashOnHand;
  }
  void lastHistoricalAddl;

  // 2) Determine the forward horizon (default ≥ 2026-12-25, extended by any
  //    scheduled occurrence beyond).
  let horizonEnd = parseISO(DEFAULT_HORIZON_END);
  for (const e of combinedScheduledItems || []) {
    const candidates = [
      e.frequency_config?.one_time_date,
      e.end_date,
      e.start_date,
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      const d = parseISO(c);
      if (d > horizonEnd) horizonEnd = d;
    }
  }

  // 3) Generate forward Friday-ending weeks starting at the first Friday
  //    strictly after LAST_HISTORICAL_WEEK_ENDING.
  const lastHistEnd = parseISO(LAST_HISTORICAL_WEEK_ENDING);
  let weekEnd = new Date(lastHistEnd);
  weekEnd.setDate(weekEnd.getDate() + 7);
  let prevEnd = lastHistoricalEnd;
  let weekNum = lastHistoricalWeekNum;
  while (weekEnd <= horizonEnd) {
    weekNum += 1;
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const startKey = fmtISO(weekStart);
    const endKey = fmtISO(weekEnd);
    const ov = weeklyOverrides?.[startKey];
    const begin = ov?.beginningCash !== undefined ? ov.beginningCash : prevEnd;
    const end = ov?.endingCash !== undefined ? ov.endingCash : begin;
    const hasAddlOverride = ov?.addlLiquidity !== undefined && ov.addlLiquidity !== null;
    const addlLiquidity = hasAddlOverride
      ? Math.round(Number(ov!.addlLiquidity))
      : Math.round(prevTotalCashOnHand);
    const totalCashOnHand = Math.round((Number(end) || 0) + addlLiquidity);
    rawWeekly[startKey] = {
      week_num: weekNum,
      week_ending: endKey,
      'BEGINNING CASH': begin,
      'ENDING CASH': end,
      'Addl Liquidity Chase Tax Reserve MT Chk': addlLiquidity,
      "Add'l Liquidity (Delayed Draw)": addlLiquidity,
      'TOTAL CASH ON HAND': totalCashOnHand,
      'TOTAL RECEIPTS': 0,
      'TOTAL DISBURSEMENTS': 0,
      'NET CHANGE': 0,
    } as any;
    prevEnd = end;
    prevTotalCashOnHand = totalCashOnHand;
    weekEnd = new Date(weekEnd);
    weekEnd.setDate(weekEnd.getDate() + 7);
  }

  // 4) Merge scheduled entries — this is what recomputes the rolling ENDING CASH.
  const weeklyWithScheduled = mergeScheduledIntoWeekly(rawWeekly, combinedScheduledItems || [], {
    lockHistoricalThrough: LAST_HISTORICAL_WEEK_ENDING,
    weeklyOverrides,
  });

  return {
    rawWeekly,
    weeklyWithScheduled,
    sortedKeys: Object.keys(weeklyWithScheduled).sort(),
  };
}

/**
 * Same anchor logic Finance uses for KPI tiles / chips: the first week whose
 * `week_ending` is on or after today's ISO date.
 */
export function findCurrentWeekIndex(
  sortedEntries: Array<[string, any]>,
  todayISO: string = new Date().toISOString().split('T')[0],
): number {
  const idx = sortedEntries.findIndex(([k, e]) => {
    const we = typeof e?.week_ending === 'string' ? e.week_ending : k;
    return we >= todayISO;
  });
  return idx < 0 ? sortedEntries.length - 1 : idx;
}

export interface ForwardWeekPoint {
  weekKey: string;
  weekEnding: string;
  endingCash: number;
}

/**
 * Picks the first `count` weeks starting at the current-week anchor. This is
 * what /insights "12-Week Cashflow Forecast" renders — same series, same
 * anchor, no separate calculation.
 */
export function pickForwardWeeks(
  result: FinanceWeeklyBalanceResult,
  count: number,
  todayISO?: string,
): ForwardWeekPoint[] {
  const sortedEntries = Object.entries(result.weeklyWithScheduled).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const startIdx = findCurrentWeekIndex(sortedEntries, todayISO);
  const out: ForwardWeekPoint[] = [];
  for (let i = startIdx; i < sortedEntries.length && out.length < count; i++) {
    const [k, entry] = sortedEntries[i] as [string, any];
    const weekEnding: string = typeof entry.week_ending === 'string' ? entry.week_ending : k;
    out.push({
      weekKey: k,
      weekEnding,
      endingCash: Math.round(Number(entry['ENDING CASH']) || 0),
    });
  }
  return out;
}

/**
 * Composes `combinedScheduledItems` from the four canonical sources Finance
 * uses (QB-derived → projected-deal → manual configure entries → saved
 * cash-in DB rows). Kept in this file so there is exactly one definition.
 */
export function composeCombinedScheduledItems({
  qbDerivedItems,
  dealProjectedItems,
  scheduledItems,
  cashInDbItems,
  companyId,
}: {
  qbDerivedItems: ScheduledCashFlow[] | null | undefined;
  dealProjectedItems: ScheduledCashFlow[] | null | undefined;
  scheduledItems: ScheduledCashFlow[] | null | undefined;
  cashInDbItems: CashInDbItem[] | null | undefined;
  companyId: string | undefined;
}): ScheduledCashFlow[] {
  const FEE_TO_CATEGORY: Record<string, string> = {
    retainer: 'Retainers',
    milestone: 'Milestones',
    closing: 'Closing Fees',
  };
  const FEE_LABEL: Record<string, string> = {
    retainer: 'Retainer',
    milestone: 'Milestone',
    closing: 'Closing',
  };
  const cashInDbAsScheduled: ScheduledCashFlow[] = (cashInDbItems || []).map((it) => {
    const date = (it.target_date || '').slice(0, 10);
    const category = FEE_TO_CATEGORY[it.fee_type] || 'Other Receipts';
    const label = FEE_LABEL[it.fee_type] || it.fee_type;
    return {
      id: `cashin:${it.id}`,
      company_id: companyId || '',
      account: it.deal_name || '',
      category,
      amount: Number(it.amount) || 0,
      frequency_type: 'one_time',
      frequency_config: { one_time_date: date },
      flow_type: 'cash_in',
      start_date: date,
      end_date: date,
      notes: `${it.deal_name} — ${label}`,
    } as ScheduledCashFlow;
  });
  return [
    ...(qbDerivedItems || []),
    ...(dealProjectedItems || []),
    ...(scheduledItems || []),
    ...cashInDbAsScheduled,
  ];
}

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