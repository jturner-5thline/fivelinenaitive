import { CardContent } from "@/components/ui/card";
import {
  formatMonthlyDelta,
  formatMonthlyValue,
  isMonthlyBreakdownSupported,
  MonthlyResolverResult,
  quarterMonthBuckets,
  resolveDealsMonthly,
  resolveQbMonthly,
  type MonthlyValuePoint,
  type ValueFormat,
} from "@/lib/insights/monthlyStatResolvers";
import { useFinServActiveClients } from "@/hooks/useFinServFinancialMetrics";
import type { MetricWidgetConfig } from "@/contexts/MetricsWidgetsContext";
import { cn } from "@/lib/utils";

interface RawData {
  rawDeals?: any[] | null;
  rawInvoices?: any[] | null;
  rawPayments?: any[] | null;
  rawExpenses?: any[] | null;
}

interface Props {
  widget: MetricWidgetConfig;
  quarter: { start: string; end: string; label: string };
  rawData: RawData;
}

function FinServActiveClientsBreakdown({ widget, quarter }: Props) {
  const period = { start_date: quarter.start, end_date: quarter.end, label: quarter.label };
  const { trend, isLoading } = useFinServActiveClients(period, "monthly");
  const buckets = quarterMonthBuckets(quarter.start, quarter.end);
  const byKey = new Map(trend.map((t) => [t.monthKey, t.count]));
  const points: MonthlyValuePoint[] = buckets.map((b) => ({
    monthKey: b.monthKey,
    monthLabel: b.monthLabel,
    value: byKey.has(b.monthKey) ? byKey.get(b.monthKey)! : null,
  }));
  return (
    <Breakdown
      widget={widget}
      result={{ points, format: "count", note: "Active client count at month end", isLoading }}
    />
  );
}

function Breakdown({
  widget,
  result,
}: {
  widget: MetricWidgetConfig;
  result: MonthlyResolverResult;
}) {
  return (
    <CardContent className="h-full flex flex-col justify-center pt-4 pb-3">
      <p className="text-sm text-muted-foreground text-center mb-2">{widget.title}</p>
      <div className="grid grid-cols-3 gap-2">
        {result.points.map((p, i) => {
          const prior = i > 0 ? result.points[i - 1].value : null;
          const delta = i > 0 ? computeDelta(p.value, prior) : null;
          return (
            <div key={p.monthKey} className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{p.monthLabel}</p>
              <p className="text-lg font-bold text-foreground leading-tight">
                {result.isLoading ? "…" : formatMonthlyValue(p.value, result.format)}
              </p>
              <p
                className={cn(
                  "text-[10px] mt-0.5",
                  delta === null
                    ? "text-muted-foreground/50"
                    : delta > 0
                      ? "text-emerald-500"
                      : delta < 0
                        ? "text-rose-500"
                        : "text-muted-foreground/70",
                )}
              >
                {i === 0
                  ? "—"
                  : result.isLoading
                    ? " "
                    : formatMonthlyDelta(p.value, prior, result.format)}
              </p>
            </div>
          );
        })}
      </div>
      {result.note && (
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">{result.note}</p>
      )}
    </CardContent>
  );
}

function computeDelta(cur: number | null, prior: number | null): number | null {
  if (cur == null || prior == null) return null;
  return cur - prior;
}

export function StatMonthlyBreakdown(props: Props) {
  const { widget, quarter, rawData } = props;
  if (!isMonthlyBreakdownSupported(widget.dataSource)) return null;

  // FinServ sources use dedicated hooks.
  if (widget.dataSource === "finserv-active-client-count") {
    return <FinServActiveClientsBreakdown {...props} />;
  }
  // Other FinServ metrics not yet wired to monthly resolvers — fall back gracefully.
  if (widget.dataSource.startsWith("finserv-")) {
    return (
      <Breakdown
        widget={widget}
        result={{
          points: quarterMonthBuckets(quarter.start, quarter.end).map((b) => ({
            monthKey: b.monthKey,
            monthLabel: b.monthLabel,
            value: null,
          })),
          format: "usd" as ValueFormat,
          note: "Monthly breakdown not yet available for this FinServ metric",
        }}
      />
    );
  }

  const dealResult = resolveDealsMonthly(widget.dataSource, quarter, rawData.rawDeals);
  if (dealResult) return <Breakdown widget={widget} result={dealResult} />;

  const qbResult = resolveQbMonthly(widget.dataSource, quarter, {
    rawInvoices: rawData.rawInvoices,
    rawPayments: rawData.rawPayments,
    rawExpenses: rawData.rawExpenses,
  });
  if (qbResult) return <Breakdown widget={widget} result={qbResult} />;

  return null;
}