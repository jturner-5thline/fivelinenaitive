import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { StatWidgetContent } from "@/components/metrics/SortableMetricWidget";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useFinServTotalRevenue } from "@/hooks/useFinServFinancialMetrics";
import { buildBuckets } from "@/lib/insightsTimeRange";
import { getTimePeriodRange, getTimePeriodLabel, type TimePeriod } from "@/lib/timePeriodUtils";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Stat-card wrapper that surfaces the FinServ "Revenue per Hour" and
 * "Profit per Hour" metrics on the Insights "Add Widget" catalog.
 *
 * Numerator comes from the same FinServ P&L snapshots the FinServ Financial
 * Metrics dashboard uses (`useFinServTotalRevenue`). Denominator (hours) is
 * read from the shared manual-input row (`metric_key = 'revenue_per_hour_hours'`)
 * that the FinServ dashboard's per-hour widget writes to — so a single hours
 * entry drives both surfaces.
 */
export function FinServPerHourStat({
  title,
  color,
  mode,
  timePeriod,
}: {
  title: string;
  color: string;
  mode: "revenue" | "profit";
  timePeriod?: TimePeriod;
}) {
  const { company } = useCompany();
  const range = getTimePeriodRange(timePeriod);
  const now = new Date();
  const end = range?.end ?? endOfMonth(now);
  const start = range?.start ?? startOfMonth(subMonths(end, 11));
  const period = useMemo(
    () => ({
      start_date: format(startOfMonth(start), "yyyy-MM-dd"),
      end_date: format(endOfMonth(end), "yyyy-MM-dd"),
      label: "per-hour-period",
    }),
    [start.getTime(), end.getTime()],
  );

  const monthKeys = useMemo(
    () => buildBuckets(period.start_date, period.end_date, "monthly").map((b) => b.key),
    [period.start_date, period.end_date],
  );

  const { total, operatingProfit, isLoading: revLoading } = useFinServTotalRevenue(period, "monthly");
  const numerator = mode === "revenue" ? total : operatingProfit;

  const { data: totalHours = 0, isLoading: hoursLoading } = useQuery({
    queryKey: ["finserv-per-hour-hours", company?.id ?? null, monthKeys.join("|")],
    enabled: monthKeys.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("metric_manual_inputs")
        .select("value")
        .eq("metric_key", "revenue_per_hour_hours")
        .in("month_key", monthKeys);
      q = company?.id ? q.eq("company_id", company.id) : q.is("company_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.value ?? 0), 0);
    },
  });

  const loading = revLoading || hoursLoading;
  const rate = totalHours > 0 ? numerator / totalHours : null;
  const periodLabel = getTimePeriodLabel(timePeriod) ?? "Trailing 12 months";

  return (
    <StatWidgetContent
      title={title}
      value={loading ? "…" : rate != null ? `${formatCurrency(rate)}/hr` : "—"}
      subtitle={
        loading
          ? "Loading…"
          : totalHours > 0
            ? `${formatCurrency(numerator)} ÷ ${totalHours.toLocaleString()} hrs · ${periodLabel}`
            : `No hours entered · ${periodLabel}`
      }
      icon={mode === "revenue" ? "dollar" : "trending-up"}
      color={color}
    />
  );
}