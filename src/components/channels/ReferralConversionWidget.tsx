import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { isExcludedDealName } from "@/utils/excludedDeals";
import { sourceConversions, topAndBottom, MIN_CONVERSION_DEALS, type ConversionDeal, type SourceConversion } from "@/lib/referralConversion";

const pct = (r: number) => `${Math.round(r * 100)}%`;

function List({ label, rows }: { label: string; rows: SourceConversion[] }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      {rows.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">Not enough deals yet</p>
      ) : (
        rows.map((r) => (
          <div key={r.source} className="flex items-center justify-between gap-2 py-1 text-xs min-w-0">
            <span className="truncate text-foreground" title={r.source}>{r.source}</span>
            <span className="shrink-0 font-mono text-muted-foreground" title={`${r.converted} of ${r.total} deals`}>
              <span className="text-primary">{pct(r.rate)}</span> · {r.converted}/{r.total}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function Column({ title, tooltip, rows }: { title: string; tooltip: string; rows: SourceConversion[] }) {
  const { top, bottom } = topAndBottom(rows);
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <p className="text-xs font-semibold text-foreground" title={tooltip}>{title}</p>
      <List label="Highest converting" rows={top} />
      <List label="Lowest converting" rows={bottom} />
    </div>
  );
}

export function ReferralConversionWidget() {
  const { company } = useCompany();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["referral_conversion_deals", company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<ConversionDeal[]> => {
      const { data: pipes, error: pe } = await supabase
        .from("deal_pipelines").select("id").eq("company_id", company!.id).eq("is_default", true);
      if (pe) throw pe;
      const active = (pipes || []).map((p) => p.id);
      if (active.length === 0) return [];
      const { data: rows, error } = await supabase
        .from("deals").select("id, company, stage, referred_by, pipeline_id")
        .eq("company_id", company!.id).not("referred_by", "is", null).neq("referred_by", "");
      if (error) throw error;
      const list = (rows || []).filter((r) => !isExcludedDealName(r.company));
      const ids = list.map((r) => r.id);
      const entered = new Map<string, Set<string>>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: h, error: he } = await supabase
          .from("deal_stage_history").select("deal_id, to_stage, to_stage_id, pipeline_id")
          .eq("event_type", "stage_enter").in("deal_id", ids.slice(i, i + 200));
        if (he) throw he;
        for (const r of h || []) {
          if (r.pipeline_id && !active.includes(r.pipeline_id)) continue;
          const s = r.to_stage_id ?? r.to_stage;
          if (!s) continue;
          if (!entered.has(r.deal_id)) entered.set(r.deal_id, new Set());
          entered.get(r.deal_id)!.add(s);
        }
      }
      return list
        .filter((r) => (r.pipeline_id && active.includes(r.pipeline_id)) || entered.has(r.id))
        .map((r) => ({
          id: r.id,
          referredBy: r.referred_by as string,
          // Current stage only counts while the deal sits on the Active pipeline.
          stage: r.pipeline_id && active.includes(r.pipeline_id) ? r.stage : null,
          enteredStages: entered.get(r.id) ?? new Set<string>(),
        }));
    },
  });

  const engagement = useMemo(() => sourceConversions(deals, "pre-credit-needs"), [deals]);
  const closing = useMemo(() => sourceConversions(deals, "funded-invoiced"), [deals]);

  return (
    <section className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">Conversion</p>
        <span className="text-[10px] text-muted-foreground">sources with {MIN_CONVERSION_DEALS}+ deals at NDA</span>
      </div>
      {isLoading ? (
        <p className="py-3 text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:divide-x sm:divide-border">
          <Column title="Engagement" tooltip="NDA / Needs List Sent → Pre-Credit Needs" rows={engagement} />
          <div className="sm:pl-4 min-w-0">
            <Column title="Closing Rate" tooltip="NDA / Needs List Sent → Funded / Invoiced" rows={closing} />
          </div>
        </div>
      )}
    </section>
  );
}
