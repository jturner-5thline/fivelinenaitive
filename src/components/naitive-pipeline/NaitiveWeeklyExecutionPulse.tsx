import { useMemo, useState, ReactNode } from 'react';
import { Deal } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ArrowDown, ArrowUp, Minus, CalendarIcon } from 'lucide-react';
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

function topReason(deals: Deal[], from: Date, to: Date): { label: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const d of deals) {
    const u = new Date(d.updatedAt);
    if (!inRange(u, from, to)) continue;
    const raw = d.whyNotMovingForward;
    if (!raw) continue;
    raw
      .split(/\n|;|,|\u2022/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((tok) => {
        const head = tok.split('—')[0].trim();
        if (!head) return;
        counts.set(head, (counts.get(head) || 0) + 1);
      });
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] === 0) return null;
  return { label: sorted[0][0], count: sorted[0][1] };
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

      {/* 8 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard label="Quals Held" value={current.qualsHeld} prev={previous.qualsHeld} />
        <StatCard label="Demos Held" value={current.demosHeld} prev={previous.demosHeld} />
        <StatCard label="Demos Booked" value={current.demosBooked} prev={previous.demosBooked} />
        <StatCard label="Trials Started" value={current.trialsStarted} prev={previous.trialsStarted} />
        <StatCard label="Converted" value={current.converted} prev={previous.converted} />
        <StatCard label="From Sequences" value={current.fromSequences} prev={previous.fromSequences} />
        <StatCard label="From Warm" value={current.fromWarm} prev={previous.fromWarm} />
        <StatCard label="DM Present Rate" value={current.dmRate} prev={previous.dmRate} isPercent />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Activity trend */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              Pipeline Activity Over Time
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-1">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={buckets.activity} margin={{ left: -8, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                <Line type="monotone" dataKey="qualsHeld" name="Quals Held" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="demosHeld" name="Demos Held" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="demosBooked" name="Demos Booked" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="trialsStarted" name="Trials Started" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="converted" name="Converted" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Source split */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              New Meetings: Sequences vs. Warm
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
              DM Present Rate by Week
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

      {/* Top blocker callout */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            This Week's #1 Blocker
          </p>
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
        </CardContent>
      </Card>
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