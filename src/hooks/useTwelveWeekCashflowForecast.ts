import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useScheduledCashFlows } from '@/components/cashflow/useScheduledCashFlows';
import { useQuickbooksDerivedCashFlows } from '@/components/cashflow/useQuickbooksDerivedCashFlows';
import { useDealCashflowOverrides } from '@/components/cashflow/useDealCashflowOverrides';
import { useDealProjectedCashFlows } from '@/components/cashflow/useDealProjectedCashFlows';
import { useCashInItems } from '@/components/cashflow/useCashInItems';
import { WEEKLY_HISTORICAL_SEED, LAST_HISTORICAL_WEEK_ENDING } from '@/components/cashflow/weeklyHistoricalSeed';
import { mergeScheduledIntoWeekly, type ScheduledCashFlow } from '@/components/cashflow/scheduledCashFlows';
import type { WeeklyData, WeeklyOverrides } from '@/components/cashflow/types';

export interface ForecastWeek {
  weekKey: string;        // Saturday start (YYYY-MM-DD)
  weekEnding: string;     // Friday end (YYYY-MM-DD)
  endingCash: number;
}

function parseISO(s: string): Date {
  return new Date(s + 'T00:00:00');
}
function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Builds the next 12 forward Friday-ending weeks of ENDING CASH using the
 * same data sources that power the Finance > Cash Flow tab:
 *   - WEEKLY_HISTORICAL_SEED for the starting balance
 *   - scheduled_cash_flows (Configure entries) for inflows/outflows
 *   - cash_flow_imports.weekly_overrides for any manual overrides
 * Mirrors the forward-week roll-forward logic in CashFlowManager.
 */
export function useTwelveWeekCashflowForecast(): {
  weeks: ForecastWeek[];
  isLoading: boolean;
} {
  const { company } = useCompany();
  const { items: scheduledItems, isLoading: schedLoading } = useScheduledCashFlows(company?.id);
  const { items: qbDerivedItems } = useQuickbooksDerivedCashFlows(!!company?.id);
  const { overrides: dealOverrides } = useDealCashflowOverrides(company?.id);
  const { items: dealProjectedItems } = useDealProjectedCashFlows(
    company?.id,
    !!company?.id,
    dealOverrides,
  );
  const { items: cashInDbItems } = useCashInItems();
  const [weeklyOverrides, setWeeklyOverrides] = useState<WeeklyOverrides>({});
  const [overridesLoading, setOverridesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!company?.id) {
      setWeeklyOverrides({});
      setOverridesLoading(false);
      return;
    }
    setOverridesLoading(true);
    (async () => {
      const { data } = await supabase
        .from('cash_flow_imports' as any)
        .select('weekly_overrides')
        .eq('company_id', company.id)
        .maybeSingle();
      if (!active) return;
      const wo = (data as any)?.weekly_overrides;
      setWeeklyOverrides(wo && typeof wo === 'object' && !Array.isArray(wo) ? (wo as WeeklyOverrides) : {});
      setOverridesLoading(false);
    })();
    return () => { active = false; };
  }, [company?.id]);

  // Mirror CashFlowManager.cashInDbAsScheduled — wrap saved deal cash-in
  // DB rows as one-time ScheduledCashFlow entries so they route through
  // mergeScheduledIntoWeekly into the same categories Finance uses.
  const cashInDbAsScheduled = useMemo<ScheduledCashFlow[]>(() => {
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
    return (cashInDbItems || []).map((it: any) => {
      const date = (it.target_date || '').slice(0, 10);
      const category = FEE_TO_CATEGORY[it.fee_type] || 'Other Receipts';
      const label = FEE_LABEL[it.fee_type] || it.fee_type;
      return {
        id: `cashin:${it.id}`,
        company_id: company?.id || '',
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
  }, [cashInDbItems, company?.id]);

  // Same composition as CashFlowManager.combinedScheduledItems.
  const combinedScheduledItems = useMemo<ScheduledCashFlow[]>(
    () => [
      ...(qbDerivedItems || []),
      ...(dealProjectedItems || []),
      ...(scheduledItems || []),
      ...cashInDbAsScheduled,
    ],
    [qbDerivedItems, dealProjectedItems, scheduledItems, cashInDbAsScheduled],
  );

  const weeks = useMemo<ForecastWeek[]>(() => {
    // 1) Replay the historical seed with overrides applied to determine
    //    the last known ENDING CASH and the last historical week_num.
    let lastHistoricalEnd = 0;
    let lastHistoricalWeekNum = 0;
    const histKeys = Object.keys(WEEKLY_HISTORICAL_SEED).sort();
    for (const k of histKeys) {
      const entry = WEEKLY_HISTORICAL_SEED[k] as any;
      const ov = weeklyOverrides?.[k];
      const seededBegin = Number(entry['BEGINNING CASH']);
      const seededEnd = Number(entry['ENDING CASH']);
      const seededNet = Number(entry['NET CHANGE'] ?? entry['TOTAL NET CASH CHANGE']);
      const hasBeginOv = ov?.beginningCash !== undefined && ov.beginningCash !== null;
      const hasEndOv = ov?.endingCash !== undefined && ov.endingCash !== null;
      const begin = hasBeginOv
        ? Math.round(Number(ov.beginningCash))
        : (Number.isFinite(seededBegin) ? Math.round(seededBegin) : 0);
      const end = hasEndOv
        ? Math.round(Number(ov.endingCash))
        : (hasBeginOv && Number.isFinite(seededNet)
            ? Math.round(begin + seededNet)
            : (Number.isFinite(seededEnd) ? Math.round(seededEnd) : begin));
      lastHistoricalEnd = end;
      lastHistoricalWeekNum = Number(entry.week_num) || lastHistoricalWeekNum;
    }

    // 2) Build 12 forward Friday-ending weeks beginning at the first Friday
    //    on/after today (or after LAST_HISTORICAL_WEEK_ENDING, whichever is later).
    const horizonStart = parseISO(LAST_HISTORICAL_WEEK_ENDING);
    let weekEnd = new Date(horizonStart);
    weekEnd.setDate(weekEnd.getDate() + 7); // first forward Friday

    const forward: WeeklyData = {};
    let prevEnd = lastHistoricalEnd;
    let weekNum = lastHistoricalWeekNum;
    // Seed historical window first so mergeScheduledIntoWeekly can lock it.
    for (const k of histKeys) {
      const e = WEEKLY_HISTORICAL_SEED[k] as any;
      forward[k] = { ...e };
    }
    // Generate enough forward weeks to cover any scheduled occurrences,
    // but we'll only return the next 12. Mirror CashFlowManager horizon
    // (≥ 2026-12-25, extended by any scheduled occurrence beyond).
    let horizonEnd = parseISO('2026-12-25');
    for (const e of combinedScheduledItems) {
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
    const totalForward = Math.max(
      60,
      Math.ceil((horizonEnd.getTime() - weekEnd.getTime()) / (7 * 86400000)) + 2,
    );
    for (let i = 0; i < totalForward; i++) {
      weekNum += 1;
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      const startKey = fmtISO(weekStart);
      const endKey = fmtISO(weekEnd);
      const ov = weeklyOverrides?.[startKey];
      const begin = ov?.beginningCash !== undefined ? ov.beginningCash : prevEnd;
      const end = ov?.endingCash !== undefined ? ov.endingCash : begin;
      forward[startKey] = {
        week_num: weekNum,
        week_ending: endKey,
        'BEGINNING CASH': begin,
        'ENDING CASH': end,
        'TOTAL CASH ON HAND': end,
        'TOTAL RECEIPTS': 0,
        'TOTAL DISBURSEMENTS': 0,
        'NET CHANGE': 0,
      } as any;
      prevEnd = end;
      weekEnd = new Date(weekEnd);
      weekEnd.setDate(weekEnd.getDate() + 7);
    }

    // 3) Merge scheduled entries — this also recomputes the rolling ENDING CASH.
    const merged = mergeScheduledIntoWeekly(forward, combinedScheduledItems, {
      lockHistoricalThrough: LAST_HISTORICAL_WEEK_ENDING,
      weeklyOverrides,
    });

    // 4) Pick 12 weeks starting at the current week — matching the
    //    CashFlowManager "current week" anchor (first week whose
    //    week_ending >= today ISO).
    const todayISO = new Date().toISOString().split('T')[0];
    const sortedEntries = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
    let currentIdx = sortedEntries.findIndex(([dateKey, entry]: any) => {
      const we = typeof entry?.week_ending === 'string' ? entry.week_ending : dateKey;
      return we >= todayISO;
    });
    if (currentIdx < 0) currentIdx = sortedEntries.length - 1;
    const out: ForecastWeek[] = [];
    for (let i = currentIdx; i < sortedEntries.length && out.length < 12; i++) {
      const [k, entry] = sortedEntries[i] as [string, any];
      const weekEnding: string = typeof entry.week_ending === 'string' ? entry.week_ending : k;
      out.push({
        weekKey: k,
        weekEnding,
        endingCash: Math.round(Number(entry['ENDING CASH']) || 0),
      });
    }
    return out;
  }, [combinedScheduledItems, weeklyOverrides]);

  return { weeks, isLoading: schedLoading || overridesLoading };
}
