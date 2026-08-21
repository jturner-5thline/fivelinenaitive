import { useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

type ToggleMode = 'deals' | 'dollars';

interface LeaderboardTileProps {
  label: string;
  tooltip: string;
  subtext: string;
  /** Show the deals/dollars toggle */
  toggleable?: boolean;
}

function LeaderboardTile({ label, tooltip, subtext, toggleable }: LeaderboardTileProps) {
  const [mode, setMode] = useState<ToggleMode>('deals');
  const rows = [1, 2, 3];

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground leading-tight">
            {label}
          </p>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground shrink-0">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-snug">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {toggleable ? (
          <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
            {(['deals', 'dollars'] as ToggleMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 text-[10px] capitalize transition-colors ${
                  mode === m
                    ? 'bg-[hsl(var(--chart-2)/0.18)] text-[hsl(var(--chart-2))]'
                    : 'text-muted-foreground/70 hover:text-muted-foreground'
                }`}
              >
                {m === 'deals' ? '#' : '$'}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">Drill →</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((rank) => (
          <div key={rank} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] tabular-nums text-muted-foreground/60 w-3">{rank}</span>
              <span className="text-xs text-muted-foreground/70 truncate">—</span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-[hsl(var(--chart-2))]">
              {mode === 'dollars' && toggleable ? '$0' : '0'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">{subtext}</p>
    </div>
  );
}

export function ReferralSourceMetricWidgets() {
  return (
    <div className="flex flex-col gap-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <LeaderboardTile
          label="Most Active Referral Sources"
          tooltip="The referral sources who refer the most deals or dollars. Toggle between deal count (#) and dollar volume ($)."
          subtext="top 3 in selected timeframe"
          toggleable
        />
        <LeaderboardTile
          label="Most Profitable Referral Sources"
          tooltip="The referral sources who have referred the most revenue-generating activity to us."
          subtext="by fee revenue in selected timeframe"
        />
        <LeaderboardTile
          label="Most Active Channels"
          tooltip="Top 3 channels (banks, service providers, etc.) by count of deals on the board. Toggle for dollars on the board."
          subtext="top 3 channels in selected timeframe"
          toggleable
        />
        <LeaderboardTile
          label="Most Profitable Channels"
          tooltip="Top 3 channels (banks, service providers, etc.) by fee revenue generated from their referrals."
          subtext="by fee revenue in selected timeframe"
        />
      </div>
    </div>
  );
}
