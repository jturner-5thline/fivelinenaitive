import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { isExcludedDealName } from "@/utils/excludedDeals";
import { formatUSDFromDollars } from "@/lib/formatters/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  sourceConversions, sourceCohortDeals, topAndBottom, MIN_CONVERSION_DEALS, inTrailingYear, closingRateDeals,
  type ConversionDeal, type SourceConversion, type ConversionMetric,
} from "@/lib/referralConversion";
import { useInsightsTimeframeOptional } from "@/contexts/InsightsTimeframeContext";
import { ttmAnchorFromTimeframeEnd } from "@/lib/salesBdActivePipelineConversion";
import { earliestNdaEntries, type NdaHistoryRow } from "@/lib/referralNdaEntry";

const pct = (r: number) => `${Math.round(r * 100)}%`;
const humanize = (s: string) =>
  s.includes("-") && s === s.toLowerCase()
    ? s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : s;

type Drill = { source: string; target: string; title: string; targetLabel: string };

function List({ label, rows, onPick, metric }: { label: string; rows: SourceConversion[]; onPick: (s: string) => void; metric: ConversionMetric }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      {rows.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">Not enough deals yet</p>
      ) : (
        rows.map((r) => (
          <button
            type="button"
            key={r.source}
            onClick={() => onPick(r.source)}
            className="flex items-center justify-between gap-2 py-1 text-xs min-w-0 text-left rounded hover:text-primary transition-colors"
          >
            <span className="truncate text-foreground hover:text-primary" title={r.source}>{r.source}</span>
            <span className="shrink-0 font-mono text-muted-foreground" title={`${r.converted} of ${r.total} deals`}>
              {metric === "count" ? (
                <><span className="text-primary">{r.converted}</span> · {pct(r.rate)}</>
              ) : (
                <><span className="text-primary">{pct(r.rate)}</span> · {r.converted}/{r.total}</>
              )}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function Column({ title, tooltip, rows, onPick, metric }: { title: string; tooltip: string; rows: SourceConversion[]; onPick: (s: string) => void; metric: ConversionMetric }) {
  const { top, bottom } = topAndBottom(rows, 3, metric);
  const word = metric === "count" ? "Most converted deals" : "Highest converting";
  const low = metric === "count" ? "Least converted deals" : "Lowest converting";
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <p className="text-xs font-semibold text-foreground" title={tooltip}>{title}</p>
      <List label={word} rows={top} onPick={onPick} metric={metric} />
      <List label={low} rows={bottom} onPick={onPick} metric={metric} />
    </div>
  );
}

export function ReferralConversionWidget() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [drill, setDrill] = useState<Drill | null>(null);
  const [metric, setMetric] = useState<ConversionMetric>("rate");

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["referral_conversion_deals", company?.id, "ttm2"],
    enabled: !!company?.id,
    queryFn: async (): Promise<(ConversionDeal & { closedWonAt: string | null })[]> => {
      const { data: pipes, error: pe } = await supabase
        .from("deal_pipelines").select("id").eq("company_id", company!.id).eq("is_default", true);
      if (pe) throw pe;
      const active = (pipes || []).map((p) => p.id);
      if (active.length === 0) return [];
      const { data: rows, error } = await supabase
        .from("deals").select("id, company, stage, value, referred_by, pipeline_id")
        .eq("company_id", company!.id).not("referred_by", "is", null).neq("referred_by", "");
      if (error) throw error;
      const list = (rows || []).filter((r) => !isExcludedDealName(r.company));
      const ids = list.map((r) => r.id);
      const entered = new Map<string, Set<string>>();
      const history: NdaHistoryRow[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: h, error: he } = await supabase
          .from("deal_stage_history").select("deal_id, to_stage, to_stage_id, pipeline_id, changed_at")
          .eq("event_type", "stage_enter").in("deal_id", ids.slice(i, i + 200));
        if (he) throw he;
        for (const r of h || []) {
          history.push(r as NdaHistoryRow);
          if (r.pipeline_id && !active.includes(r.pipeline_id)) continue;
          const s = r.to_stage_id ?? r.to_stage;
          if (!s) continue;
          if (!entered.has(r.deal_id)) entered.set(r.deal_id, new Set());
          entered.get(r.deal_id)!.add(s);
        }
      }
      const closedWon = new Map<string, string>();
      for (const r of history) {
        if (!r.changed_at || (r.to_stage_id ?? r.to_stage) !== "closed-won") continue;
        if (r.pipeline_id && !active.includes(r.pipeline_id)) continue;
        const prev = closedWon.get(r.deal_id);
        if (!prev || r.changed_at > prev) closedWon.set(r.deal_id, r.changed_at);
      }
      const ndaEntries = earliestNdaEntries(history, new Set(active), new Map(list.map((r) => [r.id, r.pipeline_id])));
      const all = list
        .filter((r) => (r.pipeline_id && active.includes(r.pipeline_id)) || entered.has(r.id))
        .map((r) => ({
          id: r.id,
          referredBy: r.referred_by as string,
          // Current stage only counts while the deal sits on the Active pipeline.
          stage: r.pipeline_id && active.includes(r.pipeline_id) ? r.stage : null,
          enteredStages: entered.get(r.id) ?? new Set<string>(),
          name: r.company,
          value: r.value as number | null,
          displayStage: r.stage,
          ndaEnteredAt: ndaEntries.get(r.id) ?? null,
          closedWonAt: closedWon.get(r.id) ?? null,
        }));
      return all;
    },
  });

  // Engagement: deal must have ENTERED NDA / Needs List Sent within the last 12 months.
  const headerEnd = useInsightsTimeframeOptional()?.timeframe?.end;
  const asOf = useMemo(() => ttmAnchorFromTimeframeEnd(headerEnd), [headerEnd]);
  const engagementDeals = useMemo(() => inTrailingYear(deals, asOf), [deals, asOf]);
  // Closing Rate: deals that entered NDA or Closed-Won within the last 12 months.
  const closingDeals = useMemo(() => closingRateDeals(deals, asOf), [deals, asOf]);
  const engagement = useMemo(() => sourceConversions(engagementDeals, "final-credit-items"), [engagementDeals]);
  const closing = useMemo(() => sourceConversions(closingDeals, "closed-won"), [closingDeals]);
  const drillRows = useMemo(
    () => (drill ? sourceCohortDeals(drill.target === "closed-won" ? closingDeals : engagementDeals, drill.source, drill.target).sort((a, b) => Number(b.converted) - Number(a.converted)) : []),
    [drill, engagementDeals, closingDeals],
  );
  const convertedCount = drillRows.filter((r) => r.converted).length;

  return (
    <section className="h-full rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">Conversion</p>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">trailing 12 months · sources with {MIN_CONVERSION_DEALS}+ deals entering NDA</span>
          <div role="group" aria-label="Show as" className="flex rounded-md border border-border p-0.5">
            {(["rate", "count"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                title={m === "rate" ? "Conversion rate" : "Number of converted deals"}
                className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "rate" ? "%" : "#"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {isLoading ? (
        <p className="py-3 text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:divide-x sm:divide-border">
          <Column
            title="Engagement" tooltip="NDA / Needs List Sent → Final Credit Items" rows={engagement} metric={metric}
            onPick={(s) => setDrill({ source: s, target: "final-credit-items", title: "Engagement", targetLabel: "Final Credit Items" })}
          />
          <div className="sm:pl-4 min-w-0">
            <Column
              title="Closing Rate" tooltip="NDA / Needs List Sent → Closed-Won" rows={closing} metric={metric}
              onPick={(s) => setDrill({ source: s, target: "closed-won", title: "Closing Rate", targetLabel: "Closed-Won" })}
            />
          </div>
        </div>
      )}

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill?.source}</DialogTitle>
            <DialogDescription>
              {drill?.title}: {convertedCount} of {drillRows.length} deals reached {drill?.targetLabel} from NDA / Needs List Sent
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-border">
            {drillRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No deals found.</p>
            ) : (
              drillRows.map(({ deal, converted }) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => navigate(`/deal/${deal.id}`)}
                  className="py-2.5 flex items-center justify-between gap-3 text-left text-sm hover:text-primary transition-colors"
                >
                  <span className="truncate">{deal.name || "Untitled deal"}</span>
                  <span className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span className="truncate max-w-[160px]">{deal.displayStage ? humanize(deal.displayStage) : "—"}</span>
                    <span className="font-mono tabular-nums">{deal.value ? formatUSDFromDollars(Number(deal.value)) : "—"}</span>
                    <span className={converted ? "text-primary" : "text-muted-foreground"}>
                      {converted ? "Converted" : "Not yet"}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
