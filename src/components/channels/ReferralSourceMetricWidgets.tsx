import { useState, useMemo } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { useChannelEntries } from '@/hooks/useChannelEntries';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function ChannelMixDonut() {
  const { data: entries = [], isLoading } = useChannelEntries();
  const [drill, setDrill] = useState<{ value: string; label: string; color: string } | null>(null);

  const data = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => {
      const key = String(e.channel_type ?? 'Other');
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return CHANNEL_TYPE_OPTIONS.map((o) => ({
      name: o.label,
      channel: o.value as string,
      color: o.color,
      value: counts.get(o.value) || 0,
    })).filter((d) => d.value > 0);
  }, [entries]);

  const total = data.reduce((s, d) => s + d.value, 0);

  const drillRows = useMemo(
    () => (drill ? entries.filter((e) => String(e.channel_type) === drill.value) : []),
    [entries, drill],
  );

  const openDrill = (name: string) => {
    const d = data.find((x) => x.name === name);
    if (d) setDrill({ value: d.channel, label: d.name, color: d.color });
  };

  return (
    <div className="rounded-lg border border-border bg-transparent p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground leading-tight">
          Channel Mix
        </p>
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">{total} total</span>
      </div>
      <div className="h-[260px] w-full">
        {isLoading || total === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {isLoading ? 'Loading…' : 'No channel data yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={2}
                stroke="none"
                onClick={(d: any) => openDrill(d?.name ?? d?.payload?.name)}
                className="cursor-pointer"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} className="cursor-pointer" />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) => [
                  `${v} (${total ? Math.round((v / total) * 100) : 0}%)`,
                  n,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }}
                onClick={(e: any) => openDrill(e?.value)}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug mt-1">
        Share of channel partners by type — click a slice to drill down
      </p>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: drill?.color }}
              />
              {drill?.label} · {drillRows.length} {drillRows.length === 1 ? 'record' : 'records'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-border">
            {drillRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No records in this channel.</p>
            ) : (
              drillRows.map((e) => (
                <div key={e.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {e.crm_company?.name || e.contact?.full_name || 'Untitled'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        e.crm_company?.name && e.contact?.full_name ? e.contact.full_name : null,
                        e.contact?.job_title,
                        e.contact?.email || e.crm_company?.main_contact_email,
                        e.crm_company?.domain,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                    {e.crm_company?.name ? 'Company' : 'Contact'}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

      <div className="w-full lg:w-1/2">
        <ChannelMixDonut />
      </div>
    </div>
  );
}
