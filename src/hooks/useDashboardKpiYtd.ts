/**
 * Live YTD actuals + editable Plan targets backing the 4 headline KPIs
 * on the Daily Rundown → Dashboard popup KPI strip:
 *   • Deals Closed   — distinct deals that entered "Funded / Invoiced" YTD
 *   • Dollars Funded — SUM(deals.value) for those distinct deals
 *   • New Clients    — distinct deals that entered "Final Credit Items" YTD
 *   • Fee Revenue    — QBO P&L Income for the Debt realm, Jan 1 → today
 *
 * Plan targets are stored in public.dashboard_kpi_plans (admin-editable;
 * everyone reads). The hook returns plan_value alongside the actuals so
 * the UI can render "X% of Plan".
 */
import { useQuery } from '@tanstack/react-query';
import { startOfYear, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { QBO_REALM_DEBT } from '@/config/qboEntities';

const STAGE_FUNDED = 'funded / invoiced';
const STAGE_FINAL_CREDIT = 'final credit items';

const EXCLUDED = new Set(["Test-Niki's Store", 'Example Deal']);
function isExcluded(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (EXCLUDED.has(n)) return true;
  return n.toLowerCase().startsWith('test ');
}

export type KpiMetricKey =
  | 'deals_closed'
  | 'dollars_funded'
  | 'new_clients'
  | 'fee_revenue';

export interface KpiPlanRow {
  metric_key: KpiMetricKey;
  label: string;
  plan_value: number;
  format_type: 'number' | 'currency';
  comparison_mode: string;
}

export interface KpiYtdResult {
  dealsClosed: number;
  dollarsFunded: number;
  newClients: number;
  feeRevenue: number | null;
  plans: Record<KpiMetricKey, KpiPlanRow | undefined>;
}

function useActivePipelineStages() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  return useQuery({
    queryKey: ['dash-kpi-ytd', 'active-pipeline', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, stages')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const stages: Array<{ id: string; label: string }> = Array.isArray(data?.stages)
        ? (data!.stages as any)
        : [];
      const find = (name: string) =>
        stages.find(s => s.label?.trim().toLowerCase() === name)?.id ?? null;
      return {
        pipelineId: (data?.id as string) ?? null,
        fundedStageId: find(STAGE_FUNDED),
        finalCreditStageId: find(STAGE_FINAL_CREDIT),
      };
    },
  });
}

export function useDashboardKpiYtd() {
  const { user } = useAuth();
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const stages = useActivePipelineStages();
  const { pipelineId, fundedStageId, finalCreditStageId } = stages.data ?? {};

  const plansQuery = useQuery({
    queryKey: ['dashboard_kpi_plans'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_kpi_plans' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as KpiPlanRow[];
    },
  });

  const dealsYtdQuery = useQuery({
    queryKey: ['dash-kpi-ytd', 'deals', companyId, pipelineId, fundedStageId, finalCreditStageId],
    enabled: !!companyId && !!pipelineId && (!!fundedStageId || !!finalCreditStageId),
    staleTime: 60_000,
    queryFn: async () => {
      const start = startOfYear(new Date()).toISOString();
      const targets: string[] = [];
      if (fundedStageId) targets.push(fundedStageId);
      if (finalCreditStageId) targets.push(finalCreditStageId);
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, to_stage, changed_at, deals!inner(company, value)')
        .eq('company_id', companyId)
        .eq('pipeline_id', pipelineId)
        .in('to_stage', targets)
        .gte('changed_at', start);
      if (error) throw error;

      // Earliest entry per (deal, stage) within YTD.
      const fundedDeals = new Map<string, number>();
      const finalCreditDeals = new Set<string>();
      for (const row of (data ?? []) as Array<{
        deal_id: string;
        to_stage: string;
        deals: { company: string | null; value: number | null } | null;
      }>) {
        if (isExcluded(row.deals?.company ?? null)) continue;
        if (fundedStageId && row.to_stage === fundedStageId) {
          if (!fundedDeals.has(row.deal_id)) {
            const v = Number(row.deals?.value);
            fundedDeals.set(row.deal_id, Number.isFinite(v) ? v : 0);
          }
        }
        if (finalCreditStageId && row.to_stage === finalCreditStageId) {
          finalCreditDeals.add(row.deal_id);
        }
      }
      const dollarsFunded = Array.from(fundedDeals.values()).reduce((s, v) => s + v, 0);
      return {
        dealsClosed: fundedDeals.size,
        dollarsFunded,
        newClients: finalCreditDeals.size,
      };
    },
  });

  const feeRevenueQuery = useQuery({
    queryKey: ['dash-kpi-ytd', 'fee-revenue', QBO_REALM_DEBT, user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => {
      const now = new Date();
      const startStr = format(startOfYear(now), 'yyyy-MM-dd');
      const endStr = format(now, 'yyyy-MM-dd');
      // Read cached report; widest matching window covering YTD.
      const { data } = await supabase
        .from('quickbooks_reports')
        .select('report_data, period_start, period_end')
        .eq('report_type', 'profit_and_loss')
        .eq('realm_id', QBO_REALM_DEBT)
        .lte('period_start', startStr)
        .gte('period_end', endStr)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let report: any = data?.report_data ?? null;
      if (!report) {
        // Fall back: trigger a YTD sync, then re-read.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.functions.invoke('quickbooks-sync', {
              body: {
                syncType: 'profit_and_loss',
                realmId: QBO_REALM_DEBT,
                start_date: startStr,
                end_date: endStr,
              },
            });
            const { data: refreshed } = await supabase
              .from('quickbooks_reports')
              .select('report_data')
              .eq('report_type', 'profit_and_loss')
              .eq('realm_id', QBO_REALM_DEBT)
              .eq('period_start', startStr)
              .eq('period_end', endStr)
              .order('synced_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            report = refreshed?.report_data ?? null;
          }
        } catch (e) {
          console.warn('[useDashboardKpiYtd] QBO sync failed', e);
        }
      }
      if (!report) return null;
      const rows: any[] = report?.Rows?.Row ?? [];
      for (const r of rows) {
        if (r?.type === 'Section' && r?.group === 'Income') {
          const v = parseFloat(r?.Summary?.ColData?.[1]?.value ?? '0');
          return Number.isFinite(v) ? v : null;
        }
      }
      return null;
    },
  });

  const plans = (plansQuery.data ?? []).reduce(
    (acc, p) => {
      acc[p.metric_key] = p;
      return acc;
    },
    {} as Record<KpiMetricKey, KpiPlanRow | undefined>,
  );

  return {
    isLoading: stages.isLoading || dealsYtdQuery.isLoading || feeRevenueQuery.isLoading || plansQuery.isLoading,
    dealsClosed: dealsYtdQuery.data?.dealsClosed ?? 0,
    dollarsFunded: dealsYtdQuery.data?.dollarsFunded ?? 0,
    newClients: dealsYtdQuery.data?.newClients ?? 0,
    feeRevenue: feeRevenueQuery.data ?? null,
    plans,
    refetchPlans: plansQuery.refetch,
  };
}

const ADMIN_EMAILS = new Set([
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
  'jrivera@5thline.co',
  'cminaldi@5thline.co',
  'mclark@5thline.co',
  'swilliams@5thline.co',
  'mkaleniecki@5thline.co',
]);

export function useIsKpiPlanAdmin(): boolean {
  const { user } = useAuth();
  return !!user?.email && ADMIN_EMAILS.has(user.email.toLowerCase());
}