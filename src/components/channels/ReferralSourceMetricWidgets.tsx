import { AT_RISK_MONTHS, type AtRiskRow } from "./atRiskSources";
import { NewlyAddedSources } from "./NewlyAddedSources";
import { ReferralSourceDealsDialog } from '@/components/partners/ReferralSourceDealsDialog';
import { useState, useMemo, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { useReferralSources } from '@/hooks/useReferralSources';
import { isRemovedForInactivity, previousMonthEnd } from './atRiskSources';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { formatSlug } from '@/utils/dealTypeLabels';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import {
  useReferralSourceMetrics,
  type DrillRow,
  type LeaderboardRow,
} from './useReferralSourceMetrics';

interface ChannelSourceRow {
  id: string;
  name: string;
  company: string | null;
  channel: string;
  deals: { id: string; company: string; stage: string; value: number }[];
}

/** Sources currently shown on the Referral Source Pipeline, each with its company's channel. */
function usePipelineChannelSources() {
  const { referralSources, resolveChannel, isLoading } = useDealReferralSources({ ignoreDateRange: true });
  const { referralSources: manualSources } = useReferralSources();
  const rows = useMemo(() => {
    const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
    const addedByName = new Map<string, string>();
    for (const m of manualSources) {
      if (!m.created_at) continue;
      const k = norm(m.name);
      const prev = addedByName.get(k);
      if (!prev || m.created_at < prev) addedByName.set(k, m.created_at);
    }
    const now = previousMonthEnd();
    const seen = new Set<string>();
    const out: ChannelSourceRow[] = [];
    for (const r of referralSources) {
      seen.add(norm(r.referredBy));
      if (isRemovedForInactivity({
        referredBy: r.referredBy,
        addedAt: addedByName.get(norm(r.referredBy)) ?? null,
        deals: r.deals.filter(d => !!d.ndaEnteredAt).map(d => ({ id: d.id, company: d.company, created_at: d.ndaEnteredAt as string, stage: null })),
      }, now)) continue;
      out.push({
        id: `deal:${r.contactId || r.crmCompanyId || r.referredBy}`,
        name: r.referredBy,
        company: r.companyName,
        channel: r.channelType || 'Other',
        deals: r.deals.map(d => ({ id: d.id, company: d.company, stage: d.stage, value: d.value })),
      });
    }
    for (const m of manualSources) {
      if (seen.has(norm(m.name))) continue;
      if (isRemovedForInactivity({ referredBy: m.name, addedAt: m.created_at ?? null, deals: [] }, now)) continue;
      seen.add(norm(m.name));
      out.push({ id: `manual:${m.id}`, name: m.name, company: m.company || null, channel: resolveChannel(m.name, m.company) || 'Other', deals: [] });
    }
    return out;
  }, [referralSources, manualSources, resolveChannel]);
  return { rows, isLoading };
}

function ChannelMixDonut() {
  const { rows: entries, isLoading } = usePipelineChannelSources();
  const [drill, setDrill] = useState<{ value: string; label: string; color: string } | null>(null);

  const data = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => counts.set(e.channel, (counts.get(e.channel) || 0) + 1));
    return CHANNEL_TYPE_OPTIONS.map((o) => ({
      name: o.label,
      channel: o.value as string,
      color: o.color,
      value: counts.get(o.value) || 0,
    })).filter((d) => d.value > 0);
  }, [entries]);

  const total = data.reduce((s, d) => s + d.value, 0);

  const drillRows = useMemo(
    () => (drill ? entries.filter((e) => e.channel === drill.value) : []),
    [entries, drill],
  );

  const navigate = useNavigate();
  const dealsFor = (e: ChannelSourceRow) => e.deals;

  const openDrill = (name: string) => {
    const d = data.find((x) => x.name === name);
    if (d) setDrill({ value: d.channel, label: d.name, color: d.color });
  };

  return (
    <div>
      
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
              {drill?.label} · {drillRows.length} {drillRows.length === 1 ? 'source' : 'sources'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-border">
            {drillRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No records in this channel.</p>
            ) : (
              drillRows.map((e) => {
                const linked = dealsFor(e);
                return (
                <div key={e.id} className="py-2.5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {e.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.company || 'No company'}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                    {e.deals.length} {e.deals.length === 1 ? 'deal' : 'deals'}
                  </span>
                </div>
                {linked.length > 0 ? (
                  <div className="flex flex-col gap-0.5 pl-3 border-l border-primary/40">
                    {linked.map((d: any) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => navigate(`/deal/${d.id}`)}
                        className="flex items-center justify-between gap-3 text-left text-xs hover:text-primary transition-colors"
                      >
                        <span className="truncate">{d.company || 'Untitled deal'}</span>
                        <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                          <span className="truncate max-w-[160px]">{d.stage ? formatSlug(d.stage) : '—'}</span>
                          <span className="font-mono tabular-nums">{d.value ? formatUSDFromDollars(Number(d.value)) : '—'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="pl-3 text-[11px] text-muted-foreground/60">No deals yet</p>
                )}
                </div>
                );
              })
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
  /** Optional filter controls rendered inside the drill-down only. */
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
  /** Rank by fee revenue rather than deal count / volume */
  byFees?: boolean;
  emptyMessage?: string;
  isLoading?: boolean;
  bare?: boolean;
  subtextOnHover?: boolean;
  /** Open the referral-source contact drilldown instead of the generic list */
  sourceDrill?: boolean;
}

function AtRiskList({ rows, isLoading }: { rows: AtRiskRow[]; isLoading?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 min-w-0 min-h-0 sm:pl-4">
      <ReferralSourceDealsDialog name={open} open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--warning,38_92%_50%))]">
        At Risk · {AT_RISK_MONTHS}+ Mo
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No inactive sources</p>
      ) : (
        <div className="flex flex-col gap-1.5 flex-1 min-h-0 max-h-56 lg:max-h-none overflow-y-auto pr-1">
          {rows.map((r) => (
            <button type="button" onClick={() => setOpen(r.label)} key={r.key} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 h-5 text-left hover:opacity-80 transition-opacity">
              <span className="text-xs text-muted-foreground/90 truncate">{r.label}</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground text-right">
                {r.monthsSince} Mo
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderboardTile({
  label,
  tooltip,
  subtext,
  entries,
  byFees,
  emptyMessage = 'No data in selected timeframe',
  isLoading,
  bare,
  subtextOnHover,
  sourceDrill,
}: LeaderboardTileProps) {
  const [drill, setDrill] = useState<LeaderboardRow | null>(null);

  const ranked = useMemo(() => {
    if (byFees) {
      return [...entries].filter((r) => r.fees > 0).sort((a, b) => b.fees - a.fees).slice(0, 3);
    }
    return [...entries]
      .filter((r) => r.deals > 0 || r.dollars > 0)
      .sort((a, b) => b.deals - a.deals || b.dollars - a.dollars)
      .slice(0, 3);
  }, [entries, byFees]);

  const renderValue = (r: LeaderboardRow) =>
    byFees ? formatCompactUsd(r.fees) : `${r.deals} | ${formatCompactUsd(r.dollars)}`;

  const tile = (
    <div className={bare ? 'flex flex-col gap-2' : 'rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3'}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FFFFFF] leading-tight">
            {label}
          </p>
          {!subtextOnHover && <TooltipProvider delayDuration={150}>
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
          </TooltipProvider>}
        </div>
        {ranked.length > 0 ? (
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
              className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2 h-5 text-left hover:opacity-80 transition-opacity"
            >
              <span className="text-[10px] tabular-nums text-muted-foreground/60">{i + 1}</span>
              <span className="text-xs text-muted-foreground/90 truncate">{r.label}</span>
              <span className="text-xs font-mono font-semibold tabular-nums text-foreground text-right whitespace-nowrap">{renderValue(r)}</span>
            </button>
          ))
        )}
      </div>

      {!subtextOnHover && <p className="text-[11px] text-muted-foreground leading-snug">{subtext}</p>}

      {sourceDrill ? (
        <ReferralSourceDealsDialog name={drill?.label ?? null} open={!!drill} onOpenChange={(o) => !o && setDrill(null)} />
      ) : (
      <DrillDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        title={drill?.label ?? ''}
        rows={drill?.rows ?? []}
      />
      )}
    </div>
  );

  return subtextOnHover ? (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{tile}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-snug">
          {subtext} · {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : tile;
}

export function ReferralSourceMetricWidgets({ sideSlot, belowSourcesSlot }: { sideSlot?: ReactNode; belowSourcesSlot?: ReactNode }) {
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
    atRiskSources,
    hasFeeData,
  } = useReferralSourceMetrics();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        {/* Left column: Referral Sources + KPIs, height driven by Channels */}
        <div className="min-w-0 lg:relative">
        <div className="flex flex-col gap-3 lg:absolute lg:inset-0">
        {belowSourcesSlot ? <div className="shrink-0">{belowSourcesSlot}</div> : null}
        <NewlyAddedSources />
        <section className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3 min-w-0 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">Referral Sources</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:divide-x sm:divide-border lg:flex-1 lg:min-h-0">
            <div className="flex flex-col gap-4 min-w-0 lg:min-h-0 lg:overflow-y-auto">
              <LeaderboardTile
                bare
                label="Most Active"
                tooltip="Referral sources who refer the most deals. Shows deal count | dollar volume."
                subtextOnHover
                subtext="top 3 in selected timeframe"
                entries={sourceLeaderboard}
                sourceDrill
                isLoading={isLoading}
              />
              <LeaderboardTile
                bare
                label="Most Profitable"
                tooltip="Referral sources who have referred the most fee revenue."
                subtextOnHover
                subtext="by fee revenue"
                entries={sourceLeaderboard}
                sourceDrill
                byFees
                emptyMessage={hasFeeData ? 'No fee revenue in selected timeframe' : 'No fee data yet'}
                isLoading={isLoading}
              />
            </div>
            <AtRiskList rows={atRiskSources} isLoading={isLoading} />
          </div>
        </section>
        </div>
        </div>

        {/* Channels: mix donut + active / profitable lists */}
        <section className="rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-3 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">Channels</p>
          <div className="flex flex-col gap-4">
            <ChannelMixDonut />
            <div className="flex flex-col gap-4 min-w-0 border-t border-border pt-4">
              <LeaderboardTile
                bare
                label="Most Active"
                tooltip="Top 3 channels by deals on the board. Shows deals | dollars."
                subtext="top 3 in selected timeframe"
                entries={channelLeaderboard}
                isLoading={isLoading}
              />
              <LeaderboardTile
                bare
                label="Most Profitable"
                tooltip="Top 3 channels by fee revenue generated from their referrals."
                subtext="by fee revenue"
                entries={channelLeaderboard}
                byFees
                emptyMessage={hasFeeData ? 'No fee revenue in selected timeframe' : 'No fee data yet'}
                isLoading={isLoading}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="kpi-row-centered grid grid-cols-2 lg:grid-cols-4 gap-3 text-center [&_.flex]:justify-center [&_.flex]:items-center">
        <div className="contents">
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
        {sideSlot ? <div className="col-span-2 min-w-0">{sideSlot}</div> : null}
      </div>
    </div>
  );
}

