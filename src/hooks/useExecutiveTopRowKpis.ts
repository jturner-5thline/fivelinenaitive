/**
 * Live data backing the Executive Dashboard's top-row KPI cards.
 *
 * 1. Total Active Deal Volume
 *    SUM(deals.value) where current stage is in the inclusive label range
 *    Final Credit Items → In Due Diligence on the user's ACTIVE (default)
 *    pipeline.
 *
 * 2. Deals Closed (QTD)
 *    COUNT DISTINCT deals that ENTERED the "Funded / Invoiced" stage during
 *    the current quarter. Sourced from deal_stage_history (stage-entry
 *    events), not current-stage snapshots.
 *
 * 3. Revenue (QTD)
 *    Quarter-to-date Income for 5th Line Capital Advisors LLC
 *    (realm 193514877331929) from QuickBooks Online.
 *
 * 4. Avg Deal Size
 *    SUM(deals.value) / COUNT(distinct deals) for deals that entered
 *    "Final Credit Items" in the trailing 12 months.
 *
 * Live = no hardcoded values, no placeholder deltas. If a card has no
 * data, it returns 0 / null and the UI renders accordingly.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  startOfQuarter,
  endOfQuarter,
  subMonths,
  format,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { QBO_REALM_DEBT } from '@/config/qboEntities';

/**
 * Drilldown row used by the Executive Dashboard top-row KPI modals.
 * Mirrors the shape used by SalesTeamBoardDashboard's StageEntryDeal
 * so the same DrilldownModal-style table can render any of the four cards.
 */
export interface ExecKpiDrilldownDeal {
  deal_id: string;
  company: string;
  value: number;
  /** Stage label for current snapshot, or stage label entered for history rows. */
  stage_label: string | null;
  /** Event timestamp (stage-entry changed_at) or deal updated_at for snapshot rows. */
  occurred_at: string | null;
}

// ── Globally-excluded test deals (per project memory). ─────────────
const EXCLUDED_DEAL_NAMES = new Set(["Test-Niki's Store", 'Example Deal']);
function isExcludedDealName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (EXCLUDED_DEAL_NAMES.has(n)) return true;
  if (n.toLowerCase().startsWith('test ')) return true;
  return false;
}

// Pipeline stage labels we resolve at query time.
const STAGE_LABEL_FINAL_CREDIT_ITEMS = 'Final Credit Items';
const STAGE_LABEL_IN_DUE_DILIGENCE = 'In Due Diligence';
const STAGE_LABEL_FUNDED_INVOICED = 'Funded / Invoiced';

interface PipelineStage {
  id: string;
  label: string;
  color?: string;
}

/** Build a stage_id → label map for resolving drilldown stage labels. */
function buildStageIdLabelMap(stages: PipelineStage[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of stages) {
    if (s?.id) m.set(s.id, s.label ?? s.id);
  }
  return m;
}

/**
 * Resolve the active (default) pipeline for the user's company and the
 * stage IDs for the labels we care about.
 */
function useActivePipelineStageMap() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;

  return useQuery({
    queryKey: ['exec-top-kpis', 'active-pipeline-stages', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, name, stages')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          pipelineId: null as string | null,
          stageIdsInRange: [] as string[],
          fundedInvoicedStageId: null as string | null,
          finalCreditItemsStageId: null as string | null,
        };
      }

      const stages: PipelineStage[] = Array.isArray(data.stages)
        ? (data.stages as unknown as PipelineStage[])
        : [];

      const idxFinalCredit = stages.findIndex(
        s => s.label?.trim().toLowerCase() === STAGE_LABEL_FINAL_CREDIT_ITEMS.toLowerCase(),
      );
      const idxDueDiligence = stages.findIndex(
        s => s.label?.trim().toLowerCase() === STAGE_LABEL_IN_DUE_DILIGENCE.toLowerCase(),
      );
      const idxFunded = stages.findIndex(
        s => s.label?.trim().toLowerCase() === STAGE_LABEL_FUNDED_INVOICED.toLowerCase(),
      );

      const stageIdsInRange =
        idxFinalCredit >= 0 && idxDueDiligence >= 0 && idxDueDiligence >= idxFinalCredit
          ? stages.slice(idxFinalCredit, idxDueDiligence + 1).map(s => s.id)
          : [];

      return {
        pipelineId: data.id as string,
        stageIdsInRange,
        fundedInvoicedStageId: idxFunded >= 0 ? stages[idxFunded].id : null,
        finalCreditItemsStageId: idxFinalCredit >= 0 ? stages[idxFinalCredit].id : null,
        stageLabelById: buildStageIdLabelMap(stages),
      };
    },
  });
}

// ── 1. Total Active Deal Volume ────────────────────────────────────
function useTotalActiveDealVolume() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const stages = useActivePipelineStageMap();
  const pipelineId = stages.data?.pipelineId ?? null;
  const stageIds = stages.data?.stageIdsInRange ?? [];
  const labelById = stages.data?.stageLabelById ?? new Map<string, string>();

  return useQuery({
    queryKey: [
      'exec-top-kpis',
      'total-active-deal-volume',
      companyId,
      pipelineId,
      stageIds.join('|'),
    ],
    enabled: !!companyId && !!pipelineId && stageIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, value, company, stage, pipeline_id, updated_at')
        .eq('company_id', companyId)
        .eq('pipeline_id', pipelineId)
        .in('stage', stageIds);
      if (error) throw error;
      let total = 0;
      let count = 0;
      const deals: ExecKpiDrilldownDeal[] = [];
      for (const d of data ?? []) {
        if (isExcludedDealName(d.company)) continue;
        const v = Number(d.value);
        if (!Number.isFinite(v)) continue;
        total += v;
        count += 1;
        deals.push({
          deal_id: d.id,
          company: d.company ?? '—',
          value: v,
          stage_label: labelById.get(d.stage) ?? d.stage ?? null,
          occurred_at: (d as { updated_at?: string }).updated_at ?? null,
        });
      }
      // Sort by value desc — most material deals first.
      deals.sort((a, b) => b.value - a.value);
      return { total, count, deals };
    },
  });
}

// ── 2. Deals Closed (QTD): entered Funded/Invoiced this quarter ────
function useDealsClosedQTD() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const stages = useActivePipelineStageMap();
  const pipelineId = stages.data?.pipelineId ?? null;
  const fundedStageId = stages.data?.fundedInvoicedStageId ?? null;
  const fundedLabel =
    (fundedStageId && stages.data?.stageLabelById.get(fundedStageId)) || 'Funded / Invoiced';

  return useQuery({
    queryKey: [
      'exec-top-kpis',
      'deals-closed-qtd',
      companyId,
      pipelineId,
      fundedStageId,
    ],
    enabled: !!companyId && !!pipelineId && !!fundedStageId,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const qStart = startOfQuarter(now);
      const qEnd = endOfQuarter(now);

      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, deals!inner(company, value)')
        .eq('company_id', companyId)
        .eq('pipeline_id', pipelineId)
        .eq('to_stage', fundedStageId)
        .gte('changed_at', qStart.toISOString())
        .lte('changed_at', qEnd.toISOString());
      if (error) throw error;

      // Keep the EARLIEST entry per deal_id this quarter so the drilldown shows
      // when each deal first crossed into Funded/Invoiced.
      const seen = new Map<string, ExecKpiDrilldownDeal>();
      for (const row of (data ?? []) as Array<{
        deal_id: string;
        changed_at: string;
        deals: { company: string | null; value: number | null } | null;
      }>) {
        if (isExcludedDealName(row.deals?.company ?? null)) continue;
        const v = Number(row.deals?.value);
        const candidate: ExecKpiDrilldownDeal = {
          deal_id: row.deal_id,
          company: row.deals?.company ?? '—',
          value: Number.isFinite(v) ? v : 0,
          stage_label: fundedLabel,
          occurred_at: row.changed_at,
        };
        const prev = seen.get(row.deal_id);
        if (!prev || (prev.occurred_at && candidate.occurred_at && candidate.occurred_at < prev.occurred_at)) {
          seen.set(row.deal_id, candidate);
        }
      }
      const deals = Array.from(seen.values()).sort((a, b) =>
        (b.occurred_at ?? '').localeCompare(a.occurred_at ?? ''),
      );
      return { count: deals.length, deals };
    },
  });
}

/** One Income line item from a QBO Profit & Loss report (used for Revenue drilldown). */
export interface ExecRevenueLineItem {
  account: string;
  amount: number;
}

/** Recursively flatten QBO P&L Income rows into a flat line-item list. */
function flattenQboIncomeRows(rows: any[]): ExecRevenueLineItem[] {
  const out: ExecRevenueLineItem[] = [];
  const walk = (rs: any[]) => {
    for (const r of rs ?? []) {
      if (r?.type === 'Data') {
        const account = r?.ColData?.[0]?.value ?? '—';
        const amount = parseFloat(r?.ColData?.[1]?.value ?? '0');
        if (Number.isFinite(amount) && amount !== 0) {
          out.push({ account, amount });
        }
      } else if (r?.Rows?.Row) {
        walk(r.Rows.Row);
      }
    }
  };
  walk(rows);
  return out;
}

// ── 3. Revenue (QTD) — 5th Line Capital Advisors via QBO ───────────
function useRevenueQTDForDebtEntity() {
  const { user } = useAuth();
  const realmId = QBO_REALM_DEBT;
  const now = new Date();
  const qStart = startOfQuarter(now);
  const qEnd = endOfQuarter(now);
  const startStr = format(qStart, 'yyyy-MM-dd');
  const endStr = format(qEnd, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['exec-top-kpis', 'revenue-qtd-debt', realmId, startStr, endStr, user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Try cached report for the exact QTD window first.
      const { data, error } = await supabase
        .from('quickbooks_reports')
        .select('report_data, period_start, period_end, synced_at')
        .eq('report_type', 'profit_and_loss')
        .eq('realm_id', realmId)
        .eq('period_start', startStr)
        .eq('period_end', endStr)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      let report: any = data?.report_data ?? null;

      // Cache miss → trigger a sync for the QTD window then re-read.
      if (!report) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.functions.invoke('quickbooks-sync', {
              body: {
                syncType: 'profit_and_loss',
                realmId,
                start_date: startStr,
                end_date: endStr,
              },
            });
            const { data: refreshed } = await supabase
              .from('quickbooks_reports')
              .select('report_data')
              .eq('report_type', 'profit_and_loss')
              .eq('realm_id', realmId)
              .eq('period_start', startStr)
              .eq('period_end', endStr)
              .order('synced_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            report = refreshed?.report_data ?? null;
          }
        } catch (e) {
          // Soft-fail: leave revenue as null and let UI show "—"
          console.warn('[useRevenueQTDForDebtEntity] sync failed', e);
        }
      }

      if (!report) return { revenue: null as number | null, lineItems: [] as ExecRevenueLineItem[] };

      // Walk the QB P&L payload to find the Income section summary.
      const rows: any[] = report?.Rows?.Row ?? [];
      let income = 0;
      let found = false;
      let lineItems: ExecRevenueLineItem[] = [];
      for (const row of rows) {
        if (row?.type === 'Section' && row?.group === 'Income') {
          const summaryAmount = parseFloat(row?.Summary?.ColData?.[1]?.value ?? '0');
          if (Number.isFinite(summaryAmount)) {
            income = summaryAmount;
            found = true;
          }
          lineItems = flattenQboIncomeRows(row?.Rows?.Row ?? []).sort(
            (a, b) => b.amount - a.amount,
          );
          break;
        }
      }
      return { revenue: found ? income : null, lineItems };
    },
  });
}

// ── 4. Avg Deal Size — entered Final Credit Items in trailing 12 months ──
function useAvgDealSizeT12M() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const stages = useActivePipelineStageMap();
  const pipelineId = stages.data?.pipelineId ?? null;
  const finalCreditStageId = stages.data?.finalCreditItemsStageId ?? null;
  const finalCreditLabel =
    (finalCreditStageId && stages.data?.stageLabelById.get(finalCreditStageId)) ||
    'Final Credit Items';

  return useQuery({
    queryKey: [
      'exec-top-kpis',
      'avg-deal-size-t12m',
      companyId,
      pipelineId,
      finalCreditStageId,
    ],
    enabled: !!companyId && !!pipelineId && !!finalCreditStageId,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const windowStart = subMonths(now, 12);

      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, deals!inner(company, value)')
        .eq('company_id', companyId)
        .eq('pipeline_id', pipelineId)
        .eq('to_stage', finalCreditStageId)
        .gte('changed_at', windowStart.toISOString())
        .lte('changed_at', now.toISOString());
      if (error) throw error;

      // Dedupe by deal_id — a deal that re-entered the stage twice still
      // contributes one (sum of value, count of 1).
      const seen = new Map<string, ExecKpiDrilldownDeal>();
      for (const row of (data ?? []) as Array<{
        deal_id: string;
        changed_at: string;
        deals: { company: string | null; value: number | null } | null;
      }>) {
        if (isExcludedDealName(row.deals?.company ?? null)) continue;
        const v = Number(row.deals?.value);
        if (!Number.isFinite(v)) continue;
        const candidate: ExecKpiDrilldownDeal = {
          deal_id: row.deal_id,
          company: row.deals?.company ?? '—',
          value: v,
          stage_label: finalCreditLabel,
          occurred_at: row.changed_at,
        };
        const prev = seen.get(row.deal_id);
        if (!prev || (prev.occurred_at && candidate.occurred_at && candidate.occurred_at < prev.occurred_at)) {
          seen.set(row.deal_id, candidate);
        }
      }

      const deals = Array.from(seen.values());
      const sum = deals.reduce((a, b) => a + b.value, 0);
      const count = deals.length;
      deals.sort((a, b) => b.value - a.value);
      return {
        avg: count > 0 ? sum / count : null,
        count,
        sum,
        deals,
      };
    },
  });
}

// ── Public hook ────────────────────────────────────────────────────
export interface ExecutiveTopRowKpis {
  pipelineResolved: boolean;
  totalActiveDealVolume: {
    value: number | null;
    loading: boolean;
    deals: ExecKpiDrilldownDeal[];
  };
  dealsClosedQTD: {
    value: number | null;
    loading: boolean;
    deals: ExecKpiDrilldownDeal[];
  };
  revenueQTD: {
    value: number | null;
    loading: boolean;
    lineItems: ExecRevenueLineItem[];
  };
  avgDealSize: {
    value: number | null;
    loading: boolean;
    deals: ExecKpiDrilldownDeal[];
  };
}

export function useExecutiveTopRowKpis(): ExecutiveTopRowKpis {
  const stages = useActivePipelineStageMap();
  const totalVol = useTotalActiveDealVolume();
  const closedQtd = useDealsClosedQTD();
  const revenueQtd = useRevenueQTDForDebtEntity();
  const avgSize = useAvgDealSizeT12M();

  return useMemo(
    () => ({
      pipelineResolved: !!stages.data?.pipelineId,
      totalActiveDealVolume: {
        value: totalVol.data?.total ?? (totalVol.isLoading ? null : 0),
        loading: stages.isLoading || totalVol.isLoading,
        deals: totalVol.data?.deals ?? [],
      },
      dealsClosedQTD: {
        value: closedQtd.data?.count ?? (closedQtd.isLoading ? null : 0),
        loading: stages.isLoading || closedQtd.isLoading,
        deals: closedQtd.data?.deals ?? [],
      },
      revenueQTD: {
        value: revenueQtd.data?.revenue ?? null,
        loading: revenueQtd.isLoading,
        lineItems: revenueQtd.data?.lineItems ?? [],
      },
      avgDealSize: {
        value: avgSize.data?.avg ?? null,
        loading: stages.isLoading || avgSize.isLoading,
        deals: avgSize.data?.deals ?? [],
      },
    }),
    [stages, totalVol, closedQtd, revenueQtd, avgSize],
  );
}
