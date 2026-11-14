import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { useCompany } from '@/hooks/useCompany';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { supabase } from '@/integrations/supabase/client';
import { buildTtmPeriods, loadAllTtmRows, TTM_REVENUE_REALM_ID } from '@/lib/metrics/ttmRevenuePerDealHour';
import { calculateTtmPerHead, type HeadcountRow } from '@/lib/metrics/ttmPerHead';
import { HEADCOUNT_COMPANY_ID } from '@/lib/monthlyHeadcount';
import { loadGrossProfitMonths, type TtmNumeratorMetric } from './useTtmRevenuePerDealHour';

export function useTtmPerHead(multiplier = 1, active = true, metric: TtmNumeratorMetric = 'revenue') {
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
    queryKey: ['ttm-per-head', metric, user?.id, companyId, start, end, view, multiplier],
    enabled: active && !!user && hasAccess,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId || !hasAccess) throw new Error('This metric is available only in the 5th Line workspace.');
      const [amounts, headcount] = await Promise.all([
        metric === 'gross_profit' ? loadGrossProfitMonths(companyId, start, end) :
          loadAllTtmRows((from, to) => supabase.from('quickbooks_invoices').select('txn_date, total_amt')
            .eq('realm_id', TTM_REVENUE_REALM_ID).gte('txn_date', start).lte('txn_date', end).order('id').range(from, to)),
        loadAllTtmRows((from, to) => supabase.from('monthly_entity_headcount').select('month, headcount')
          .eq('company_id', HEADCOUNT_COMPANY_ID).eq('realm_id', TTM_REVENUE_REALM_ID)
          .gte('month', start).lte('month', end).order('month').range(from, to)),
      ]);
      const all = periods.map(p => calculateTtmPerHead(p, amounts, headcount as HeadcountRow[]));
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
