import { useState, useMemo, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { useChannelEntries } from '@/hooks/useChannelEntries';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useReferralSourceMetrics,
  type DrillRow,
  type LeaderboardRow,
} from './useReferralSourceMetrics';

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
  rows: DrillRow[];
  drillTitle: string;
  isLoading?: boolean;
  /** Enables per-row "Remove" in the drill-down. */
  onRemoveRow?: (id: string) => void;
  removedRows?: DrillRow[];
  onRestoreRow?: (id: string) => void;
  isMutating?: boolean;
  /** Optional filter controls rendered on the tile and inside the drill-down. */
  filterBar?: ReactNode;
}


function MetricTile({
  label,
  value,
  subtext,
  rows,
  drillTitle,
  isLoading,
  onRemoveRow,
  removedRows,
  onRestoreRow,
  isMutating,
  filterBar,
}: MetricTileProps) {
  const [open, setOpen] = useState(false);
  const canDrill = rows.length > 0 || (removedRows?.length ?? 0) > 0;
  return (
    <>
      <div
        className={`rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-2 ${
          canDrill ? 'cursor-pointer transition-colors hover:border-[hsl(var(--chart-2)/0.5)] hover:bg-card/80' : ''
        }`}
        role={canDrill ? 'button' : undefined}
        tabIndex={canDrill ? 0 : undefined}
        onClick={canDrill ? () => setOpen(true) : undefined}
        onKeyDown={
          canDrill
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FFFFFF] leading-tight">
            {label}
          </p>
          {canDrill ? (
            <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">Drill →</span>
          ) : null}
        </div>
        <p className="text-3xl font-bold tabular-nums leading-none text-[#FFFFFF]">
          {isLoading ? '—' : value}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {isLoading ? 'Loading…' : canDrill ? subtext : 'No data in selected timeframe'}
        </p>
        {filterBar ? (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {filterBar}
          </div>
        ) : null}
      </div>
      <DrillDialog
        open={open}
        onOpenChange={setOpen}
        title={drillTitle}
        rows={rows}
        onRemoveRow={onRemoveRow}
        removedRows={removedRows}
        onRestoreRow={onRestoreRow}
        isMutating={isMutating}
        filterBar={filterBar}
      />
    </>
  );
}

function DrillDialog({
  open,
  onOpenChange,
  title,
  rows,
  onRemoveRow,
  removedRows,
  onRestoreRow,
  isMutating,
  filterBar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  rows: DrillRow[];
  onRemoveRow?: (id: string) => void;
  removedRows?: DrillRow[];
  onRestoreRow?: (id: string) => void;
  isMutating?: boolean;
  filterBar?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {title} · {rows.length} {rows.length === 1 ? 'record' : 'records'}
          </DialogTitle>
        </DialogHeader>
        {filterBar ? <div className="pb-2">{filterBar}</div> : null}
        <div className="flex flex-col divide-y divide-border">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No records.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="py-2.5 min-w-0 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.primary}</p>
                  {r.secondary ? (
                    <p className="text-xs text-muted-foreground truncate">{r.secondary}</p>
                  ) : null}
                </div>
                {onRemoveRow ? (
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => onRemoveRow(r.id)}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>

        {onRestoreRow && (removedRows?.length ?? 0) > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
              Removed from count · {removedRows!.length}
            </p>
            <div className="flex flex-col divide-y divide-border">
              {removedRows!.map((r) => (
                <div key={r.id} className="py-2 min-w-0 flex items-start justify-between gap-3 opacity-70">
                  <div className="min-w-0">
                    <p className="text-sm truncate line-through">{r.primary}</p>
                    {r.secondary ? (
                      <p className="text-xs text-muted-foreground truncate">{r.secondary}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => onRestoreRow(r.id)}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );

}

type ToggleMode = 'deals' | 'dollars';

function formatCompactUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

interface LeaderboardTileProps {
  label: string;
  tooltip: string;
  subtext: string;
  entries: LeaderboardRow[];
  /** Show the deals/dollars toggle */
  toggleable?: boolean;
  /** Rank by fee revenue rather than deal count / volume */
  byFees?: boolean;
  emptyMessage?: string;
  isLoading?: boolean;
}

function LeaderboardTile({
  label,
  tooltip,
  subtext,
  entries,
  toggleable,
  byFees,
  emptyMessage = 'No data in selected timeframe',
  isLoading,
}: LeaderboardTileProps) {
  const [mode, setMode] = useState<ToggleMode>('deals');
  const [drill, setDrill] = useState<LeaderboardRow | null>(null);

  const ranked = useMemo(() => {
    const metric = (r: LeaderboardRow) =>
      byFees ? r.fees : mode === 'dollars' ? r.dollars : r.deals;
    return [...entries].filter((r) => metric(r) > 0).sort((a, b) => metric(b) - metric(a)).slice(0, 3);
  }, [entries, mode, byFees]);

  const renderValue = (r: LeaderboardRow) =>
    byFees ? formatCompactUsd(r.fees) : mode === 'dollars' ? formatCompactUsd(r.dollars) : String(r.deals);

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FFFFFF] leading-tight">
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
        ) : ranked.length > 0 ? (
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">Drill →</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading…</p>
        ) : ranked.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{emptyMessage}</p>
        ) : (
          ranked.map((r, i) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setDrill(r)}
              className="flex items-center justify-between gap-2 text-left hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] tabular-nums text-muted-foreground/60 w-3">{i + 1}</span>
                <span className="text-xs text-muted-foreground/90 truncate">{r.label}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-[#FFFFFF]">{renderValue(r)}</span>
            </button>
          ))
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">{subtext}</p>

      <DrillDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        title={drill?.label ?? ''}
        rows={drill?.rows ?? []}
      />
    </div>
  );
}

export function ReferralSourceMetricWidgets({ sideSlot }: { sideSlot?: ReactNode }) {
  const {
    isLoading,
    meetingCount,
    meetingRows,
    removedMeetingRows,
    removeMeeting,
    restoreMeeting,
    isUpdatingMeetingExclusions,
    meetingOwnerOptions,
    meetingOwnerFilter,
    setMeetingOwnerFilter,
    newSourceCount,
    newSourceRows,
    sourceLeaderboard,
    channelLeaderboard,
    hasFeeData,
  } = useReferralSourceMetrics();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricTile
          label="Meetings w/ Existing Referral Sources"
          value={String(meetingCount)}
          subtext="meetings held in selected timeframe"
          rows={meetingRows}
          drillTitle="Meetings with referral sources"
          isLoading={isLoading}
          onRemoveRow={removeMeeting}
          removedRows={removedMeetingRows}
          onRestoreRow={restoreMeeting}
          isMutating={isUpdatingMeetingExclusions}
          filterBar={
            meetingOwnerOptions.length > 1 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setMeetingOwnerFilter([])}
                  className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                    meetingOwnerFilter.length === 0
                      ? 'border-[hsl(var(--chart-2)/0.6)] text-[#FFFFFF] bg-[hsl(var(--chart-2)/0.15)]'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All users
                </button>
                {meetingOwnerOptions.map((o) => {
                  const active = meetingOwnerFilter.includes(o.email);
                  return (
                    <button
                      key={o.email}
                      type="button"
                      title={o.email}
                      onClick={() =>
                        setMeetingOwnerFilter(
                          active
                            ? meetingOwnerFilter.filter((e) => e !== o.email)
                            : [...meetingOwnerFilter, o.email],
                        )
                      }
                      className={`rounded-md border px-2 py-0.5 text-[11px] capitalize transition-colors ${
                        active
                          ? 'border-[hsl(var(--chart-2)/0.6)] text-[#FFFFFF] bg-[hsl(var(--chart-2)/0.15)]'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {o.label} · {o.count}
                    </button>
                  );
                })}
              </div>
            ) : null
          }
        />
        <MetricTile
          label="New Referral Sources Added"
          value={String(newSourceCount)}
          subtext="added in selected timeframe"
          rows={newSourceRows}
          drillTitle="New referral sources"
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <LeaderboardTile
          label="Most Active Referral Sources"
          tooltip="The referral sources who refer the most deals or dollars. Toggle between deal count (#) and dollar volume ($)."
          subtext="top 3 in selected timeframe"
          entries={sourceLeaderboard}
          toggleable
          isLoading={isLoading}
        />
        <LeaderboardTile
          label="Most Profitable Referral Sources"
          tooltip="The referral sources who have referred the most revenue-generating activity to us."
          subtext="by fee revenue in selected timeframe"
          entries={sourceLeaderboard}
          byFees
          emptyMessage={hasFeeData ? 'No fee revenue in selected timeframe' : 'No fee data yet'}
          isLoading={isLoading}
        />
        <LeaderboardTile
          label="Most Active Channels"
          tooltip="Top 3 channels (banks, service providers, etc.) by count of deals on the board. Toggle for dollars on the board."
          subtext="top 3 channels in selected timeframe"
          entries={channelLeaderboard}
          toggleable
          isLoading={isLoading}
        />
        <LeaderboardTile
          label="Most Profitable Channels"
          tooltip="Top 3 channels (banks, service providers, etc.) by fee revenue generated from their referrals."
          subtext="by fee revenue in selected timeframe"
          entries={channelLeaderboard}
          byFees
          emptyMessage={hasFeeData ? 'No fee revenue in selected timeframe' : 'No fee data yet'}
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <ChannelMixDonut />
        {sideSlot ? <div className="min-w-0">{sideSlot}</div> : null}
      </div>
    </div>
  );
}

