import { useQuery } from "@tanstack/react-query";
import { StatWidgetContent } from "@/components/metrics/SortableMetricWidget";
import { supabase } from "@/integrations/supabase/client";
import {
  FINSERV_PIPELINE_ID,
  ACTIVE_CLIENT_STAGE,
} from "@/hooks/useFinServFinancialMetrics";

/**
 * Same snapshot query the FinServ Financial Metrics dashboard uses to power
 * its Total Clients / Total MRR / Current Pipeline tiles — surfaced here so
 * the Insights "Add Widget" catalog can expose those two metrics directly.
 *
 * Keep query key + stage buckets in sync with
 * `FinServFinancialMetricsDashboard.tsx` (`finserv-pipeline-snapshot`).
 */
function useFinServPipelineSnapshot() {
  return useQuery({
    queryKey: ["finserv-pipeline-snapshot", FINSERV_PIPELINE_ID],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, stage, mrr")
        .eq("pipeline_id", FINSERV_PIPELINE_ID);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string; stage: string | null; mrr: number | string | null }>;
      const TERMINAL = new Set(["fs-churned", "fs-closed-lost", "fs-in-development"]);
      let totalClients = 0;
      let totalMrr = 0;
      for (const r of rows) {
        const stage = r.stage ?? "";
        if (stage === ACTIVE_CLIENT_STAGE) totalClients += 1;
        if (!TERMINAL.has(stage)) totalMrr += Number(r.mrr ?? 0);
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
}: {
  title: string;
  color: string;
}) {
  const { data, isLoading } = useFinServPipelineSnapshot();
  return (
    <StatWidgetContent
      title={title}
      value={isLoading ? "…" : `${data?.totalClients ?? 0}`}
      subtitle='Deals in "Active Client" stage of the FinServ pipeline'
      icon="pipeline"
      color={color}
    />
  );
}

export function FinServTotalMrrStat({
  title,
  color,
}: {
  title: string;
  color: string;
}) {
  const { data, isLoading } = useFinServPipelineSnapshot();
  return (
    <StatWidgetContent
      title={title}
      value={isLoading ? "…" : formatCurrency(data?.totalMrr ?? 0)}
      subtitle="Sum of MRR across active FinServ pipeline deals"
      icon="dollar"
      color={color}
    />
  );
}
