import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, LayoutDashboard, TrendingUp, TrendingDown, Minus, Eye, EyeOff } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
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
import { formatUSD } from '@/lib/formatters/currency';
import { cn } from '@/lib/utils';
import { MetricQuarterlyBarChart } from '@/components/dashboard/performance/MetricQuarterlyBarChart';
import { QuarterlyPlanEditor } from '@/components/dashboard/performance/QuarterlyPlanEditor';
import { PipelineConversionForecastCard } from '@/components/dashboard/performance/PipelineConversionForecastCard';
import { canEditPerformanceModel } from '@/lib/performanceModelAccess';
import {
  useNikiPerformanceMetrics,
  NIKI_QUARTERS,
  type MetricRow,
  type MetricRowKey,
  type PerfDeal,
  type QuarterKey,
} from '@/hooks/useNikiPerformanceMetrics';
import {
  NikiPerformancePlanProvider,
  useNikiPerformancePlan,
} from '@/hooks/useNikiPerformancePlan';

type PerfMode = 'quarterly' | 'ytd';
const QUARTER_ORDER_LIST: QuarterKey[] = ['Q1', 'Q2', 'Q3', 'Q4'];

/**
 * Current calendar quarter (Q1-Q4). YTD plan/actual sums Q1..currentQuarter
 * so a YTD column never includes future, unrealized quarters.
 */
function currentQuarterKey(): QuarterKey {
  const m = new Date().getMonth();
  if (m <= 2) return 'Q1';
  if (m <= 5) return 'Q2';
  if (m <= 8) return 'Q3';
  return 'Q4';
}

/**
 * Resolve plan/actual for a row at a given period, accounting for
 * quarter-by-quarter vs cumulative YTD display mode.
 */
function resolvePeriod(
  row: MetricRow,
  planMap: ReturnType<typeof useNikiPerformancePlan>['plan'],
  k: QuarterKey | 'YEAR' | 'YTD',
  mode: PerfMode,
): { planVal: number; actualVal: number } {
  const p = planMap[row.key];
  if (k === 'YEAR') return { planVal: p.total, actualVal: row.yearTotal };
  if (k === 'YTD') {
    const cur = currentQuarterKey();
    const idx = QUARTER_ORDER_LIST.indexOf(cur);
    let plan = 0;
    let actual = 0;
    for (let i = 0; i <= idx; i++) {
      const qk = QUARTER_ORDER_LIST[i];
      plan += p[qk];
      actual += row.byQuarter[qk].value;
    }
    return { planVal: plan, actualVal: actual };
  }
  if (mode === 'quarterly') {
    return { planVal: p[k], actualVal: row.byQuarter[k].value };
  }
  const idx = QUARTER_ORDER_LIST.indexOf(k);
  let plan = 0;
  let actual = 0;
  for (let i = 0; i <= idx; i++) {
    const qk = QUARTER_ORDER_LIST[i];
    plan += p[qk];
    actual += row.byQuarter[qk].value;
  }
  return { planVal: plan, actualVal: actual };
}

function fmt(value: number, unit: 'count' | 'currency'): string {
  if (unit === 'currency') return fmtMoney(value);
  return value.toLocaleString('en-US');
}

/**
 * Compact, scorecard-friendly money formatter for RAW dollar values.
 * - >= $1M  →  $1.25M  (one or two decimals when meaningful)
 * - >= $1K  →  $750K   (no decimals)
 * - else    →  $250
 * Negatives wrapped in parentheses to match accounting convention.
 */
function fmtMoney(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const abs = Math.abs(value);
  let out: string;
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    out = `$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
  } else if (abs >= 1_000) {
    out = `$${Math.round(abs / 1_000).toLocaleString('en-US')}K`;
  } else {
    out = `$${Math.round(abs).toLocaleString('en-US')}`;
  }
  return value < 0 ? `(${out})` : out;
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

function KpiCard({ row, onClick, planVal, actualVal, periodLabel }: KpiCardProps & { planVal: number; actualVal: number; periodLabel: string }) {
  const v = variance(actualVal, planVal);
  const status = statusFromPct(v.pct);
  const s = STATUS_STYLES[status];
  const pctOfPlan = planVal ? Math.round((actualVal / planVal) * 100) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-xl border border-border/30 bg-card p-4 transition-all flex flex-col items-center text-center',
        'hover:border-primary/40 hover:bg-muted/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex flex-col items-center gap-1.5">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
          {row.label}
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1', s.bg, s.text, s.ring)}>
          <s.Icon className="h-3 w-3" />
          {s.label}
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold text-foreground tabular-nums tracking-tight">
        {fmt(actualVal, row.unit)}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
        {periodLabel} Plan: <span className="text-foreground/80">{fmt(planVal, row.unit)}</span>
        {pctOfPlan !== null && <span className="ml-1.5 text-muted-foreground">· {pctOfPlan}%</span>}
      </div>
      <div className="mt-3 w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
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
  const { plan: planMap } = useNikiPerformancePlan();
  const plan = planMap[row.key];
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
  openDrill: (row: MetricRow, q: QuarterKey | 'YEAR' | 'YTD') => void;
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
  const { plan: planMap } = useNikiPerformancePlan();
  const data = useMemo(() => {
    return NIKI_QUARTERS.map(q => {
      const entry: any = { quarter: q.key };
      for (const r of rows) {
        const plan = planMap[r.key][q.key];
        entry[`${r.label} · Plan`] = plan;
        entry[`${r.label} · Actual`] = r.byQuarter[q.key].value;
      }
      return entry;
    });
  }, [rows, planMap]);

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

function FunnelSection({ rows, openDrill, mode, period, periodLabel, onToggleHide }: {
  rows: MetricRow[];
  openDrill: (row: MetricRow, q: QuarterKey | 'YEAR' | 'YTD') => void;
  mode: PerfMode;
  period: QuarterKey | 'YEAR' | 'YTD';
  periodLabel: string;
  onToggleHide?: () => void;
}) {
  const { plan: planMap } = useNikiPerformancePlan();
  const resolved = rows.map((r) => ({ row: r, ...resolvePeriod(r, planMap, period, mode) }));
  const max = Math.max(1, ...resolved.map((r) => r.planVal));
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0 gap-2">
        <div>
          <CardTitle className="text-sm font-semibold">Pipeline Funnel — {periodLabel}</CardTitle>
          <CardDescription className="text-xs">
            Conversion progression {mode === 'ytd' ? '(cumulative YTD)' : '(quarter only)'}.
          </CardDescription>
        </div>
        {onToggleHide && (
          <button
            type="button"
            onClick={onToggleHide}
            aria-label="Hide funnel"
            title="Hide funnel"
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </CardHeader>
      <CardContent className="pt-0 pb-4 space-y-2">
        {resolved.map(({ row: r, planVal: plan, actualVal: actual }) => {
          const planPct = (plan / max) * 100;
          const actualPct = (actual / max) * 100;
          const v = variance(actual, plan);
          const s = STATUS_STYLES[statusFromPct(v.pct)];
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => openDrill(r, period)}
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

function NikiPerformanceTabInner() {
  const { rows, isLoading } = useNikiPerformanceMetrics();
  const { user } = useAuth();
  const { plan: planMap } = useNikiPerformancePlan();
  const [drill, setDrill] = useState<{ title: string; deals: PerfDeal[] } | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const canEditModel = canEditPerformanceModel(user);
  const effectiveMode: 'view' | 'edit' = canEditModel ? mode : 'view';

  // ─── User-scoped display preferences (persisted in localStorage) ─────────
  const prefsKey = user?.id ? `nikiPerf.prefs.${user.id}` : 'nikiPerf.prefs.anon';
  const [showPlan, setShowPlan] = useState(true);
  const [showActual, setShowActual] = useState(true);
  const [showVarDelta, setShowVarDelta] = useState(true);
  const [perfMode, setPerfMode] = useState<PerfMode>('quarterly');
  const [hiddenCharts, setHiddenCharts] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(prefsKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.showPlan === 'boolean') setShowPlan(p.showPlan);
        if (typeof p.showActual === 'boolean') setShowActual(p.showActual);
        if (typeof p.showVarDelta === 'boolean') setShowVarDelta(p.showVarDelta);
        if (p.perfMode === 'quarterly' || p.perfMode === 'ytd') setPerfMode(p.perfMode);
        if (Array.isArray(p.hiddenCharts)) setHiddenCharts(p.hiddenCharts.filter((x: any) => typeof x === 'string'));
      }
    } catch {}
    setPrefsLoaded(true);
  }, [prefsKey]);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(
        prefsKey,
        JSON.stringify({ showPlan, showActual, showVarDelta, perfMode, hiddenCharts }),
      );
    } catch {}
  }, [prefsLoaded, prefsKey, showPlan, showActual, showVarDelta, perfMode, hiddenCharts]);

  const isChartHidden = (id: string) => hiddenCharts.includes(id);
  const toggleChartHidden = (id: string) =>
    setHiddenCharts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Guard: at least one data group must remain visible
  const togglePlan = () => {
    if (showPlan && !showActual && !showVarDelta) return;
    setShowPlan((v) => !v);
  };
  const toggleActual = () => {
    if (showActual && !showPlan && !showVarDelta) return;
    setShowActual((v) => !v);
  };
  const toggleVarDelta = () => {
    if (showVarDelta && !showPlan && !showActual) return;
    setShowVarDelta((v) => !v);
  };

  const byKey = useMemo(() => {
    const m = new Map<MetricRowKey, MetricRow>();
    rows.forEach(r => m.set(r.key, r));
    return m;
  }, [rows]);

  const get = (k: MetricRowKey) => byKey.get(k);

  const openDrill = (row: MetricRow, q: QuarterKey | 'YEAR' | 'YTD') => {
    let deals: PerfDeal[];
    let label: string;
    if (q === 'YEAR') {
      deals = row.yearDeals;
      label = '2026';
    } else if (q === 'YTD') {
      // YTD = quarters Q1..currentQuarter so drilldown totals match displayed value.
      const cur = currentQuarterKey();
      const idx = QUARTER_ORDER_LIST.indexOf(cur);
      deals = [];
      for (let i = 0; i <= idx; i++) {
        const qk = QUARTER_ORDER_LIST[i];
        deals = deals.concat(row.byQuarter[qk].deals);
      }
      label = `${cur} 2026 YTD`;
    } else {
      deals = row.byQuarter[q].deals;
      label = `${q} 2026`;
    }
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
  const revenueDollarsRows = [
    'retainerRevenue',
    'consultingMilestoneRevenue',
    'feeRevenue',
    'totalRevenue',
  ] as MetricRowKey[];

  // ─── Period selection (multi-quarter capable) ────────────────────────────
  type PeriodKey = QuarterKey | 'YEAR' | 'YTD';
  const allQuarterKeys: QuarterKey[] = NIKI_QUARTERS.map((q) => q.key);

  // Default to current quarter (May 2026 → Q2)
  const currentQuarter: QuarterKey = currentQuarterKey();

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

  const periodLabel = (k: PeriodKey) => {
    if (k === 'YEAR') return '2026';
    if (k === 'YTD') return `${currentQuarterKey()} 2026 YTD`;
    return `${k} 2026`;
  };

  // In YTD mode, the per-quarter breakdown is hidden — render exactly one
  // YTD column (cumulative through the current quarter). In quarterly mode
  // keep the multi-quarter selection behavior.
  const orderedSelected: PeriodKey[] = useMemo(() => {
    if (perfMode === 'ytd') return ['YTD'];
    const order: PeriodKey[] = [...allQuarterKeys, 'YEAR'];
    return order.filter((k) => selectedPeriods.includes(k));
  }, [selectedPeriods, perfMode]);

  const isSingle = orderedSelected.length === 1;

  const cellFor = (row: MetricRow, k: PeriodKey) => {
    const { planVal, actualVal } = resolvePeriod(row, planMap, k, perfMode);
    const v = variance(actualVal, planVal);
    return { planVal, actualVal, v, status: statusFromPct(v.pct) };
  };

  // Primary period for KPI cards: YTD when in YTD mode, otherwise the
  // highest quarter selected (or YEAR if only YEAR is selected).
  const kpiPeriod: PeriodKey = useMemo(() => {
    if (perfMode === 'ytd') return 'YTD';
    const quarters = orderedSelected.filter((k) => k !== 'YEAR') as QuarterKey[];
    if (quarters.length === 0) return 'YEAR';
    return quarters[quarters.length - 1];
  }, [orderedSelected, perfMode]);

  const kpiPeriodLabel = periodLabel(kpiPeriod);

  const perPeriodCols = (showPlan ? 1 : 0) + (showActual ? 1 : 0) + (showVarDelta ? 2 : 0);
  const totalCols = isSingle
    ? 1 + perPeriodCols + 1 /* status */
    : 1 + orderedSelected.length * perPeriodCols;

  const SectionHeaderRow = ({ title }: { title: string }) => (
    <TableRow className="hover:bg-transparent border-b-0">
      <TableCell
        colSpan={totalCols}
        className="pt-6 pb-2 px-4 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/80 bg-transparent"
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-3 bg-border/60" />
          {title}
        </span>
      </TableCell>
    </TableRow>
  );

  const SingleRow = ({ row }: { row: MetricRow }) => {
    const k = orderedSelected[0];
    const { planVal, actualVal, v, status } = cellFor(row, k);
    const s = STATUS_STYLES[status];
    return (
      <TableRow
        className="cursor-pointer border-b border-border/10 hover:bg-muted/10 transition-colors"
        onClick={() => openDrill(row, k)}
      >
        <TableCell className="py-3 px-4 font-medium text-sm text-foreground">{row.label}</TableCell>
        {showPlan && (
          <TableCell className="py-3 px-4 text-center tabular-nums text-sm font-semibold tracking-tight text-foreground">
            {fmt(planVal, row.unit)}
          </TableCell>
        )}
        {showActual && (
          <TableCell className="py-3 px-4 text-center tabular-nums text-sm font-normal text-foreground/80">{fmt(actualVal, row.unit)}</TableCell>
        )}
        {showVarDelta && (
          <>
            <TableCell className={cn('py-3 px-4 text-center tabular-nums text-sm font-medium', s.text)}>
              {v.diff >= 0 ? '+' : ''}{fmt(v.diff, row.unit)}
            </TableCell>
            <TableCell className={cn('py-3 px-4 text-center tabular-nums text-sm font-semibold', s.text)}>
              {v.pct === null ? '—' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(0)}%`}
            </TableCell>
          </>
        )}
        <TableCell className="py-3 px-4 text-center">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1', s.bg, s.text, s.ring)}>
            <s.Icon className="h-3 w-3" />
            {s.label}
          </span>
        </TableCell>
      </TableRow>
    );
  };

  const MultiRow = ({ row }: { row: MetricRow }) => (
    <TableRow className="border-b border-border/10 hover:bg-muted/10 transition-colors">
      <TableCell className="py-3 px-4 font-medium text-sm text-foreground sticky left-0 bg-card z-10">
        {row.label}
      </TableCell>
      {orderedSelected.map((k) => {
        const { planVal, actualVal, v, status } = cellFor(row, k);
        const s = STATUS_STYLES[status];
        return (
          <Fragment key={k}>
            {showPlan && (
              <TableCell className="py-3 px-3 text-center tabular-nums text-xs font-semibold tracking-tight text-foreground border-l border-border/20">
                {fmt(planVal, row.unit)}
              </TableCell>
            )}
            {showActual && (
              <TableCell
                className={cn(
                  'py-3 px-3 text-center tabular-nums text-xs font-normal text-foreground/80 cursor-pointer hover:underline',
                  !showPlan && 'border-l border-border/20',
                )}
                onClick={() => openDrill(row, k)}
              >
                {fmt(actualVal, row.unit)}
              </TableCell>
            )}
            {showVarDelta && (
              <>
                <TableCell className={cn('py-3 px-3 text-center tabular-nums text-xs font-medium', s.text, !showPlan && !showActual && 'border-l border-border/20')}>
                  {v.diff >= 0 ? '+' : ''}{fmt(v.diff, row.unit)}
                </TableCell>
                <TableCell className={cn('py-3 px-3 text-center tabular-nums text-xs font-semibold', s.text)}>
                  {v.pct === null ? '—' : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(0)}%`}
                </TableCell>
              </>
            )}
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
          {canEditModel && (
            <Button
              variant={mode === 'edit' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
              className="gap-1.5"
            >
              {mode === 'edit' ? <LayoutDashboard className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {mode === 'edit' ? 'Dashboard view' : 'Edit model'}
            </Button>
          )}
        </div>
      </div>

      {effectiveMode === 'view' ? (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiKeys.map((k) => {
              const r = get(k);
              if (!r) return null;
              const { planVal, actualVal } = resolvePeriod(r, planMap, kpiPeriod, perfMode);
              return (
                <KpiCard
                  key={k}
                  row={r}
                  planVal={planVal}
                  actualVal={actualVal}
                  periodLabel={kpiPeriodLabel}
                  onClick={() => openDrill(r, kpiPeriod)}
                />
              );
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Master mode: Quarter by Quarter vs YTD */}
                <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                  {([
                    { key: 'quarterly', label: 'Quarter by Quarter' },
                    { key: 'ytd', label: 'YTD' },
                  ] as const).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPerfMode(m.key as PerfMode)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                        perfMode === m.key
                          ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/30'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      title={`Switch to ${m.label} mode`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {/* Quarter selector */}
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
                {/* Column visibility toggles */}
                <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                  {([
                    { key: 'plan', label: 'Plan', active: showPlan, toggle: togglePlan },
                    { key: 'actual', label: 'Actual', active: showActual, toggle: toggleActual },
                    { key: 'var', label: 'Variance + Δ', active: showVarDelta, toggle: toggleVarDelta },
                  ] as const).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={c.toggle}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                        c.active
                          ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/30'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      title={`Toggle ${c.label} column${c.key === 'var' ? 's' : ''}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  {isSingle ? (
                    <TableRow className="hover:bg-transparent border-b border-border/30">
                      <TableHead className="h-10 px-4 text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Metric</TableHead>
                      {showPlan && <TableHead className="h-10 px-4 text-center text-[10px] uppercase tracking-[0.12em] font-semibold text-foreground/90">Plan</TableHead>}
                      {showActual && <TableHead className="h-10 px-4 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Actual</TableHead>}
                      {showVarDelta && <TableHead className="h-10 px-4 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Δ</TableHead>}
                      {showVarDelta && <TableHead className="h-10 px-4 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Var %</TableHead>}
                      <TableHead className="h-10 px-4 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Status</TableHead>
                    </TableRow>
                  ) : (
                    <>
                      <TableRow className="hover:bg-transparent border-b-0">
                        <TableHead rowSpan={2} className="h-9 px-4 text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground sticky left-0 bg-card z-10 align-bottom">
                          Metric
                        </TableHead>
                        {orderedSelected.map((k) => (
                          <TableHead
                            key={k}
                            colSpan={perPeriodCols}
                            className="h-9 px-3 text-center text-[11px] tracking-tight font-semibold text-foreground border-l border-border/20"
                          >
                            {periodLabel(k)}
                          </TableHead>
                        ))}
                      </TableRow>
                      <TableRow className="hover:bg-transparent border-b border-border/30">
                        {orderedSelected.map((k) => (
                          <Fragment key={k}>
                            {showPlan && <TableHead className="h-8 px-3 text-center text-[10px] uppercase tracking-[0.12em] font-semibold text-foreground/90 border-l border-border/20">Plan</TableHead>}
                            {showActual && <TableHead className={cn('h-8 px-3 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground', !showPlan && 'border-l border-border/20')}>Actual</TableHead>}
                            {showVarDelta && (
                              <>
                                <TableHead className={cn('h-8 px-3 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground', !showPlan && !showActual && 'border-l border-border/20')}>Δ</TableHead>
                                <TableHead className="h-8 px-3 text-center text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Var %</TableHead>
                              </>
                            )}
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
                  <ScorecardSection title="Revenue ($)" keys={revenueDollarsRows} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Per-metric quarterly bar charts */}
          {(() => {
            const allChartIds = [
              ...productionRows,
              ...conversionRows,
              ...revenueRows,
              'funnel',
            ];
            const hiddenIds = allChartIds.filter((id) => isChartHidden(id));
            return (
            <div className="space-y-5">
              {hiddenIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Hidden charts ({hiddenIds.length})
                  </span>
                  {hiddenIds.map((id) => {
                    const r = id === 'funnel' ? null : get(id as MetricRowKey);
                    const label = id === 'funnel' ? 'Pipeline Funnel' : r?.label ?? id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleChartHidden(id)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={`Show ${label}`}
                      >
                        <EyeOff className="h-3 w-3" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {[
                { title: 'Pipeline Production', keys: productionRows },
                { title: 'Conversion Milestones', keys: conversionRows },
                { title: 'Revenue', keys: revenueRows },
              ].map((section) => {
                const visibleKeys = section.keys.filter((k) => !isChartHidden(k));
                if (visibleKeys.length === 0) return null;
                return (
                <div key={section.title}>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {section.title}
                      {perfMode === 'ytd' && (
                        <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">· cumulative YTD</span>
                      )}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {visibleKeys.map((k) => {
                      const r = get(k);
                      if (!r) return null;
                      return (
                        <MetricQuarterlyBarChart
                          key={k}
                          row={r}
                          mode={perfMode}
                          onBarClick={(q) => openDrill(r, q)}
                          onToggleHide={() => toggleChartHidden(k)}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}

              {!isChartHidden('funnel') && (
                <FunnelSection
                  rows={funnelRows}
                  openDrill={openDrill}
                  mode={perfMode}
                  period={kpiPeriod}
                  periodLabel={kpiPeriodLabel}
                  onToggleHide={() => toggleChartHidden('funnel')}
                />
              )}

              <PipelineConversionForecastCard />
            </div>
            );
          })()}
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Edit mode — configure the underlying plan model. Click the button again to return to the
            dashboard view.
          </div>
          <QuarterlyPlanEditor />
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

export function NikiPerformanceTab() {
  return (
    <NikiPerformancePlanProvider>
      <NikiPerformanceTabInner />
    </NikiPerformancePlanProvider>
  );
}
