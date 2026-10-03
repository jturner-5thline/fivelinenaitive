import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AddHoursButton } from '@/components/deal/DealHoursEntriesEditor';
import { useCompanyFeesVisibility, formatComputedTotal } from '@/hooks/useCompanyFeesVisibility';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip as RTooltip } from 'recharts';

interface DealHoursFeesCardProps {
  deal: any;
  updateDeal: (field: string, value: any) => void;
  onHoursChanged?: () => void;
}

interface WeekRow { week_start_date: string; hours: number; phase: string }

/**
 * KPI-style Hours & Fees widget: current Revenue / Hour + weekly hours chart.
 * Clicking opens a dialog with the full hours & fees inputs.
 */
export function DealHoursFeesCard({ deal, updateDeal, onHoursChanged }: DealHoursFeesCardProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WeekRow[]>([]);

  const loadWeeks = useCallback(async () => {
    const { data } = await supabase
      .from('weekly_time_entries')
      .select('week_start_date, hours, phase')
      .eq('deal_id', deal.id)
      .order('week_start_date', { ascending: true });
    setRows((data ?? []) as WeekRow[]);
  }, [deal.id]);

  useEffect(() => { void loadWeeks(); }, [loadWeeks]);

  const pre = deal.preSigningHours ?? 0;
  const post = deal.postSigningHours ?? 0;
  const totalHours = pre + post;
  const totalFee = deal.totalFee ?? 0;
  const hasHours = totalHours > 0;
  const hasFees = totalFee > 0 || (deal.retainerFee ?? 0) > 0 || (deal.milestoneFee ?? 0) > 0 || (deal.successFeePercent ?? 0) > 0;

  const emptyMsg = !hasHours && !hasFees
    ? 'No Hours or Fees Logged Yet'
    : !hasHours ? 'No Hours Logged Yet'
    : !hasFees ? 'No Fees Logged Yet'
    : null;

  const byWeek = new Map<string, { week: string; pre: number; post: number }>();
  rows.forEach((r) => {
    const cur = byWeek.get(r.week_start_date) ?? { week: r.week_start_date, pre: 0, post: 0 };
    if (r.phase === 'pre_signing') cur.pre += Number(r.hours) || 0; else cur.post += Number(r.hours) || 0;
    byWeek.set(r.week_start_date, cur);
  });
  const chartData = Array.from(byWeek.values()).slice(-12).map((d) => ({
    ...d,
    label: new Date(d.week + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));
  const latestWeek = chartData.length ? chartData[chartData.length - 1] : null;

  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const rph = hasHours && totalFee > 0 ? totalFee / totalHours : null;

  const handleChanged = () => { void onHoursChanged?.(); void loadWeeks(); };

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        className="deal-hours-fees-panel group p-4 h-full flex flex-col gap-3 cursor-pointer transition-colors hover:bg-muted/20"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-medium flex items-center gap-2 tracking-[0.01em] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Hours & Fees
          </h4>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Revenue / Hour</p>
            <p className="text-2xl font-semibold tabular-nums font-mono text-foreground truncate">
              {rph !== null ? fmtMoney(rph) : '—'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Hours</p>
            <p className="text-lg font-medium tabular-nums font-mono text-foreground">{totalHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">Pre {pre.toLocaleString()} · Post {post.toLocaleString()}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Fee</p>
            <p className="text-lg font-medium tabular-nums font-mono text-foreground truncate">{hasFees ? fmtMoney(totalFee) : '—'}</p>
            {latestWeek && (
              <p className="text-[11px] text-muted-foreground tabular-nums">Last week {(latestWeek.pre + latestWeek.post).toLocaleString()}h</p>
            )}
          </div>
        </div>

        {emptyMsg && (
          <p className="text-xs text-muted-foreground">{emptyMsg} — click to add.</p>
        )}

        <div className="flex-1 min-h-[110px]">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground rounded-md border border-dashed border-border/50">
              Weekly hours will appear here
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <RTooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(v: number, name: string) => [`${v}h`, name === 'pre' ? 'Pre-Signing' : 'Post-Signing']}
                  labelFormatter={(l) => `Week of ${l}`}
                />
                <Bar dataKey="pre" stackId="a" fill="hsl(var(--chart-2))" />
                <Bar dataKey="post" stackId="a" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[720px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Hours & Fees
            </DialogTitle>
          </DialogHeader>
          <HoursFeesInputs deal={deal} updateDeal={updateDeal} onChanged={handleChanged} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Local-draft numeric input: typing only updates local state, the deal is
 * updated once on blur/Enter. Committing per keystroke re-rendered the whole
 * deal page and froze typing.
 */
function DraftNumberInput({ value, onCommit, money, ...rest }: { value: number | null | undefined; onCommit: (n: number) => void; money?: boolean } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const fmt = (n: number | null | undefined) => (n ? (money ? Math.round(n).toLocaleString() : String(n)) : '');
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(fmt(value)); }, [value, focused]);
  const commit = () => {
    const raw = draft.replace(/,/g, '').trim();
    const n = raw ? Number(raw) : 0;
    if (!Number.isFinite(n)) { setDraft(fmt(value)); return; }
    if (n !== (value ?? 0)) onCommit(n);
  };
  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, '');
        if (raw === '' || (money ? /^\d+$/ : /^\d*\.?\d*$/).test(raw)) setDraft(e.target.value);
      }}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function HoursFeesInputs({ deal, updateDeal, onChanged }: { deal: any; updateDeal: (f: string, v: any) => void; onChanged: () => void }) {
  const feesVisibility = useCompanyFeesVisibility();
  const refreshDeals = onChanged;
  return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hours */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Pre-Signing</span>
              <div className="flex items-center gap-2 h-8">
                <span className="text-sm font-medium tabular-nums flex-1">
                  {(deal.preSigningHours ?? 0).toLocaleString()}
                </span>
                <AddHoursButton
                  dealId={deal.id}
                  phase="pre_signing"
                  iconOnly
                  onChanged={() => { void refreshDeals?.(); }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Post-Signing</span>
              <div className="flex items-center gap-2 h-8">
                <span className="text-sm font-medium tabular-nums flex-1">
                  {(deal.postSigningHours ?? 0).toLocaleString()}
                </span>
                <AddHoursButton
                  dealId={deal.id}
                  phase="post_signing"
                  iconOnly
                  onChanged={() => { void refreshDeals?.(); }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Total Hours</span>
              <span className="text-sm font-medium h-8 flex items-center tabular-nums">
                {((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0)).toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Revenue / Hour</span>
              <span className="text-sm font-medium h-8 flex items-center">
                {(() => {
                  const totalHours = (deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0);
                  if (totalHours === 0) return '-';
                  const revenuePerHour = (deal.totalFee ?? 0) / totalHours;
                  return `$${revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                })()}
              </span>
            </div>
          </div>
          {/* Fees */}
          <div className="space-y-3 min-w-0">
            {feesVisibility.retainerEnabled && (
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-retainer">
              <span className="text-muted-foreground text-sm">Retainer Fee</span>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <DraftNumberInput
                  money
                  value={deal.retainerFee}
                  onCommit={(n) => updateDeal('retainerFee', n)}
                  placeholder="0"
                  className="pl-5 h-8 text-sm w-full"
                />
              </div>
            </div>
            )}
            {feesVisibility.milestoneEnabled && (
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-milestone">
              <span className="text-muted-foreground text-sm">Milestone Fee</span>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <DraftNumberInput
                  money
                  value={deal.milestoneFee}
                  onCommit={(n) => updateDeal('milestoneFee', n)}
                  placeholder="0"
                  className="pl-5 h-8 text-sm w-full"
                />
              </div>
            </div>
            )}
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Success Fee %</span>
              <div className="flex items-center gap-2">
                <div className="relative w-16 shrink-0">
                  <DraftNumberInput
                    value={deal.successFeePercent}
                    onCommit={(n) => updateDeal('successFeePercent', Math.min(100, Math.max(0, n)))}
                    placeholder="0"
                    className="pr-6 h-8 text-sm w-full"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                     <span className="text-sm text-muted-foreground whitespace-nowrap flex-1 text-right cursor-help">
                      <span className="font-medium text-foreground">{(() => {
                        const total = deal.totalFee ?? 0;
                        const milestone = deal.milestoneFee ?? 0;
                        const retainer = deal.retainerFee ?? 0;
                        const closing = Math.max(0, total - milestone - retainer);
                        if (closing >= 1_000_000) return `$${(closing / 1_000_000).toFixed(1)}M`;
                        if (closing >= 1_000) return `$${(closing / 1_000).toFixed(1)}K`;
                        return `$${Math.round(closing).toLocaleString()}`;
                      })()}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-center">
                    <p className="text-xs">Amount due at closing of the facility, less fees already paid</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-total">
              <span className="text-muted-foreground text-sm">Total Fee</span>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  value={
                    feesVisibility.totalFeeComputedOnly
                      ? (() => {
                          const c = formatComputedTotal(
                            (deal as any).value ?? null,
                            deal.successFeePercent ?? null,
                          );
                          return c === '—' ? '' : c.replace(/^\$/, '');
                        })()
                      : (deal.totalFee ? Math.round(deal.totalFee).toLocaleString() : '')
                  }
                  readOnly
                  title={
                    feesVisibility.totalFeeComputedOnly
                      ? 'Computed: deal size × success fee %'
                      : 'Auto-calculated: Retainer + Milestone + Deal Size × Success Fee %'
                  }
                  placeholder="0"
                  className="pl-5 h-8 text-sm w-full bg-muted/40 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
  );
}
