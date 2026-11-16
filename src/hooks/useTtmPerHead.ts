import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { useCompany } from '@/hooks/useCompany';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { supabase } from '@/integrations/supabase/client';
import { buildTtmPeriods, loadAllTtmRows, TTM_REVENUE_REALM_ID } from '@/lib/metrics/ttmRevenuePerDealHour';
import { calculateTtmPerHead, firmWideHeadcount, type HeadcountRow } from '@/lib/metrics/ttmPerHead';
import { HEADCOUNT_COMPANY_ID, HEADCOUNT_UNITS } from '@/lib/monthlyHeadcount';
import { loadGrossProfitMonths, loadPnlMonths, type TtmNumeratorMetric } from './useTtmRevenuePerDealHour';

export type TtmHeadScope = 'debt' | 'firm' | 'finserv';
const FINSERV_HEADCOUNT_REALM = HEADCOUNT_UNITS.find(u => u.label === 'FinServ')!.realmId;
const ALL_REALMS = HEADCOUNT_UNITS.map(u => u.realmId);

export function useTtmPerHead(multiplier = 1, active = true, metric: TtmNumeratorMetric = 'revenue', scope: TtmHeadScope = 'debt') {
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
    queryKey: ['ttm-per-head', scope, metric, user?.id, companyId, start, end, view, multiplier],
    enabled: active && !!user && hasAccess,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId || !hasAccess) throw new Error('This metric is available only in the 5th Line workspace.');
      const realms = scope === 'firm' ? ALL_REALMS : scope === 'finserv' ? [FINSERV_HEADCOUNT_REALM] : [TTM_REVENUE_REALM_ID];
      const [amounts, rawHeadcount] = await Promise.all([
        metric === 'gross_profit'
          ? Promise.all(realms.map(r => loadGrossProfitMonths(companyId, start, end, r))).then(a => a.flat())
          // Revenue = QBO P&L Total Income for every entity (Debt excludes Ramp / Other Income).
          : Promise.all(realms.map(r => loadPnlMonths(companyId, start, end, r, 'income_total'))).then(a => a.flat()),
        loadAllTtmRows((from, to) => supabase.from('monthly_entity_headcount').select('month, headcount')
          .eq('company_id', HEADCOUNT_COMPANY_ID).in('realm_id', realms)
          .gte('month', start).lte('month', end).order('id').range(from, to)),
      ]);
      const headcount = scope === 'firm' ? firmWideHeadcount(rawHeadcount as HeadcountRow[]) : rawHeadcount as HeadcountRow[];
      const all = periods.map(p => calculateTtmPerHead(p, amounts, headcount));
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
