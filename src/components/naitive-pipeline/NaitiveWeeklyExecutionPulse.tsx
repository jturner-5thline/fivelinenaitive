import { useMemo, useState, ReactNode } from 'react';
import { Deal } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ArrowDown, ArrowUp, Minus, CalendarIcon, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  format, startOfWeek, endOfWeek, subWeeks, subDays, startOfDay, endOfDay,
  differenceInMilliseconds, addWeeks,
} from 'date-fns';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import type { NaitiveStageHistoryRow } from '@/hooks/useNaitiveStageHistory';
import { useWorkspaceAdvanceReasons } from '@/hooks/useAdvanceReasons';
import { ADVANCE_REASON_LABELS, AdvanceReasonCategory, AdvanceReason } from '@/types/deal';
import { ChevronDown } from 'lucide-react';

type RangeKey = 'this-week' | 'last-week' | 'last-30' | 'last-90' | 'custom';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--foreground))',
  padding: '8px 10px',
} as const;

const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

const SEQUENCE_SOURCES = ['Sequence reply'];
const WARM_SOURCES = ['Warm outreach', 'Referral', 'Inbound'];
const DM_TARGET_PCT = 60;

function isDmYes(v?: string) {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === 'yes' || s === 'true' || s.includes('decision');
}

function rangeFor(key: RangeKey, customFrom?: Date, customTo?: Date): { from: Date; to: Date; label: string } {
  const today = new Date();
  if (key === 'this-week') {
    const from = startOfWeek(today, { weekStartsOn: 1 });
    return { from, to: endOfWeek(today, { weekStartsOn: 1 }), label: 'This Week' };
  }
  if (key === 'last-week') {
    const lw = subWeeks(today, 1);
    return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }), label: 'Last Week' };
  }
  if (key === 'last-30') return { from: startOfDay(subDays(today, 29)), to: endOfDay(today), label: 'Last 30 Days' };
  if (key === 'last-90') return { from: startOfDay(subDays(today, 89)), to: endOfDay(today), label: 'Last 90 Days' };
  return {
    from: customFrom ? startOfDay(customFrom) : startOfDay(subDays(today, 6)),
    to: customTo ? endOfDay(customTo) : endOfDay(today),
    label: 'Custom',
  };
}

function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const dur = differenceInMilliseconds(to, from);
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - dur);
  return { from: prevFrom, to: prevTo };
}

function inRange(d: Date, from: Date, to: Date) {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

interface PeriodMetrics {
  qualsHeld: number;
  demosHeld: number;
  demosBooked: number;
  trialsStarted: number;
  converted: number;
  fromSequences: number;
  fromWarm: number;
  dmRate: number; // 0-100
  dmDenominator: number;
}

function computeMetrics(
  deals: Deal[],
  history: NaitiveStageHistoryRow[],
  from: Date,
  to: Date,
): PeriodMetrics {
  const out: PeriodMetrics = {
    qualsHeld: 0, demosHeld: 0, demosBooked: 0, trialsStarted: 0, converted: 0,
    fromSequences: 0, fromWarm: 0, dmRate: 0, dmDenominator: 0,
  };

  for (const h of history) {
    const t = new Date(h.changedAt);
    if (!inRange(t, from, to)) continue;
    if (h.fromStage === 'qual-booked' && h.toStage !== 'qual-booked') out.qualsHeld++;
    if (h.fromStage === 'demo-booked' && h.toStage !== 'demo-booked') out.demosHeld++;
    if (h.toStage === 'demo-booked' && h.fromStage !== 'demo-booked') out.demosBooked++;
    if (h.toStage === 'trial-active' && h.fromStage !== 'trial-active') out.trialsStarted++;
    if (h.toStage === 'converted' && h.fromStage !== 'converted') out.converted++;
  }

  let dmYes = 0;
  for (const d of deals) {
    const created = new Date(d.createdAt);
    const updated = new Date(d.updatedAt);
    const touchedThisPeriod = inRange(created, from, to) || inRange(updated, from, to);

    if (inRange(created, from, to)) {
      const src = (d.sourcedVia || '').trim();
      if (SEQUENCE_SOURCES.includes(src)) out.fromSequences++;
      else if (WARM_SOURCES.includes(src)) out.fromWarm++;
    }

    if (touchedThisPeriod && d.dmPresent) {
      out.dmDenominator++;
      if (isDmYes(d.dmPresent)) dmYes++;
    }
  }
  out.dmRate = out.dmDenominator > 0 ? Math.round((dmYes / out.dmDenominator) * 100) : 0;
  return out;
}

function weeklyBuckets(deals: Deal[], history: NaitiveStageHistoryRow[]) {
  const today = new Date();
  const weeks: { weekStart: Date; weekEnd: Date; label: string }[] = [];
  for (let i = 9; i >= 0; i--) {
    const ws = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    weeks.push({ weekStart: ws, weekEnd: we, label: format(ws, 'MMM d') });
  }

  const activity = weeks.map((w) => ({
    week: w.label,
    qualsHeld: 0, demosHeld: 0, demosBooked: 0, trialsStarted: 0, converted: 0,
  }));
  const sources = weeks.map((w) => ({
    week: w.label,
    sequence: 0, warm: 0, referral: 0, inbound: 0,
  }));
  const dm = weeks.map((w) => ({ week: w.label, rate: 0, _yes: 0, _total: 0 }));

  history.forEach((h) => {
    const t = new Date(h.changedAt);
    const wi = weeks.findIndex((w) => t >= w.weekStart && t <= w.weekEnd);
    if (wi === -1) return;
    const row = activity[wi];
    if (h.fromStage === 'qual-booked' && h.toStage !== 'qual-booked') row.qualsHeld++;
    if (h.fromStage === 'demo-booked' && h.toStage !== 'demo-booked') row.demosHeld++;
    if (h.toStage === 'demo-booked' && h.fromStage !== 'demo-booked') row.demosBooked++;
    if (h.toStage === 'trial-active' && h.fromStage !== 'trial-active') row.trialsStarted++;
    if (h.toStage === 'converted' && h.fromStage !== 'converted') row.converted++;
  });

  deals.forEach((d) => {
    const c = new Date(d.createdAt);
    const wi = weeks.findIndex((w) => c >= w.weekStart && c <= w.weekEnd);
    if (wi !== -1) {
      const src = (d.sourcedVia || '').trim();
      if (src === 'Sequence reply') sources[wi].sequence++;
      else if (src === 'Warm outreach') sources[wi].warm++;
      else if (src === 'Referral') sources[wi].referral++;
      else if (src === 'Inbound') sources[wi].inbound++;
    }
    const u = new Date(d.updatedAt);
    const wiTouched = weeks.findIndex(
      (w) => (c >= w.weekStart && c <= w.weekEnd) || (u >= w.weekStart && u <= w.weekEnd),
    );
    if (wiTouched !== -1 && d.dmPresent) {
      dm[wiTouched]._total++;
      if (isDmYes(d.dmPresent)) dm[wiTouched]._yes++;
    }
  });

  const dmFinal = dm.map((row) => ({
    week: row.week,
    rate: row._total > 0 ? Math.round((row._yes / row._total) * 100) : 0,
  }));

  return { activity, sources, dm: dmFinal };
}

function normalizeReasons(raw: unknown): string[] {
  const split = (s: string) =>
    s.split(/\n|;|,|\u2022/g).map((v) => v.trim()).filter(Boolean);
  if (raw == null) return [];
  if (typeof raw === 'string') return split(raw);
  if (Array.isArray(raw)) {
    return raw.flatMap((v) => {
      if (typeof v === 'string') return split(v);
      if (v && typeof v === 'object') {
        const label = (v as any).label ?? (v as any).value ?? (v as any).name;
        return typeof label === 'string' ? split(label) : [];
      }
      return [];
    });
  }
  if (typeof raw === 'object') {
    const label = (raw as any).label ?? (raw as any).value ?? (raw as any).name;
    return typeof label === 'string' ? split(label) : [];
  }
  return [];
}

interface BlockerDealHit {
  deal: Deal;
  reasons: string[]; // full reason strings (incl. any "— detail" suffix)
}

function topReason(
  deals: Deal[],
  from: Date,
  to: Date,
): { label: string; count: number; deals: BlockerDealHit[] } | null {
  const counts = new Map<string, number>();
  const dealsByHead = new Map<string, BlockerDealHit[]>();
  for (const d of deals) {
    try {
      const u = new Date(d.updatedAt);
      if (!inRange(u, from, to)) continue;
      const tokens = normalizeReasons(d.whyNotMovingForward);
      const seenHeads = new Set<string>();
      for (const tok of tokens) {
        const head = tok.split('—')[0].trim();
        if (!head) continue;
        counts.set(head, (counts.get(head) || 0) + 1);
        if (!seenHeads.has(head)) {
          seenHeads.add(head);
          const arr = dealsByHead.get(head) || [];
          arr.push({ deal: d, reasons: tokens });
          dealsByHead.set(head, arr);
        }
      }
    } catch {
      // skip malformed record
    }
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] === 0) return null;
  const [label, count] = sorted[0];
  return { label, count, deals: dealsByHead.get(label) || [] };
}

function StatCard({ label, value, prev, isPercent }: {
  label: string; value: number; prev: number; isPercent?: boolean;
}) {
  const delta = value - prev;
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-destructive' : 'text-muted-foreground';
  const fmt = (n: number) => (isPercent ? `${n}%` : `${n}`);
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground leading-tight tracking-tight mt-1.5">
          {fmt(value)}
        </p>
        <div className={cn('flex items-center gap-1 text-[11px] mt-1.5', color)}>
          <Icon className="h-3 w-3" />
          <span className="font-medium">
            {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${isPercent ? `${delta}pt` : delta}`}
          </span>
          <span className="text-muted-foreground">vs {fmt(prev)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  deals: Deal[];
  history: NaitiveStageHistoryRow[];
}

export function NaitiveWeeklyExecutionPulse({ deals, history }: Props) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('this-week');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { from, to, label } = useMemo(
    () => rangeFor(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const prev = useMemo(() => previousRange(from, to), [from, to]);

  const current = useMemo(() => computeMetrics(deals, history, from, to), [deals, history, from, to]);
  const previous = useMemo(
    () => computeMetrics(deals, history, prev.from, prev.to),
    [deals, history, prev],
  );

  const buckets = useMemo(() => weeklyBuckets(deals, history), [deals, history]);

  // Top blocker — always uses week-of-today regardless of selected range
  const thisWeekFrom = startOfWeek(new Date(), { weekStartsOn: 1 });
  const thisWeekTo = endOfWeek(new Date(), { weekStartsOn: 1 });
  const lastWeekFrom = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
  const lastWeekTo = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
  const blockerThis = useMemo(() => topReason(deals, thisWeekFrom, thisWeekTo), [deals]);
  const blockerLast = useMemo(() => topReason(deals, lastWeekFrom, lastWeekTo), [deals]);
  const [blockerOpen, setBlockerOpen] = useState(false);

  // ── Why Moving Forward (accelerator) ───────────────────────────
  const { rows: advanceRows } = useWorkspaceAdvanceReasons();
  const accelerator = useMemo(
    () => topAdvance(advanceRows, thisWeekFrom, thisWeekTo),
    [advanceRows],
  );
  const acceleratorLast = useMemo(
    () => topAdvance(advanceRows, lastWeekFrom, lastWeekTo),
    [advanceRows],
  );
  const acceleratorBreakdown = useMemo(
    () => advanceBreakdown(advanceRows, thisWeekFrom, thisWeekTo),
    [advanceRows],
  );
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Weekly Execution Pulse</h2>
          <p className="text-sm text-muted-foreground">
            {label} · {format(from, 'MMM d')} – {format(to, 'MMM d, yyyy')} · vs prior {format(prev.from, 'MMM d')} – {format(prev.to, 'MMM d')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="last-week">Last Week</SelectItem>
              <SelectItem value="last-30">Last 30 Days</SelectItem>
              <SelectItem value="last-90">Last 90 Days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {rangeKey === 'custom' && (
            <div className="flex items-center gap-1">
              <DatePill date={customFrom} onChange={setCustomFrom} placeholder="From" />
              <span className="text-xs text-muted-foreground">→</span>
              <DatePill date={customTo} onChange={setCustomTo} placeholder="To" />
            </div>
          )}
        </div>
      </div>

      {/* Core KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Quals Held" value={current.qualsHeld} prev={previous.qualsHeld} />
        <StatCard label="Demos Held" value={current.demosHeld} prev={previous.demosHeld} />
        <StatCard label="Demos Booked" value={current.demosBooked} prev={previous.demosBooked} />
        <StatCard label="Trials Started" value={current.trialsStarted} prev={previous.trialsStarted} />
        <StatCard label="Converted" value={current.converted} prev={previous.converted} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source split */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              New Meetings: Sequences vs Warm Outreach
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-1">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={buckets.sources} margin={{ left: -8, right: 12, top: 8, bottom: 4 }} barCategoryGap={6}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                <Bar dataKey="sequence" name="Sequence reply" stackId="src" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="warm" name="Warm outreach" stackId="src" fill="#22c55e" />
                <Bar dataKey="referral" name="Referral" stackId="src" fill="#a855f7" />
                <Bar dataKey="inbound" name="Inbound" stackId="src" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* DM Present Rate */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              DM Present Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-1">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={buckets.dm} margin={{ left: -8, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, 'DM Present']} />
                <ReferenceLine
                  y={DM_TARGET_PCT}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${DM_TARGET_PCT}%`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'right' }}
                />
                <Line type="monotone" dataKey="rate" name="DM Present" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top blocker callout — clickable drill-down */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="border-primary/30 bg-primary/5">
        <button
          type="button"
          disabled={!blockerThis || blockerThis.deals.length === 0}
          onClick={() => setBlockerOpen(true)}
          className={cn(
            'w-full text-left p-4 rounded-lg transition-colors',
            blockerThis && blockerThis.deals.length > 0
              ? 'hover:bg-primary/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
              : 'cursor-default',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              This Week's #1 Blocker
            </p>
            {blockerThis && blockerThis.deals.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                View {blockerThis.deals.length} {blockerThis.deals.length === 1 ? 'deal' : 'deals'}
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
          {blockerThis ? (
            <p className="text-sm text-foreground mt-1">
              <span className="font-semibold text-primary">Top disqualification this week:</span>{' '}
              <span className="font-semibold">{blockerThis.label}</span> — {blockerThis.count}{' '}
              {blockerThis.count === 1 ? 'deal' : 'deals'}.
              {blockerLast ? (
                <span className="text-muted-foreground">
                  {' '}Last week: {blockerLast.label} ({blockerLast.count}).
                </span>
              ) : (
                <span className="text-muted-foreground"> No blocker logged last week.</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">No "Why Not Moving Forward" reasons logged this week yet.</p>
          )}
        </button>
      </Card>

        {/* This Week's #1 Accelerator — symmetrical to the blocker card */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                This Week's #1 Accelerator
              </p>
              {acceleratorBreakdown.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBreakdownOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {breakdownOpen ? 'Hide' : 'Breakdown'}
                  <ChevronDown className={cn('h-3 w-3 transition-transform', breakdownOpen && 'rotate-180')} />
                </button>
              )}
            </div>
            {accelerator ? (
              <p className="text-sm text-foreground mt-1">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Top accelerator this week:</span>{' '}
                <span className="font-semibold">{ADVANCE_REASON_LABELS[accelerator.category]}</span> — {accelerator.count}{' '}
                {accelerator.count === 1 ? 'deal' : 'deals'}.
                {acceleratorLast ? (
                  <span className="text-muted-foreground">
                    {' '}Last week: {ADVANCE_REASON_LABELS[acceleratorLast.category]} ({acceleratorLast.count}).
                  </span>
                ) : (
                  <span className="text-muted-foreground"> No accelerator logged last week.</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No "Why Moving Forward" reasons logged this week yet.</p>
            )}
            {breakdownOpen && acceleratorBreakdown.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-emerald-500/20 pt-2">
                {acceleratorBreakdown.map((b) => (
                  <li key={b.category} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{ADVANCE_REASON_LABELS[b.category]}</span>
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{b.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={blockerOpen} onOpenChange={setBlockerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {blockerThis?.label ?? 'Top blocker'} · {blockerThis?.count ?? 0}{' '}
              {blockerThis?.count === 1 ? 'mention' : 'mentions'}
            </DialogTitle>
            <DialogDescription>
              Deals updated this week that cited this reason in "Why Not Moving Forward".
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {blockerThis && blockerThis.deals.length > 0 ? (
              <ul className="divide-y divide-border">
                {blockerThis.deals.map(({ deal, reasons }) => (
                  <li key={deal.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/deal/${deal.id}`}
                          className="text-sm font-semibold text-foreground hover:text-primary truncate block"
                          onClick={() => setBlockerOpen(false)}
                        >
                          {deal.company || 'Untitled deal'}
                        </Link>
                        {deal.stage && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Stage: {deal.stage}
                          </p>
                        )}
                        <ul className="mt-2 space-y-1">
                          {reasons.map((r, i) => (
                            <li
                              key={i}
                              className="text-xs text-foreground/90 leading-snug pl-3 border-l-2 border-primary/40"
                            >
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                        {format(new Date(deal.updatedAt), 'MMM d')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No deals match this blocker.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DatePill({ date, onChange, placeholder }: {
  date?: Date; onChange: (d?: Date) => void; placeholder: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('justify-start text-left font-normal h-9', !date && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {date ? format(date, 'MMM d') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
      </PopoverContent>
    </Popover>
  );
}