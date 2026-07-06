import { useQuery } from "@tanstack/react-query";
import { StatWidgetContent } from "@/components/metrics/SortableMetricWidget";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import {
  FINSERV_PIPELINE_ID,
  ACTIVE_CLIENT_STAGE,
} from "@/hooks/useFinServFinancialMetrics";
import { getTimePeriodRange, getTimePeriodLabel } from "@/lib/timePeriodUtils";
import type { TimePeriod } from "@/contexts/MetricsWidgetsContext";

/**
 * Period-aware FinServ pipeline snapshot — mirrors the "Total Clients" and
 * "Total MRR" tiles on the FinServ Financial Metrics dashboard, but resolves
 * each deal's stage AS OF the selected period's end date (same `stageAt`
 * technique used by `useFinServActiveClients`) so the Insights report/period
 * selector actually moves the values.
 *
 *  - Active Client Count = deals whose stage at period-end was
 *    `fs-closed-won` (labelled "Active Client").
 *  - Total MRR = sum of CURRENT `deals.mrr` for deals whose stage at
 *    period-end was non-terminal (not churned / closed-lost / in-development).
 *    `deals.mrr` is a live snapshot column, so historical MRR values are not
 *    available; using the current value is the same source-of-truth the
 *    FinServ dashboard's Total MRR tile reads from.
 *
 * When no period is selected, falls back to a pure "current" snapshot which
 * matches the FinServ dashboard's default view exactly.
 */
const TERMINAL_STAGES = new Set(["fs-churned", "fs-closed-lost", "fs-in-development"]);

function useFinServPipelineSnapshot(timePeriod?: TimePeriod) {
  const { user } = useAuth();
  const { company } = useCompany();
  const range = getTimePeriodRange(timePeriod);
  const endIso = range?.end ? range.end.toISOString() : null;

  return useQuery({
    queryKey: [
      "finserv-pipeline-snapshot-insights",
      user?.id ?? null,
      company?.id ?? null,
      FINSERV_PIPELINE_ID,
      endIso,
    ],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      let dealsQ = supabase
        .from("deals")
        .select("id, stage, mrr, created_at")
        .eq("pipeline_id", FINSERV_PIPELINE_ID);
      if (company?.id) dealsQ = dealsQ.eq("company_id", company.id);
      const { data: deals, error: dealsErr } = await dealsQ;
      if (dealsErr) throw dealsErr;
      const dealList = (deals ?? []) as Array<{
        id: string;
        stage: string | null;
        mrr: number | string | null;
        created_at: string;
      }>;

      // Current snapshot (no period → matches source dashboard exactly).
      if (!endIso) {
        let totalClients = 0;
        let totalMrr = 0;
        for (const d of dealList) {
          const stage = d.stage ?? "";
          if (stage === ACTIVE_CLIENT_STAGE) totalClients += 1;
          if (!TERMINAL_STAGES.has(stage)) totalMrr += Number(d.mrr ?? 0);
        }
        return { totalClients, totalMrr };
      }

      // Period-aware: reconstruct stage at end-of-period from history.
      let histQ = supabase
        .from("deal_stage_history")
        .select("deal_id, to_stage, changed_at")
        .eq("pipeline_id", FINSERV_PIPELINE_ID)
        .order("changed_at", { ascending: true });
      if (company?.id) histQ = histQ.eq("company_id", company.id);
      const { data: history, error: histErr } = await histQ;
      if (histErr) throw histErr;

      const historyByDeal = new Map<string, Array<{ to_stage: string | null; changed_at: string }>>();
      for (const h of history ?? []) {
        const arr = historyByDeal.get(h.deal_id) ?? [];
        arr.push({ to_stage: h.to_stage, changed_at: h.changed_at });
        historyByDeal.set(h.deal_id, arr);
      }

      const t = new Date(endIso);
      const today = new Date();
      const effective = t > today ? today : t;

      const stageAt = (deal: { id: string; stage: string | null; created_at: string }) => {
        const created = new Date(deal.created_at);
        if (created > effective) return null;
        const hist = historyByDeal.get(deal.id);
        if (hist && hist.length > 0) {
          let last: string | null = null;
          for (const h of hist) {
            if (new Date(h.changed_at) <= effective) last = h.to_stage;
            else break;
          }
          if (last !== null) return last;
        }
        return deal.stage ?? null;
      };

      let totalClients = 0;
      let totalMrr = 0;
      for (const d of dealList) {
        const stage = stageAt(d);
        if (!stage) continue;
        if (stage === ACTIVE_CLIENT_STAGE) totalClients += 1;
        if (!TERMINAL_STAGES.has(stage)) totalMrr += Number(d.mrr ?? 0);
      }
      return { totalClients, totalMrr };
    },
  });
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function FinServActiveClientCountStat({
  title,
  color,
  timePeriod,
}: {
  title: string;
  color: string;
  timePeriod?: TimePeriod;
}) {
  const { data, isLoading } = useFinServPipelineSnapshot(timePeriod);
  const periodLabel = getTimePeriodLabel(timePeriod);
  return (
    <StatWidgetContent
      title={title}
      value={isLoading ? "…" : `${data?.totalClients ?? 0}`}
      subtitle={
        periodLabel
          ? `Active Client stage · as of ${periodLabel}`
          : 'Deals in "Active Client" stage of the FinServ pipeline'
      }
      icon="pipeline"
      color={color}
    />
  );
}

export function FinServTotalMrrStat({
  title,
  color,
  timePeriod,
}: {
  title: string;
  color: string;
  timePeriod?: TimePeriod;
}) {
  const { data, isLoading } = useFinServPipelineSnapshot(timePeriod);
  const periodLabel = getTimePeriodLabel(timePeriod);
  return (
    <StatWidgetContent
      title={title}
      value={isLoading ? "…" : formatCurrency(data?.totalMrr ?? 0)}
      subtitle={
        periodLabel
          ? `Sum of MRR across active FinServ deals · as of ${periodLabel}`
          : "Sum of MRR across active FinServ pipeline deals"
      }
      icon="dollar"
      color={color}
    />
  );
}
