import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { useCompany } from '@/hooks/useCompany';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { supabase } from '@/integrations/supabase/client';
import { ensureFinServPnlSnapshots } from '@/hooks/useFinServFinancialMetrics';
import { endOfMonth, format, parseISO, addMonths } from 'date-fns';
import {
  buildTtmPeriods, calculateTtmPeriod, loadAllTtmRows,
  TTM_REVENUE_REALM_ID, TTM_HOUR_PIPELINE_IDS, type TtmHours,
} from '@/lib/metrics/ttmRevenuePerDealHour';

export type TtmNumeratorMetric = 'revenue' | 'gross_profit';

/** Full calendar months covering [start, end], used to read monthly P&L Gross Profit. */
export function monthPeriods(start: string, end: string) {
  const out: { start_date: string; end_date: string }[] = [];
  for (let d = parseISO(start); format(d, 'yyyy-MM-dd') <= end; d = addMonths(d, 1)) {
    out.push({ start_date: format(d, 'yyyy-MM-01'), end_date: format(endOfMonth(d), 'yyyy-MM-dd') });
  }
  return out;
}

export function useTtmRevenuePerDealHour(multiplier = 1, active = true, metric: TtmNumeratorMetric = 'revenue') {
  const { user } = useAuth();
  const { company } = useCompany();
  const { timeframe, reportingPeriod } = useInsightsTimeframe();
  const view = reportingPeriod?.view ?? 'month';
  const periods = buildTtmPeriods(timeframe.end, view, multiplier);
  const start = periods[0]?.start ?? timeframe.start;
  const end = periods.at(-1)?.end ?? timeframe.end;
  const companyId = company?.id;
  const hasAccess = companyId === FIFTH_LINE_COMPANY_ID;
  const query = useQuery({
    queryKey: ['ttm-revenue-per-deal-hour', metric, user?.id, companyId, start, end, view, multiplier],
    enabled: active && !!user && hasAccess,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId || !hasAccess) throw new Error('This metric is available only in the 5th Line workspace.');
      // Invoice RLS authorizes company-member access; fixed realm isolates Capital Advisors.
      // All reads are paged and ordered, with no sync or write side effects.
      const [invoices, entries] = await Promise.all([
        // Debt Advisory revenue = QBO P&L Total Income (excludes Other Income such as Ramp Loans).
        loadPnlMonths(companyId, start, end, TTM_REVENUE_REALM_ID, metric === 'gross_profit' ? 'gross_profit' : 'income_total'),
        loadAllTtmRows((from, to) => supabase.from('weekly_time_entries')
          .select('deal_id, week_start_date, hours, deals!inner(company, company_id, pipeline_id)')
          .eq('deals.company_id', companyId)
          .in('deals.pipeline_id', TTM_HOUR_PIPELINE_IDS)
          .gte('week_start_date', start).lte('week_start_date', end)
          .order('id').range(from, to)),
      ]);
      const all = periods.map(period => calculateTtmPeriod(period, invoices, entries as TtmHours[], companyId));
      return all.slice(1).map((period, i) => {
        const prior = all[i];
        const delta = period.rate != null && prior?.rate != null ? period.rate - prior.rate : null;
        return { ...period, priorLabel: prior?.label, delta,
          deltaPct: delta != null && prior?.rate ? delta / Math.abs(prior.rate) * 100 : null };
      });
    },
  });
  return { ...query, hasAccess, view };
}
/** Monthly QBO P&L "Gross Profit" for Capital Advisors, shaped like dated amounts. */
export function loadGrossProfitMonths(companyId: string, start: string, end: string, realmId: string = TTM_REVENUE_REALM_ID) {
  return loadPnlMonths(companyId, start, end, realmId, 'gross_profit');
}

/** One latest-fetched full-month Accrual P&L value per month, shaped like dated amounts. */
export async function loadPnlMonths(companyId: string, start: string, end: string, realmId: string, field: 'gross_profit' | 'income_total') {
  const months = monthPeriods(start, end);
  try {
    await ensureFinServPnlSnapshots(companyId, months, realmId);
  } catch (err) {
    console.warn('[ttm-gross-profit] snapshot refresh failed; using stored months', err);
  }
  const rows = await loadAllTtmRows((from, to) => supabase.from('qbo_pnl_snapshots')
    .select('period_start, period_end, gross_profit, income_total, fetched_at')
    .eq('company_id', companyId).eq('realm_id', realmId).eq('accounting_method', 'Accrual')
    .gte('period_start', start).lte('period_end', end)
    .order('id').range(from, to));
  const wanted = new Set(months.map(m => `${m.start_date}_${m.end_date}`));
  return latestPerMonth(rows as PnlMonthRow[], wanted)
    .map(r => ({ txn_date: r.period_start, total_amt: r[field] }));
}

type PnlMonthRow = { period_start: string; period_end: string; gross_profit: number | null; income_total: number | null; fetched_at: string | null };
/** Keeps only the most recently fetched snapshot for each wanted full month (older fetches can be stale). */
export function latestPerMonth<T extends { period_start: string; period_end: string; fetched_at: string | null }>(rows: T[], wanted: Set<string>): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.period_start}_${r.period_end}`;
    if (!wanted.has(k)) continue;
    const prev = best.get(k);
    if (!prev || (r.fetched_at ?? '') > (prev.fetched_at ?? '')) best.set(k, r);
  }
  return [...best.values()];
}
