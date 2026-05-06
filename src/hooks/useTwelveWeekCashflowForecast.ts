import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useScheduledCashFlows } from '@/components/cashflow/useScheduledCashFlows';
import { WEEKLY_HISTORICAL_SEED, LAST_HISTORICAL_WEEK_ENDING } from '@/components/cashflow/weeklyHistoricalSeed';
import { mergeScheduledIntoWeekly } from '@/components/cashflow/scheduledCashFlows';
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
  const { items: scheduled, isLoading: schedLoading } = useScheduledCashFlows(company?.id);
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
    // but we'll only return the next 12.
    const totalForward = 60;
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
    const merged = mergeScheduledIntoWeekly(forward, scheduled || [], {
      lockHistoricalThrough: LAST_HISTORICAL_WEEK_ENDING,
      weeklyOverrides,
    });

    // 4) Pick the first 12 forward weeks (chronologically) starting after the
    //    historical lock cutoff and on/after today's week.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sortedKeys = Object.keys(merged).sort();
    const out: ForecastWeek[] = [];
    for (const k of sortedKeys) {
      const entry: any = merged[k];
      const weekEnding: string = typeof entry.week_ending === 'string' ? entry.week_ending : k;
      if (weekEnding <= LAST_HISTORICAL_WEEK_ENDING) continue;
      // Skip past forward weeks (historical seed only goes through LAST_HISTORICAL_WEEK_ENDING,
      // but if today is in the future we may want to skip already-elapsed weeks too).
      if (parseISO(weekEnding) < today) continue;
      out.push({
        weekKey: k,
        weekEnding,
        endingCash: Math.round(Number(entry['ENDING CASH']) || 0),
      });
      if (out.length >= 12) break;
    }
    return out;
  }, [scheduled, weeklyOverrides]);

  return { weeks, isLoading: schedLoading || overridesLoading };
}
