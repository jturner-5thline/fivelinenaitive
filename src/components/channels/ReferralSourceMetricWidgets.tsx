interface MetricTileProps {
  label: string;
  value: string;
  subtext: string;
}

function MetricTile({ label, value, subtext }: MetricTileProps) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground leading-tight">
          {label}
        </p>
        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">Drill →</span>
      </div>
      <p className="text-3xl font-bold tabular-nums leading-none text-[hsl(var(--chart-2))]">{value}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">{subtext}</p>
    </div>
  );
}

export function ReferralSourceMetricWidgets() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <MetricTile
        label="Meetings w/ Existing Referral Sources"
        value="0"
        subtext="meetings held in selected timeframe"
      />
      <MetricTile
        label="Deals on Board from Referral Sources"
        value="0"
        subtext="deals sourced in selected timeframe"
      />
      <MetricTile
        label="Dollars on Board from Referral Sources"
        value="$0"
        subtext="deal value sourced in selected timeframe"
      />
      <MetricTile
        label="New Referral Sources Added"
        value="0"
        subtext="added in selected timeframe"
      />
    </div>
  );
}
