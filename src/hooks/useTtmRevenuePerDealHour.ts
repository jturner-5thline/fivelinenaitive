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
        metric === 'gross_profit' ? loadGrossProfitMonths(companyId, start, end) :
        loadAllTtmRows((from, to) => supabase.from('quickbooks_invoices')
          .select('txn_date, total_amt')
          .eq('realm_id', TTM_REVENUE_REALM_ID)
          .gte('txn_date', start).lte('txn_date', end)
          .order('id').range(from, to)),
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
async function loadGrossProfitMonths(companyId: string, start: string, end: string) {
  const months = monthPeriods(start, end);
  try {
    await ensureFinServPnlSnapshots(companyId, months, TTM_REVENUE_REALM_ID);
  } catch (err) {
    console.warn('[ttm-gross-profit] snapshot refresh failed; using stored months', err);
  }
  const rows = await loadAllTtmRows((from, to) => supabase.from('qbo_pnl_snapshots')
    .select('period_start, period_end, gross_profit')
    .eq('company_id', companyId).eq('realm_id', TTM_REVENUE_REALM_ID).eq('accounting_method', 'Accrual')
    .gte('period_start', start).lte('period_end', end)
    .order('id').range(from, to));
  const wanted = new Set(months.map(m => `${m.start_date}_${m.end_date}`));
  return (rows as { period_start: string; period_end: string; gross_profit: number | null }[])
    .filter(r => wanted.has(`${r.period_start}_${r.period_end}`))
    .map(r => ({ txn_date: r.period_start, total_amt: r.gross_profit }));
}
