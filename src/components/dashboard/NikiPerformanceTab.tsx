import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, LayoutDashboard, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { RepPerformanceModelGrid } from '@/components/metrics/rep-model/RepPerformanceModelGrid';
import { formatUSD } from '@/lib/formatters/currency';
import { cn } from '@/lib/utils';
import {
  useNikiPerformanceMetrics,
  NIKI_PLAN_2026,
  NIKI_QUARTERS,
  type MetricRow,
  type MetricRowKey,
  type PerfDeal,
  type QuarterKey,
} from '@/hooks/useNikiPerformanceMetrics';

function fmt(value: number, unit: 'count' | 'currency'): string {
  if (unit === 'currency') return formatUSD(value);
  return value.toLocaleString('en-US');
}

function statusFromPct(pct: number | null): 'ahead' | 'ontrack' | 'behind' | 'na' {
  if (pct === null) return 'na';
  if (pct >= 0) return 'ahead';
  if (pct >= -0.1) return 'ontrack';
  return 'behind';
}

const STATUS_STYLES: Record<string, { text: string; bg: string; ring: string; label: string; Icon: any }> = {
  ahead:   { text: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30', label: 'Ahead',     Icon: TrendingUp },
  ontrack: { text: 'text-amber-400',   bg: 'bg-amber-400/10',   ring: 'ring-amber-400/30',   label: 'On Track',  Icon: Minus },
  behind:  { text: 'text-destructive', bg: 'bg-destructive/10', ring: 'ring-destructive/30', label: 'Behind',    Icon: TrendingDown },
  na:      { text: 'text-muted-foreground', bg: 'bg-muted/30',  ring: 'ring-border',         label: '—',         Icon: Minus },
};

function variance(actual: number, plan: number) {
  const diff = actual - plan;
  if (!plan) return { diff, pct: null as number | null };
  return { diff, pct: diff / plan };
}

interface KpiCardProps {
  row: MetricRow;
  onClick?: () => void;
}

function KpiCard({ row, onClick }: KpiCardProps) {
  const plan = NIKI_PLAN_2026[row.key];
  const v = variance(row.yearTotal, plan.total);
  const status = statusFromPct(v.pct);
  const s = STATUS_STYLES[status];
  const pctOfPlan = plan.total ? Math.round((row.yearTotal / plan.total) * 100) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group text-left rounded-xl border border-border bg-card p-4 transition-all',
        'hover:border-primary/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          {row.label}
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1', s.bg, s.text, s.ring)}>
          <s.Icon className="h-3 w-3" />
          {s.label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">
        {fmt(row.yearTotal, row.unit)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        Plan: <span className="text-foreground/80">{fmt(plan.total, row.unit)}</span>
        {pctOfPlan !== null && <span className="ml-1.5 text-muted-foreground">· {pctOfPlan}% of plan</span>}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn('h-full', status === 'ahead' ? 'bg-emerald-500' : status === 'ontrack' ? 'bg-amber-400' : status === 'behind' ? 'bg-destructive' : 'bg-muted-foreground')}
          style={{ width: `${Math.max(2, Math.min(100, pctOfPlan ?? 0))}%` }}
        />
      </div>
      <div className={cn('mt-2 text-[11px] tabular-nums font-medium', s.text)}>
        {v.diff >= 0 ? '+' : ''}{fmt(v.diff, row.unit)}
        {v.pct !== null && <span className="ml-1 opacity-80">({v.pct >= 0 ? '+' : ''}{(v.pct * 100).toFixed(1)}%)</span>}
      </div>
    </button>
  );
}

interface ComparisonRowProps {
  row: MetricRow;
  onClick: () => void;
}
function ComparisonRow({ row, onClick }: ComparisonRowProps) {
  const plan = NIKI_PLAN_2026[row.key];
  const v = variance(row.yearTotal, plan.total);
  const status = statusFromPct(v.pct);
  const s = STATUS_STYLES[status];
  const pctOfPlan = plan.total ? Math.min(100, Math.max(0, (row.yearTotal / plan.total) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors text-left"
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{row.label}</div>
        <div className="mt-1 h-1 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={cn(
              'h-full',
              status === 'ahead' ? 'bg-emerald-500'
                : status === 'ontrack' ? 'bg-amber-400'
                : status === 'behind' ? 'bg-destructive'
                : 'bg-muted-foreground',
            )}
            style={{ width: `${pctOfPlan}%` }}
          />
        </div>
      </div>
      <div className="text-right tabular-nums text-xs text-muted-foreground">
        {fmt(plan.total, row.unit)}
      </div>
      <div className="text-right tabular-nums text-xs font-semibold text-foreground">
        {fmt(row.yearTotal, row.unit)}
      </div>
      <div className={cn('text-right tabular-nums text-xs font-medium', s.text)}>
        {v.diff >= 0 ? '+' : ''}{fmt(v.diff, row.unit)}
      </div>
      <div className={cn('text-right tabular-nums text-[11px] w-14', s.text)}>
        {v.pct === null ? '—' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(0)}%`}
      </div>
    </button>
  );
}

function GroupCard({ title, description, rows, openDrill }: {
  title: string;
  description?: string;
  rows: MetricRow[];
  openDrill: (row: MetricRow, q: QuarterKey | 'YEAR') => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-3 px-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          <div>Metric</div>
          <div className="text-right">Plan</div>
          <div className="text-right">Actual</div>
          <div className="text-right">Δ</div>
          <div className="text-right w-14">Var %</div>
        </div>
        <div className="space-y-0.5">
          {rows.map(r => (
            <ComparisonRow key={r.key} row={r} onClick={() => openDrill(r, 'YEAR')} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QuarterlyChart({ rows, title, description, unit }: {
  rows: MetricRow[];
  title: string;
  description?: string;
  unit: 'count' | 'currency';
}) {
  const data = useMemo(() => {
    return NIKI_QUARTERS.map(q => {
      const entry: any = { quarter: q.key };
      for (const r of rows) {
        const plan = NIKI_PLAN_2026[r.key][q.key];
        entry[`${r.label} · Plan`] = plan;
        entry[`${r.label} · Actual`] = r.byQuarter[q.key].value;
      }
      return entry;
    });
  }, [rows]);

  const colors = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="quarter" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(v) => unit === 'currency' ? formatUSD(v) : String(v)}
                width={70}
              />
              <RTooltip
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => unit === 'currency' ? formatUSD(v) : v.toLocaleString('en-US')}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {rows.map((r, i) => (
                <Fragment key={r.key}>
                  <Bar dataKey={`${r.label} · Plan`} fill={colors[i % colors.length]} fillOpacity={0.3} radius={[3, 3, 0, 0]} />
                  <Bar dataKey={`${r.label} · Actual`} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />
                </Fragment>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelSection({ rows, openDrill }: {
  rows: MetricRow[];
  openDrill: (row: MetricRow, q: QuarterKey | 'YEAR') => void;
}) {
  const max = Math.max(1, ...rows.map(r => NIKI_PLAN_2026[r.key].total));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Pipeline Funnel — 2026 YTD</CardTitle>
        <CardDescription className="text-xs">Conversion progression from deals on board to closed.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 pb-4 space-y-2">
        {rows.map((r) => {
          const plan = NIKI_PLAN_2026[r.key].total;
          const actual = r.yearTotal;
          const planPct = (plan / max) * 100;
          const actualPct = (actual / max) * 100;
          const v = variance(actual, plan);
          const s = STATUS_STYLES[statusFromPct(v.pct)];
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => openDrill(r, 'YEAR')}
              className="w-full text-left group"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-foreground">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="text-foreground font-semibold">{fmt(actual, r.unit)}</span>
                  <span className="mx-1">/</span>
                  {fmt(plan, r.unit)}
                  <span className={cn('ml-2 font-medium', s.text)}>
                    {v.pct === null ? '' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(0)}%`}
                  </span>
                </span>
              </div>
              <div className="relative h-3 rounded bg-muted/30 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-muted-foreground/30"
                  style={{ width: `${planPct}%` }}
                />
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 group-hover:brightness-110 transition',
                    statusFromPct(v.pct) === 'ahead' ? 'bg-emerald-500'
                      : statusFromPct(v.pct) === 'ontrack' ? 'bg-amber-400'
                      : statusFromPct(v.pct) === 'behind' ? 'bg-destructive'
                      : 'bg-primary',
                  )}
                  style={{ width: `${actualPct}%` }}
                />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function NikiPerformanceTab() {
  const { rows, isLoading } = useNikiPerformanceMetrics();
  const [drill, setDrill] = useState<{ title: string; deals: PerfDeal[] } | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const byKey = useMemo(() => {
    const m = new Map<MetricRowKey, MetricRow>();
    rows.forEach(r => m.set(r.key, r));
    return m;
  }, [rows]);

  const get = (k: MetricRowKey) => byKey.get(k);

  const openDrill = (row: MetricRow, q: QuarterKey | 'YEAR') => {
    const deals = q === 'YEAR' ? row.yearDeals : row.byQuarter[q].deals;
    const label = q === 'YEAR' ? '2026 YTD' : `${q} 2026`;
    setDrill({ title: `${row.label} — ${label}`, deals });
  };

  // KPI summary set (executive-priority)
  const kpiKeys: MetricRowKey[] = [
    'dollarsOnBoard',
    'dollarsSigned',
    'dollarsFunded',
    'dealsOnBoard',
    'clientsSigned',
    'dealsClosed',
  ];

  const productionRows = ['dealsOnBoard', 'dollarsOnBoard', 'proposalsIssued', 'dollarsProposed'] as MetricRowKey[];
  const conversionRows = ['clientsSigned', 'dollarsSigned', 'clientsReceivingTerms', 'termsSigned', 'volumeTermsSigned'] as MetricRowKey[];
  const revenueRows    = ['dealsClosed', 'dollarsFunded'] as MetricRowKey[];

  // ─── Period selection (multi-quarter capable) ────────────────────────────
  type PeriodKey = QuarterKey | 'YEAR';
  const allQuarterKeys: QuarterKey[] = NIKI_QUARTERS.map((q) => q.key);

  // Default to current quarter (May 2026 → Q2)
  const currentQuarter: QuarterKey = (() => {
    const m = new Date().getMonth();
    if (m <= 2) return 'Q1' as QuarterKey;
    if (m <= 5) return 'Q2' as QuarterKey;
    if (m <= 8) return 'Q3' as QuarterKey;
    return 'Q4' as QuarterKey;
  })();

  const [selectedPeriods, setSelectedPeriods] = useState<PeriodKey[]>([currentQuarter]);

  const togglePeriod = (k: PeriodKey) => {
    setSelectedPeriods((prev) => {
      const has = prev.includes(k);
      if (has) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((p) => p !== k);
      }
      return [...prev, k];
    });
  };

  const periodLabel = (k: PeriodKey) => (k === 'YEAR' ? '2026' : `${k} 2026`);

  // Order selected periods consistently: Q1..Q4, then YEAR
  const orderedSelected: PeriodKey[] = useMemo(() => {
    const order: PeriodKey[] = [...allQuarterKeys, 'YEAR'];
    return order.filter((k) => selectedPeriods.includes(k));
  }, [selectedPeriods]);

  const presets: { label: string; value: PeriodKey[] }[] = [
    { label: 'Current Q', value: [currentQuarter] },
    { label: 'H1', value: ['Q1' as QuarterKey, 'Q2' as QuarterKey] },
    { label: 'H2', value: ['Q3' as QuarterKey, 'Q4' as QuarterKey] },
    { label: 'All quarters', value: [...allQuarterKeys] },
    { label: 'Full Year', value: ['YEAR'] },
  ];

  const isSingle = orderedSelected.length === 1;

  const cellFor = (row: MetricRow, k: PeriodKey) => {
    const plan = NIKI_PLAN_2026[row.key];
    const planVal = k === 'YEAR' ? plan.total : plan[k];
    const actualVal = k === 'YEAR' ? row.yearTotal : row.byQuarter[k].value;
    const v = variance(actualVal, planVal);
    return { planVal, actualVal, v, status: statusFromPct(v.pct) };
  };

  const totalCols = isSingle ? 6 : 1 + orderedSelected.length * 4;

  const SectionHeaderRow = ({ title }: { title: string }) => (
    <TableRow className="hover:bg-transparent border-b-0">
      <TableCell
        colSpan={totalCols}
        className="py-2 px-4 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/30 sticky left-0"
      >
        {title}
      </TableCell>
    </TableRow>
  );

  const SingleRow = ({ row }: { row: MetricRow }) => {
    const k = orderedSelected[0];
    const { planVal, actualVal, v, status } = cellFor(row, k);
    const s = STATUS_STYLES[status];
    return (
      <TableRow className="cursor-pointer border-b border-border/20 hover:bg-muted/20" onClick={() => openDrill(row, k)}>
        <TableCell className="py-2.5 px-4 font-medium text-sm text-foreground">{row.label}</TableCell>
        <TableCell className="py-2.5 px-4 text-center tabular-nums text-sm font-semibold text-foreground bg-muted/20">
          {fmt(planVal, row.unit)}
        </TableCell>
        <TableCell className="py-2.5 px-4 text-center tabular-nums text-sm font-medium text-foreground/90">{fmt(actualVal, row.unit)}</TableCell>
        <TableCell className={cn('py-2.5 px-4 text-center tabular-nums text-sm font-medium', s.text)}>
          {v.diff >= 0 ? '+' : ''}{fmt(v.diff, row.unit)}
        </TableCell>
        <TableCell className={cn('py-2.5 px-4 text-center tabular-nums text-sm font-medium', s.text)}>
          {v.pct === null ? '—' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(0)}%`}
        </TableCell>
        <TableCell className="py-2.5 px-4 text-center">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1', s.bg, s.text, s.ring)}>
            <s.Icon className="h-3 w-3" />
            {s.label}
          </span>
        </TableCell>
      </TableRow>
    );
  };

  const MultiRow = ({ row }: { row: MetricRow }) => (
    <TableRow className="border-b border-border/20 hover:bg-muted/20">
      <TableCell className="py-2.5 px-4 font-medium text-sm text-foreground sticky left-0 bg-card z-10">
        {row.label}
      </TableCell>
      {orderedSelected.map((k) => {
        const { planVal, actualVal, v, status } = cellFor(row, k);
        const s = STATUS_STYLES[status];
        return (
          <Fragment key={k}>
            <TableCell className="py-2.5 px-3 text-center tabular-nums text-xs font-semibold text-foreground bg-muted/20 border-l border-border/20">
              {fmt(planVal, row.unit)}
            </TableCell>
            <TableCell
              className="py-2.5 px-3 text-center tabular-nums text-xs font-medium text-foreground/90 cursor-pointer hover:underline"
              onClick={() => openDrill(row, k)}
            >
              {fmt(actualVal, row.unit)}
            </TableCell>
            <TableCell className={cn('py-2.5 px-3 text-center tabular-nums text-xs font-medium', s.text)}>
              {v.diff >= 0 ? '+' : ''}{fmt(v.diff, row.unit)}
            </TableCell>
            <TableCell className={cn('py-2.5 px-3 text-center tabular-nums text-xs font-medium', s.text)}>
              {v.pct === null ? '—' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(0)}%`}
            </TableCell>
          </Fragment>
        );
      })}
    </TableRow>
  );

  const ScorecardSection = ({ title, keys }: { title: string; keys: MetricRowKey[] }) => (
    <>
      <SectionHeaderRow title={title} />
      {keys.map((k) => {
        const row = get(k);
        if (!row) return null;
        return isSingle ? <SingleRow key={k} row={row} /> : <MultiRow key={k} row={row} />;
      })}
    </>
  );

  const funnelRows = ['dealsOnBoard', 'proposalsIssued', 'clientsSigned', 'termsSigned', 'dealsClosed']
    .map(k => get(k as MetricRowKey)).filter(Boolean) as MetricRow[];

  if (isLoading) {
    return (
      <div className="mt-4 space-y-4">
        <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Rep Performance &amp; Pipeline Model</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plan vs Actual for Niki's 2026 production and revenue metrics. Live actuals from Active
            Pipeline stage-entry events, scoped to deals where Niki is owner or deal manager.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mode === 'edit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
            className="gap-1.5"
          >
            {mode === 'edit' ? <LayoutDashboard className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {mode === 'edit' ? 'Dashboard view' : 'Edit model'}
          </Button>
        </div>
      </div>

      {mode === 'view' ? (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiKeys.map((k) => {
              const r = get(k);
              if (!r) return null;
              return <KpiCard key={k} row={r} onClick={() => openDrill(r, 'YEAR')} />;
            })}
          </div>

          {/* Scorecard table */}
          <Card>
            <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">
                  Performance Scorecard
                </CardTitle>
                <CardDescription className="text-xs">
                  Plan vs Actual across pipeline production, conversion, and revenue.
                  {isSingle
                    ? ` Showing ${periodLabel(orderedSelected[0])}.`
                    : ` Comparing ${orderedSelected.length} periods.`}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                  {([...allQuarterKeys, 'YEAR'] as PeriodKey[]).map((k) => {
                    const active = selectedPeriods.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => togglePeriod(k)}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                          active
                            ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/30'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        title={`Toggle ${k === 'YEAR' ? 'Full Year' : `${k} 2026`}`}
                      >
                        {k === 'YEAR' ? 'Year' : k}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
                    Presets
                  </span>
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setSelectedPeriods(p.value)}
                      className="px-2 py-0.5 text-[10px] font-medium rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  {isSingle ? (
                    <TableRow className="hover:bg-transparent border-b border-border/40">
                      <TableHead className="h-9 px-4 text-[10px] uppercase tracking-wider font-semibold">Metric</TableHead>
                      <TableHead className="h-9 px-4 text-center text-[10px] uppercase tracking-wider font-bold text-foreground bg-muted/20">Plan</TableHead>
                      <TableHead className="h-9 px-4 text-center text-[10px] uppercase tracking-wider font-semibold">Actual</TableHead>
                      <TableHead className="h-9 px-4 text-center text-[10px] uppercase tracking-wider font-semibold">Δ</TableHead>
                      <TableHead className="h-9 px-4 text-center text-[10px] uppercase tracking-wider font-semibold">Var %</TableHead>
                      <TableHead className="h-9 px-4 text-center text-[10px] uppercase tracking-wider font-semibold">Status</TableHead>
                    </TableRow>
                  ) : (
                    <>
                      <TableRow className="hover:bg-transparent border-b border-border/30">
                        <TableHead rowSpan={2} className="h-9 px-4 text-[10px] uppercase tracking-wider font-semibold sticky left-0 bg-card z-10 align-bottom">
                          Metric
                        </TableHead>
                        {orderedSelected.map((k) => (
                          <TableHead
                            key={k}
                            colSpan={4}
                            className="h-8 px-3 text-center text-[10px] uppercase tracking-wider font-semibold text-foreground/80 border-l border-border/20"
                          >
                            {periodLabel(k)}
                          </TableHead>
                        ))}
                      </TableRow>
                      <TableRow className="hover:bg-transparent border-b border-border/40">
                        {orderedSelected.map((k) => (
                          <Fragment key={k}>
                            <TableHead className="h-8 px-3 text-center text-[10px] uppercase tracking-wider font-bold text-foreground bg-muted/20 border-l border-border/20">Plan</TableHead>
                            <TableHead className="h-8 px-3 text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Actual</TableHead>
                            <TableHead className="h-8 px-3 text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Δ</TableHead>
                            <TableHead className="h-8 px-3 text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Var %</TableHead>
                          </Fragment>
                        ))}
                      </TableRow>
                    </>
                  )}
                </TableHeader>
                <TableBody>
                  <ScorecardSection title="Pipeline Production" keys={productionRows} />
                  <ScorecardSection title="Conversion Milestones" keys={conversionRows} />
                  <ScorecardSection title="Revenue" keys={revenueRows} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Supporting visuals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <QuarterlyChart
              title="Quarterly Production — Dollars on Board"
              description="Plan vs Actual by quarter."
              rows={[get('dollarsOnBoard')!].filter(Boolean)}
              unit="currency"
            />
            <QuarterlyChart
              title="Quarterly Revenue — Dollars Funded"
              description="Plan vs Actual by quarter."
              rows={[get('dollarsFunded')!].filter(Boolean)}
              unit="currency"
            />
          </div>

          <FunnelSection rows={funnelRows} openDrill={openDrill} />
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Edit mode — configure the underlying plan model. Click the button again to return to the
            dashboard view.
          </div>
          <RepPerformanceModelGrid />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Actuals vs Plan — 2026 (Niki Heikali)</CardTitle>
              <CardDescription>
                Raw quarterly Plan / Actual / Variance grid. Click any actual cell to see the
                underlying deals.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium border-b border-border">Metric</th>
                    {NIKI_QUARTERS.map((q) => (
                      <th key={q.key} className="text-right px-3 py-2 font-medium border-b border-border" colSpan={2}>
                        {q.key} 2026
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 font-medium border-b border-border" colSpan={2}>
                      2026 Total
                    </th>
                    <th className="text-right px-3 py-2 font-medium border-b border-border">Variance</th>
                    <th className="text-right px-3 py-2 font-medium border-b border-border">Var %</th>
                  </tr>
                  <tr className="text-[10px] text-muted-foreground/80">
                    <th className="px-3 py-1 border-b border-border" />
                    {NIKI_QUARTERS.map((q) => (
                      <Fragment key={q.key}>
                        <th className="text-right px-2 py-1 border-b border-border font-normal">Plan</th>
                        <th className="text-right px-2 py-1 border-b border-border font-normal">Actual</th>
                      </Fragment>
                    ))}
                    <th className="text-right px-2 py-1 border-b border-border font-normal">Plan</th>
                    <th className="text-right px-2 py-1 border-b border-border font-normal">Actual</th>
                    <th className="px-2 py-1 border-b border-border" />
                    <th className="px-2 py-1 border-b border-border" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const plan = NIKI_PLAN_2026[row.key];
                    const v = variance(row.yearTotal, plan.total);
                    return (
                      <tr key={row.key} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap">{row.label}</td>
                        {NIKI_QUARTERS.map((q) => {
                          const actual = row.byQuarter[q.key].value;
                          const planQ = plan[q.key];
                          return (
                            <Fragment key={q.key}>
                              <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">
                                {fmt(planQ, row.unit)}
                              </td>
                              <td
                                className={cn(
                                  'text-right px-2 py-1.5 font-mono cursor-pointer hover:underline',
                                  actual >= planQ ? 'text-emerald-500' : 'text-foreground',
                                )}
                                onClick={() => openDrill(row, q.key)}
                              >
                                {fmt(actual, row.unit)}
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">
                          {fmt(plan.total, row.unit)}
                        </td>
                        <td
                          className={cn(
                            'text-right px-2 py-1.5 font-mono font-semibold cursor-pointer hover:underline',
                            row.yearTotal >= plan.total ? 'text-emerald-500' : 'text-foreground',
                          )}
                          onClick={() => openDrill(row, 'YEAR')}
                        >
                          {fmt(row.yearTotal, row.unit)}
                        </td>
                        <td className={cn('text-right px-2 py-1.5 font-mono', v.diff >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                          {v.diff > 0 ? '+' : ''}{fmt(v.diff, row.unit)}
                        </td>
                        <td className={cn('text-right px-2 py-1.5 font-mono', v.pct === null ? 'text-muted-foreground' : v.pct >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                          {v.pct === null ? '—' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drill?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {drill && drill.deals.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No deals in this bucket.</p>
            )}
            {drill && drill.deals.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Company</th>
                    <th className="text-right px-2 py-2 font-medium">Value</th>
                    <th className="text-right px-2 py-2 font-medium">Entered</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.deals.map((d) => (
                    <tr key={d.deal_id} className="border-b border-border/40">
                      <td className="px-2 py-1.5">
                        <a href={`/deals/${d.deal_id}`} className="hover:underline">{d.company}</a>
                      </td>
                      <td className="text-right px-2 py-1.5 font-mono">{formatUSD(d.value)}</td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">
                        {new Date(d.entered_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
