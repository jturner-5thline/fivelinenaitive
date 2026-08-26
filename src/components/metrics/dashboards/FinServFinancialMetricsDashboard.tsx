import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, TrendingUp, TrendingDown, Minus, Clock, Pencil, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricManualInputDialog } from './MetricManualInputDialog';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, ComposedChart, Legend, Cell, ReferenceLine, LabelList,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { InsightsDrilldownDrawer, type DrilldownContext, type DrilldownColumn } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import {
  useFinServTotalRevenue,
  useFinServQuarterlyProfits,
  useFinServRevenueByClient,
  useFinServCashflow,
  useFinServActiveClients,
} from '@/hooks/useFinServFinancialMetrics';
import { FINSERV_PIPELINE_ID, ACTIVE_CLIENT_STAGE, applyActiveClientOverride } from '@/hooks/useFinServFinancialMetrics';
import { useFinServNewMrrAdded } from '@/hooks/useFinServNewMrrAdded';
import { useFinServNrr } from '@/hooks/useFinServNrr';

import {
  useQBStackedFinServRevenue,
  FINSERV_STACKED_CATEGORIES,
} from '@/hooks/useQBStackedFinServRevenue';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { buildCustomPeriod } from '@/hooks/useQBQuarterlyRevenue';
import { DrilldownProvider, useDrilldown, type DrilldownRequest } from '@/components/insights/ChartDrilldown';
import { buildBuckets } from '@/lib/insightsTimeRange';
import { UtilizationWidget } from '@/components/metrics/finserv-charts/UtilizationWidget';
import { DashboardPlansGear } from './plans/DashboardPlansGear';

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const fmtCurrencyFull = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtCurrencyPrecise = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtPctPrecise = (v: number) => `${v.toFixed(2)}%`;

// ────────────────────────────────────────────────────────────
// Shared widget wrappers
// ────────────────────────────────────────────────────────────

function WidgetLoading({ subtitle = 'Fetching from QuickBooks…' }: { subtitle?: string }) {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-[180px] w-full" />
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function WidgetError({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <AlertCircle className="h-8 w-8 mb-2 text-destructive/60" />
      <p className="text-sm">{message || 'Failed to load data'}</p>
    </div>
  );
}

function WidgetEmpty({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <p className="text-sm">{message || 'No data for this period'}</p>
    </div>
  );
}

function PlaceholderWidget({ title }: { title: string }) {
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Badge variant="outline" className="w-fit text-xs">Monthly · Past 6 months</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">Formula pending</p>
          <p className="text-xs mt-1 opacity-60">This widget is configured but awaiting calculation logic</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Least-squares linear best-fit trend across an ordered series.
 * Nulls in the input are treated as gaps (skipped for fitting but keep index).
 * Returns an array the same length as `values`, with the fitted y for every index
 * (including the gap indexes so the line still spans across them).
 */
function computeLinearTrend(values: Array<number | null | undefined>): (number | null)[] {
  const pts: Array<{ x: number; y: number }> = [];
  values.forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) pts.push({ x: i, y: v });
  });
  if (pts.length < 2) return values.map(() => null);
  const n = pts.length;
  const sumX = pts.reduce((a, p) => a + p.x, 0);
  const sumY = pts.reduce((a, p) => a + p.y, 0);
  const sumXY = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = pts.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return values.map(() => null);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, i) => intercept + slope * i);
}

function TrendToggleButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Toggle trend line"
      className={
        'text-[11px] px-2 py-0.5 rounded-md border border-border/60 transition-colors ' +
        (active
          ? 'bg-primary/20 text-foreground'
          : 'bg-white/[0.04] text-muted-foreground hover:text-foreground')
      }
    >
      Trend
    </button>
  );
}

function TrendDeltaText({
  values,
  format,
  className = '',
}: {
  values: Array<number | null | undefined>;
  format: (v: number) => string;
  className?: string;
}) {
  const trend = useMemo(() => computeLinearTrend(values), [values]);
  const first = trend.find((v) => v != null) as number | undefined;
  const last = [...trend].reverse().find((v) => v != null) as number | undefined;
  if (first == null || last == null) return null;
  const delta = last - first;
  const pct = first !== 0 ? (delta / first) * 100 : null;
  const positive = delta >= 0;
  const color =
    delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground';
  return (
    <span className={`text-xs font-medium ${color} ${className}`}>
      Trend: {positive ? '+' : ''}
      {pct != null ? `${pct.toFixed(1)}%` : '—'}
      {' / '}
      {positive ? '+' : ''}
      {format(delta)}
      <span className="text-muted-foreground font-normal"> vs start of period</span>
    </span>
  );
}

function DeltaTooltip({
  active,
  payload,
  label,
  data,
  dataKey,
  format,
  seriesName,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  data: any[];
  dataKey: string;
  format: (v: number) => string;
  seriesName: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const current = payload.find((p: any) => p.dataKey === dataKey) ?? payload[0];
  const row = current?.payload;
  const idx = row ? data.indexOf(row) : -1;
  const currentVal = Number(current?.value) || 0;
  const prev = idx > 0 ? data[idx - 1] : null;
  const prevVal = prev ? Number((prev as any)[dataKey]) : null;
  const delta = prevVal != null ? currentVal - prevVal : null;
  const pct =
    prevVal != null && prevVal !== 0 ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100 : null;
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      style={{
        background: 'rgba(8,8,12,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '8px 10px',
        color: '#ECECF4',
        fontSize: 12,
      }}
    >
      <div style={{ color: '#8A8AA6', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>
        {seriesName}: {format(currentVal)}
      </div>
      {delta != null && (
        <div
          style={{
            color: positive ? '#5EEAD4' : '#FB7185',
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {positive ? '▲' : '▼'} {positive ? '+' : ''}
          {format(delta)}
          {pct != null ? ` (${positive ? '+' : ''}${pct.toFixed(1)}%)` : ''} vs prev
        </div>
      )}
    </div>
  );
}

function FinServSnapshotCard({
  label,
  value,
  subtitle,
  format,
  isLoading,
}: {
  label: string;
  value: number;
  subtitle?: string;
  format?: 'currency' | 'number';
  isLoading?: boolean;
}) {
  const display = isLoading
    ? '—'
    : format === 'currency'
      ? fmtCurrencyFull(value)
      : value.toLocaleString();
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold text-foreground tabular-nums">{display}</div>
        {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function GrossProfitToggleCard({
  periodBadge,
  totalRev,
  profits,
  openSinglePoint,
}: {
  periodBadge: string;
  totalRev: { grossProfit: number; grossMargin: number | null };
  profits: {
    isLoading: boolean;
    error: unknown;
    quarters: Array<{ quarter: string; revenue: number; grossProfit: number; grossMargin: number }>;
  };
  openSinglePoint: (metric: string, label: string, name: string, value: number, fmt: (v: number) => string) => void;
}) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const isDollar = mode === '$';
  const [showTrend, setShowTrend] = useState(false);
  const chartData = useMemo(() => {
    const source = profits.quarters.map(q => isDollar ? q.grossProfit : q.grossMargin);
    const trend = computeLinearTrend(source);
    return profits.quarters.map((q, i) => ({ ...q, trend: trend[i] }));
  }, [profits.quarters, isDollar]);
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">
              {isDollar ? 'Gross Profit $' : 'Gross Profit Margin %'}
            </CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <TrendToggleButton active={showTrend} onToggle={() => setShowTrend(v => !v)} />
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(['$', '%'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    'px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (mode === m
                      ? 'bg-primary/20 text-foreground'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-3xl font-semibold text-foreground">
            {isDollar
              ? fmtCurrencyPrecise(totalRev.grossProfit)
              : typeof totalRev.grossMargin === 'number' ? fmtPctPrecise(totalRev.grossMargin) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            {isDollar ? 'Gross Profit from QuickBooks P&L' : 'Gross Profit ÷ Revenue'}
          </div>
          {showTrend && (
            <div className="mt-1">
              <TrendDeltaText
                values={profits.quarters.map((q) => (isDollar ? q.grossProfit : q.grossMargin))}
                format={isDollar ? fmtCurrencyFull : (v: number) => `${v.toFixed(1)}%`}
              />
            </div>
          )}
        </div>
        {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every(q => isDollar ? (q.grossProfit === 0 && q.revenue === 0) : q.grossMargin === 0) ? <WidgetEmpty /> : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                {isDollar ? (
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                ) : (
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                )}
                <Tooltip
                  content={(props: any) => (
                    <DeltaTooltip
                      {...props}
                      data={chartData}
                      dataKey={isDollar ? 'grossProfit' : 'grossMargin'}
                      format={isDollar ? fmtCurrencyFull : fmtPct}
                      seriesName={isDollar ? 'Gross Profit' : 'Gross Margin'}
                    />
                  )}
                />
                {isDollar ? (
                  <Bar
                    dataKey="grossProfit"
                    fill="hsl(var(--chart-2))"
                    name="Gross Profit"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('Gross Profit $', d?.quarter, 'Gross Profit', Number(d?.grossProfit) || 0, fmtCurrencyFull)}
                  />
                ) : (
                  <Bar
                    dataKey="grossMargin"
                    fill="hsl(160, 65%, 50%)"
                    name="Gross Margin %"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('Gross Profit Margin %', d?.quarter, 'Gross Margin', Number(d?.grossMargin) || 0, fmtPct)}
                  />
                )}
                {showTrend && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="hsl(142 71% 45%)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={false}
                    name="Best-fit trend"
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OperatingProfitToggleCard({
  periodBadge,
  totalRev,
  profits,
  openSinglePoint,
}: {
  periodBadge: string;
  totalRev: { operatingProfit: number; operatingMargin: number | null };
  profits: {
    isLoading: boolean;
    error: unknown;
    quarters: Array<{ quarter: string; revenue: number; operatingProfit: number; operatingMargin: number }>;
  };
  openSinglePoint: (metric: string, label: string, name: string, value: number, fmt: (v: number) => string) => void;
}) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const isDollar = mode === '$';
  const [showTrend, setShowTrend] = useState(false);
  const chartData = useMemo(() => {
    const source = profits.quarters.map(q => isDollar ? q.operatingProfit : q.operatingMargin);
    const trend = computeLinearTrend(source);
    return profits.quarters.map((q, i) => ({ ...q, trend: trend[i] }));
  }, [profits.quarters, isDollar]);
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">
              {isDollar ? 'Operating Profit $' : 'Operating Margin %'}
            </CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <TrendToggleButton active={showTrend} onToggle={() => setShowTrend(v => !v)} />
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(['$', '%'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    'px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (mode === m
                      ? 'bg-primary/20 text-foreground'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-3xl font-semibold text-foreground">
            {isDollar
              ? fmtCurrencyPrecise(totalRev.operatingProfit)
              : typeof totalRev.operatingMargin === 'number' ? fmtPctPrecise(totalRev.operatingMargin) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            {isDollar ? 'Gross Profit − Operating Expenses from QuickBooks P&L' : 'Operating Profit ÷ Revenue'}
          </div>
          {showTrend && (
            <div className="mt-1">
              <TrendDeltaText
                values={profits.quarters.map((q) => (isDollar ? q.operatingProfit : q.operatingMargin))}
                format={isDollar ? fmtCurrencyFull : (v: number) => `${v.toFixed(1)}%`}
              />
            </div>
          )}
        </div>
        {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every(q => isDollar ? (q.operatingProfit === 0 && q.revenue === 0) : q.operatingMargin === 0) ? <WidgetEmpty /> : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                {isDollar ? (
                  <YAxis
                    tickFormatter={fmtCurrency}
                    tick={{ fontSize: 10 }}
                    domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]}
                  />
                ) : (
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} />
                )}
                <Tooltip
                  content={(props: any) => (
                    <DeltaTooltip
                      {...props}
                      data={chartData}
                      dataKey={isDollar ? 'operatingProfit' : 'operatingMargin'}
                      format={isDollar ? fmtCurrencyFull : fmtPct}
                      seriesName={isDollar ? 'Operating Profit' : 'Operating Margin'}
                    />
                  )}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={0.75} />
                {isDollar ? (
                  <Bar
                    dataKey="operatingProfit"
                    fill="hsl(var(--primary))"
                    name="Operating Profit"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('Operating Profit $', d?.quarter, 'Operating Profit', Number(d?.operatingProfit) || 0, fmtCurrencyFull)}
                  >
                    {profits.quarters.map((entry, i) => (
                      <Cell key={i} fill={entry.operatingProfit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                ) : (
                  <Bar
                    dataKey="operatingMargin"
                    fill="hsl(35, 85%, 55%)"
                    name="Operating Margin %"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('Operating Margin %', d?.quarter, 'Operating Margin', Number(d?.operatingMargin) || 0, fmtPct)}
                  >
                    {profits.quarters.map((entry, i) => (
                      <Cell key={i} fill={entry.operatingMargin >= 0 ? 'hsl(35, 85%, 55%)' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                )}
                {showTrend && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="hsl(142 71% 45%)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={false}
                    name="Best-fit trend"
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Active Clients — matches the "Deals on Board" MetricWidget on the
// Sales Dashboard (dark glass surface, icon chip, uppercase label,
// big number + delta, sparkline trend). No plan series exists for
// this metric, so the trend line renders as a single "Actual" line.
// ────────────────────────────────────────────────────────────

const MW_TOKENS = {
  textPrimary: '#ECECF4',
  textMuted: '#8A8AA6',
  textFaint: '#5A5A72',
  periwinkle: '#9DA2F5',
  cyan: '#5EEAD4',
  rose: '#FB7185',
  surface: 'rgba(255,255,255,0.035)',
  surfaceBorder: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.06)',
};
const MW_GLASS: React.CSSProperties = {
  background: MW_TOKENS.surface,
  border: `1px solid ${MW_TOKENS.surfaceBorder}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 8,
};

function ActiveClientsMetricWidget({
  data,
  periodBadge,
  onDrill,
}: {
  data: {
    currentCount: number;
    priorCount: number;
    variance: number | null;
    trend: { month: string; monthKey: string; count: number }[];
    isLoading: boolean;
    error: unknown;
  };
  periodBadge: string;
  onDrill: (index: number) => void;
}) {
  const T = MW_TOKENS;
  const current = data.currentCount ?? 0;
  const prior = data.priorCount ?? 0;
  const gap = current - prior;
  const deltaPct = prior === 0 ? 0 : (current - prior) / prior;
  const positive = deltaPct >= 0;
  const sparkData = data.trend.map((t) => ({ month: t.month, actual: t.count }));
  const [showTrend, setShowTrend] = useState(false);
  const sparkDataWithTrend = useMemo(() => {
    const trend = computeLinearTrend(sparkData.map(d => d.actual));
    return sparkData.map((d, i) => ({ ...d, trend: trend[i] }));
  }, [sparkData]);

  const hasData = !data.isLoading && !data.error && data.trend.some((t) => t.count > 0);

  return (
    <button
      type="button"
      onClick={() => onDrill(sparkData.length - 1)}
      style={MW_GLASS}
      className="relative p-4 flex flex-col gap-2 overflow-hidden text-left cursor-pointer transition-transform hover:-translate-y-[1px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
      aria-label="Drill into Active Clients"
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: 28, height: 28, background: 'rgba(157,162,245,0.14)', color: T.periwinkle }}
        >
          <Users size={14} />
        </div>
        <div
          className="text-[10px] font-medium uppercase"
          style={{ color: T.textMuted, letterSpacing: '0.08em' }}
        >
          Active Clients
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setShowTrend(v => !v); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setShowTrend(v => !v); }
            }}
            title="Toggle trend line"
            className={
              'text-[10px] px-2 py-0.5 rounded-md border border-border/60 transition-colors ' +
              (showTrend ? 'bg-primary/20 text-foreground' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground')
            }
          >
            Trend
          </span>
          <span className="text-[10px]" style={{ color: T.textFaint }}>{periodBadge}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <div
          className="text-3xl font-semibold leading-none"
          style={{ color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}
        >
          {data.isLoading ? '—' : current.toLocaleString()}
        </div>
        {prior > 0 && (
          <div
            className="flex items-center gap-0.5 text-xs font-medium"
            style={{ color: positive ? T.cyan : T.rose, fontVariantNumeric: 'tabular-nums' }}
          >
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {positive ? '+' : '−'}
            {Math.abs(Math.round(deltaPct * 100))}%
          </div>
        )}
      </div>
      <div
        className="flex items-center justify-between text-[11px]"
        style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}
      >
        <span>
          vs prior {prior.toLocaleString()} ·{' '}
          <span style={{ color: gap >= 0 ? T.cyan : T.rose }}>
            {gap >= 0 ? '+' : '−'}
            {Math.abs(gap).toLocaleString()}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 2, background: T.cyan, display: 'inline-block', borderRadius: 1 }} />
            Actual
          </span>
        </span>
      </div>
      {showTrend && (
        <div className="mt-1">
          <TrendDeltaText
            values={sparkData.map((d) => d.actual)}
            format={(v: number) => `${v >= 0 ? '' : ''}${Math.round(v).toLocaleString()}`}
          />
        </div>
      )}
      <div style={{ height: 160 }} className="mt-2">
        {!hasData ? (
          <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: T.textFaint }}>
            {data.isLoading ? 'Loading…' : data.error ? 'Failed to load' : 'No active FinServ clients yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={sparkDataWithTrend}
              margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="25%"
              onClick={(state: { activeTooltipIndex?: number } | null) => {
                if (state && typeof state.activeTooltipIndex === 'number') {
                  onDrill(state.activeTooltipIndex);
                }
              }}
            >
              <CartesianGrid stroke={T.hairline} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: T.textFaint, fontSize: 10 }}
                axisLine={{ stroke: T.hairline }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: T.textFaint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(94,234,212,0.08)' }}
                content={(props: any) => (
                  <DeltaTooltip
                    {...props}
                    data={sparkDataWithTrend}
                    dataKey="actual"
                    format={(v: number) => Math.round(v).toLocaleString()}
                    seriesName="Active Clients"
                  />
                )}
              />
              <Bar
                dataKey="actual"
                name="Active Clients"
                fill={T.cyan}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                cursor="pointer"
              />
              {showTrend && (
                <Line
                  type="monotone"
                  dataKey="trend"
                  stroke="hsl(142 71% 45%)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  name="Best-fit trend"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </button>
  );
}

function PerHourWidget({
  title,
  numeratorLabel,
  monthKeys,
  monthLabels,
  badge,
  numeratorByMonth,
}: {
  title: string;
  /** Short label for the numerator, e.g. "Revenue" or "Profit". */
  numeratorLabel: string;
  monthKeys: string[];
  monthLabels: string[];
  badge: string;
  numeratorByMonth: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'monthly' | 'avg'>('monthly');
  const [showTrend, setShowTrend] = useState(false);
  const { company } = useCompany();
  const companyId = company?.id ?? null;

  const { data: hoursByMonth = {}, isLoading } = useQuery({
    queryKey: ['rev-per-hour-hours', companyId, monthKeys.join('|'), open],
    queryFn: async () => {
      if (monthKeys.length === 0) return {} as Record<string, number>;
      let q = supabase
        .from('metric_manual_inputs')
        .select('month_key, value')
        .eq('metric_key', 'revenue_per_hour_hours')
        .in('month_key', monthKeys);
      q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of data ?? []) {
        const v = (r as any).value;
        if (v != null) out[(r as any).month_key as string] = Number(v);
      }
      return out;
    },
  });

  const chartData = useMemo(() => {
    const rows = monthKeys.map((k, i) => {
      const numerator = Number(numeratorByMonth[k] ?? 0);
      const hours = Number(hoursByMonth[k] ?? 0);
      const rate = hours > 0 ? numerator / hours : null;
      return {
        month: monthLabels[i] ?? k,
        monthKey: k,
        numerator,
        hours,
        rate,
        delta: null as number | null,
      };
    });
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].rate;
      const cur = rows[i].rate;
      if (prev != null && prev !== 0 && cur != null) {
        rows[i].delta = ((cur - prev) / Math.abs(prev)) * 100;
      }
    }
    return rows;
  }, [monthKeys, monthLabels, numeratorByMonth, hoursByMonth]);

  const totals = useMemo(() => {
    const numerator = chartData.reduce((s, d) => s + d.numerator, 0);
    const hours = chartData.reduce((s, d) => s + d.hours, 0);
    const rate = hours > 0 ? numerator / hours : null;
    return { numerator, hours, rate };
  }, [chartData]);

  const hasAnyHours = chartData.some((d) => d.hours > 0);

  const periodChange = useMemo(() => {
    const rated = chartData.filter((d) => d.rate != null);
    if (rated.length < 2) return null;
    const first = rated[0];
    const last = rated[rated.length - 1];
    const absDelta = (last.rate as number) - (first.rate as number);
    const pctDelta = first.rate ? (absDelta / Math.abs(first.rate as number)) * 100 : null;
    return { first, last, absDelta, pctDelta };
  }, [chartData]);

  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Badge variant="outline" className="w-fit text-xs mt-1">{badge}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <div className="inline-flex rounded-md border border-border/60 bg-white/[0.04] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setView('monthly')}
                className={`px-2 py-0.5 rounded-[4px] transition-colors ${view === 'monthly' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setView('avg')}
                className={`px-2 py-0.5 rounded-[4px] transition-colors ${view === 'avg' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Avg.
              </button>
            </div>
            {view === 'monthly' && (
              <button
                type="button"
                onClick={() => setShowTrend((v) => !v)}
                className={`text-[11px] px-2 py-0.5 rounded-md border border-border/60 transition-colors ${showTrend ? 'bg-primary/20 text-foreground' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground'}`}
                title="Toggle trend line"
              >
                Trend
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 -mr-1 -mt-1"
              aria-label="Input monthly hours"
              title="Input monthly hours"
              onClick={() => setOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <WidgetLoading subtitle="Loading hours…" />
        ) : !hasAnyHours ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">No hours entered</p>
            <p className="text-xs mt-1 opacity-60">Click the pencil to input monthly hours</p>
          </div>
        ) : view === 'avg' ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="text-4xl font-semibold tabular-nums text-foreground">
              {totals.rate != null ? fmtCurrencyPrecise(totals.rate) : '—'}
              <span className="text-sm font-normal text-muted-foreground ml-1">/ hr</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2 tabular-nums">
              {fmtCurrencyFull(totals.numerator)} ÷ {totals.hours.toLocaleString()} hrs
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">Average across {badge.replace(/^Monthly · /, '')}</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-semibold tabular-nums">
                {totals.rate != null ? fmtCurrencyPrecise(totals.rate) : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">/ hr</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {fmtCurrency(totals.numerator)} · {totals.hours.toLocaleString()} hrs
              </div>
            </div>
            {showTrend && periodChange && (
              <div className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-muted-foreground">
                  {periodChange.first.month} → {periodChange.last.month}
                </span>
                <span
                  className={
                    periodChange.absDelta >= 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'
                  }
                >
                  {periodChange.absDelta >= 0 ? '+' : '−'}
                  {fmtCurrencyPrecise(Math.abs(periodChange.absDelta))} / hr
                  {periodChange.pctDelta != null && (
                    <span className="ml-1">
                      ({periodChange.pctDelta >= 0 ? '+' : ''}
                      {periodChange.pctDelta.toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={(props: any) => (
                      <DeltaTooltip
                        {...props}
                        data={chartData}
                        dataKey="rate"
                        format={fmtCurrencyPrecise}
                        seriesName={`${numeratorLabel} / hr`}
                      />
                    )}
                  />
                  <Bar
                    dataKey="rate"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList
                      dataKey="rate"
                      content={(props: any) => {
                        const { x, y, width, height, value, index } = props;
                        if (value == null) return null;
                        const d = chartData[index];
                        const cx = Number(x) + Number(width) / 2;
                        const delta = d?.delta;
                        const deltaColor = delta == null ? '#94a3b8' : delta >= 0 ? '#22c55e' : '#ef4444';
                        const deltaText =
                          delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
                        const h = Number(height);
                        const barTop = Number(y);
                        // Stack value + delta inside the bar, near the top.
                        const hasRoomForBoth = h >= 52;
                        const valueY = barTop + (hasRoomForBoth ? 22 : 18);
                        const deltaY = valueY + 20;
                        // Hide labels entirely if the bar is too short.
                        if (h < 22) return null;
                        return (
                          <g>
                            <text
                              x={cx}
                              y={valueY}
                              textAnchor="middle"
                              fontSize={20}
                              fontWeight={600}
                              fill="#ffffff"
                              stroke="rgba(0,0,0,0.75)"
                              strokeWidth={3}
                              paintOrder="stroke"
                            >
                              {fmtCurrency(Number(value))}
                            </text>
                            {deltaText && hasRoomForBoth && (
                              <text
                                x={cx}
                                y={deltaY}
                                textAnchor="middle"
                                fontSize={18}
                                fontWeight={600}
                                fill={deltaColor}
                                stroke="rgba(0,0,0,0.75)"
                                strokeWidth={3}
                                paintOrder="stroke"
                              >
                                {deltaText}
                              </text>
                            )}
                          </g>
                        );
                      }}
                    />
                  </Bar>
                  {showTrend && (
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
      <MetricManualInputDialog
        open={open}
        onOpenChange={setOpen}
        metricKey="revenue_per_hour_hours"
        title="Hours by Month"
        unitLabel="Hours"
        monthKeys={monthKeys}
        monthLabels={monthLabels}
      />
    </Card>
  );
}

function VarianceIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0)
    return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0{suffix}</span>;
  if (value > 0)
    return <span className="text-xs text-green-500 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" /> +{suffix === '%' ? fmtPct(value) : fmtCurrency(value)}</span>;
  return <span className="text-xs text-red-500 flex items-center gap-0.5"><TrendingDown className="h-3 w-3" /> {suffix === '%' ? fmtPct(value) : fmtCurrency(value)}</span>;
}

// ────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────

export function FinServFinancialMetricsDashboard() {
  return (
    <DrilldownProvider>
      <FinServFinancialMetricsDashboardInner />
    </DrilldownProvider>
  );
}

function FinServFinancialMetricsDashboardInner() {
  // Driven by the global Insights header timeframe (single source of truth).
  const { timeframe } = useInsightsTimeframe();
  const granularity: 'monthly' | 'quarterly' | 'yearly' = useMemo(() => {
    const s = new Date(timeframe.start);
    const e = new Date(timeframe.end);
    const months = Math.max(
      1,
      (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1,
    );
    if (months > 36) return 'yearly';
    if (months > 18) return 'quarterly';
    return 'monthly';
  }, [timeframe.start, timeframe.end]);
  const range = useMemo(
    () => ({
      granularity,
      resolved: { start: timeframe.start, end: timeframe.end, label: timeframe.label },
    }),
    [granularity, timeframe.start, timeframe.end, timeframe.label],
  );

  const [drill, setDrill] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn[];
    rows: Array<Record<string, unknown>>;
    defaultSort?: { key: string; dir: 'asc' | 'desc' };
  } | null>(null);

  // Per-widget "show best-fit trend line" toggles.
  const [showTrendRevenue, setShowTrendRevenue] = useState(false);
  const [showTrendCashflow, setShowTrendCashflow] = useState(true);
  const [showTrendAvgRevClient, setShowTrendAvgRevClient] = useState(true);

  const selectedPeriod = useMemo(() => ({
    start_date: range.resolved.start,
    end_date: range.resolved.end,
    label: range.resolved.label,
  }), [range.resolved.start, range.resolved.end, range.resolved.label]);

  const newMrr = useFinServNewMrrAdded(selectedPeriod);


  // Derive a QuarterOption-shaped value for legacy widgets bound to selectedQuarter.
  const selectedQuarter = useMemo(() => {
    const s = new Date(range.resolved.start + 'T00:00:00');
    const e = new Date(range.resolved.end + 'T00:00:00');
    const q = buildCustomPeriod(s, e);
    return { ...q, label: range.resolved.label };
  }, [range.resolved.start, range.resolved.end, range.resolved.label]);

  const openSinglePoint = (
    sourceLabel: string,
    label: string,
    metricName: string,
    rawValue: number,
    formatter: (v: number) => string,
    extraRows: Array<{ metric: string; value: string }> = [],
  ) => {
    setDrill({
      context: { sourceId: `finserv:${sourceLabel}`, sourceLabel, selection: label, periodLabel: selectedQuarter.label },
      columns: [
        { key: 'metric', label: 'Field' },
        { key: 'value', label: 'Value', align: 'right' },
      ],
      rows: [
        { metric: 'Period', value: label },
        { metric: metricName, value: formatter(rawValue) },
        ...extraRows,
      ],
    });
  };

  // Data hooks
  const totalRev = useFinServTotalRevenue(selectedPeriod, range.granularity);
  // Always-monthly revenue series for per-hour widgets.
  const totalRevMonthly = useFinServTotalRevenue(selectedPeriod, 'monthly');
  const profits = useFinServQuarterlyProfits(selectedPeriod, range.granularity);
  // Always-monthly operating-profit series for Profit per Hour widget.
  const profitsMonthly = useFinServQuarterlyProfits(selectedPeriod, 'monthly');
  const revenueByClient = useFinServRevenueByClient(selectedQuarter, selectedQuarter.months.length - 1);
  const cashflow = useFinServCashflow(selectedPeriod, range.granularity);
  const stacked = useQBStackedFinServRevenue(selectedQuarter);
  const activeClients = useFinServActiveClients(selectedPeriod, range.granularity);
  const nrr = useFinServNrr(range.resolved.start, range.resolved.end);


  // ── FinServ pipeline snapshot: Total Clients / Total MRR / Current Pipeline ──
  const pipelineSnapshot = useQuery({
    queryKey: ['finserv-pipeline-snapshot', FINSERV_PIPELINE_ID, range.resolved.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, stage, mrr')
        .eq('pipeline_id', FINSERV_PIPELINE_ID);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string; stage: string | null; mrr: number | string | null }>;
      const CURRENT_PIPELINE_STAGES = new Set([
        'fs-qualification', 'fs-discovery', 'fs-qualified',
        'fs-scoping', 'fs-proposal-sent', 'fs-negotiation',
      ]);
      const TERMINAL = new Set(['fs-churned', 'fs-closed-lost', 'fs-in-development']);
      let totalClients = 0;
      let totalMrr = 0;
      let currentPipeline = 0;
      for (const r of rows) {
        const stage = r.stage ?? '';
        if (stage === ACTIVE_CLIENT_STAGE) totalClients += 1;
        if (CURRENT_PIPELINE_STAGES.has(stage)) currentPipeline += 1;
        if (!TERMINAL.has(stage)) totalMrr += Number(r.mrr ?? 0);
      }
      // Apply Active Client override for the selected period end (falls back to today).
      const endStr = range.resolved.end;
      const effective = endStr ? new Date(endStr + 'T23:59:59') : new Date();
      const today = new Date();
      const effClamped = effective > today ? today : effective;
      const overriddenClients = applyActiveClientOverride(effClamped, totalClients);
      return { totalClients: overriddenClients, totalMrr, currentPipeline };
    },
    staleTime: 60_000,
  });

  const granularityLabel =
    range.granularity === 'monthly' ? 'Monthly' :
    range.granularity === 'quarterly' ? 'Quarterly' : 'Yearly';
  const periodBadge = `${granularityLabel} · ${selectedPeriod.label}`;

  // Months available for manual-input widgets (always monthly buckets across the timeframe).
  const monthlyBuckets = useMemo(
    () => buildBuckets(range.resolved.start, range.resolved.end, 'monthly'),
    [range.resolved.start, range.resolved.end],
  );
  const monthlyKeys = useMemo(() => monthlyBuckets.map((b) => b.key), [monthlyBuckets]);
  const monthlyLabels = useMemo(() => monthlyBuckets.map((b) => b.label), [monthlyBuckets]);
  const monthlyRevenueByKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of totalRevMonthly.months ?? []) {
      out[m.monthKey] = Number(m.amount ?? 0);
    }
    return out;
  }, [totalRevMonthly.months]);
  // Operating-profit-by-month, aligned to monthlyBuckets via index (same buildBuckets inputs).
  const monthlyProfitByKey = useMemo(() => {
    const out: Record<string, number> = {};
    const rows = profitsMonthly.quarters ?? [];
    monthlyBuckets.forEach((b, i) => {
      const row = rows[i];
      if (row) out[b.key] = Number(row.operatingProfit ?? 0);
    });
    return out;
  }, [monthlyBuckets, profitsMonthly.quarters]);

  // Resolve a clicked bucket label/monthKey to its actual start/end ymd.
  const { open: openDrill } = useDrilldown();
  const bucketIndex = useMemo(() => {
    const map = new Map<string, { start: string; end: string; label: string }>();
    const buckets = buildBuckets(range.resolved.start, range.resolved.end, range.granularity);
    for (const b of buckets) {
      map.set(b.key, { start: b.start_date, end: b.end_date, label: b.label });
      map.set(b.label, { start: b.start_date, end: b.end_date, label: b.label });
    }
    return map;
  }, [range.resolved.start, range.resolved.end, range.granularity]);
  const resolveBucket = (keyOrLabel: string | undefined): DrilldownRequest['period'] => {
    if (keyOrLabel) {
      const hit = bucketIndex.get(keyOrLabel);
      if (hit) return hit;
    }
    return { start: range.resolved.start, end: range.resolved.end, label: range.resolved.label };
  };

  // ── Derived: Average Revenue by Client per bucket = revenue / active-clients-at-end-of-period
  const avgRevenueByClient = useMemo(() => {
    const countByKey = new Map(activeClients.trend.map(t => [t.monthKey, t.count]));
    const base = totalRev.months.map(m => {
      const clients = countByKey.get(m.monthKey) ?? 0;
      const avg = clients > 0 ? m.amount / clients : null;
      return { month: m.month, monthKey: m.monthKey, revenue: m.amount, clients, avg };
    });
    // Per-bucket variance vs prior valid bucket (signed).
    let prevAvg: number | null = null;
    const withVariance = base.map(p => {
      let varianceDollars: number | null = null;
      let variancePct: number | null = null;
      if (p.avg != null && prevAvg != null) {
        varianceDollars = p.avg - prevAvg;
        variancePct = prevAvg !== 0 ? ((p.avg - prevAvg) / prevAvg) * 100 : null;
      }
      if (p.avg != null) prevAvg = p.avg;
      return { ...p, varianceDollars, variancePct };
    });

    // Linear regression best-fit across visible buckets (x = bucket index).
    const fitInputs = withVariance
      .map((p, i) => ({ x: i, y: p.avg }))
      .filter((p): p is { x: number; y: number } => p.y != null);
    let slope = 0;
    let intercept = 0;
    if (fitInputs.length >= 2) {
      const n = fitInputs.length;
      const sumX = fitInputs.reduce((s, p) => s + p.x, 0);
      const sumY = fitInputs.reduce((s, p) => s + p.y, 0);
      const sumXY = fitInputs.reduce((s, p) => s + p.x * p.y, 0);
      const sumXX = fitInputs.reduce((s, p) => s + p.x * p.x, 0);
      const denom = n * sumXX - sumX * sumX;
      if (denom !== 0) {
        slope = (n * sumXY - sumX * sumY) / denom;
        intercept = (sumY - slope * sumX) / n;
      } else {
        intercept = sumY / n;
      }
    } else if (fitInputs.length === 1) {
      intercept = fitInputs[0].y;
    }

    const points = withVariance.map((p, i) => ({
      ...p,
      trend: fitInputs.length >= 1 ? intercept + slope * i : null,
    }));

    const valid = points.filter(p => p.avg !== null) as Array<{ avg: number }>;
    const headline = valid.length > 0
      ? valid.reduce((s, p) => s + p.avg, 0) / valid.length
      : 0;

    // Headline trend = first → last valid bucket.
    const firstValid = points.find(p => p.avg != null) ?? null;
    const lastValid = [...points].reverse().find(p => p.avg != null) ?? null;
    let headlineDelta: number | null = null;
    let headlinePct: number | null = null;
    if (firstValid && lastValid && firstValid !== lastValid && firstValid.avg != null && lastValid.avg != null) {
      headlineDelta = lastValid.avg - firstValid.avg;
      headlinePct = firstValid.avg !== 0 ? (headlineDelta / firstValid.avg) * 100 : null;
    }

    return { points, headline, hasAny: valid.length > 0, headlineDelta, headlinePct };
  }, [totalRev.months, activeClients.trend]);

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <DashboardPlansGear dashboardKey="finserv-financial-metrics" className="ml-auto" />
        {(totalRev.isLoading || profits.isLoading) && (
          <Badge variant="outline" className="text-xs animate-pulse">Loading from QuickBooks…</Badge>
        )}
      </div>

      {/* ── Row 1: Total Revenue ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinServSnapshotCard
          label="Total Clients"
          value={pipelineSnapshot.data?.totalClients ?? 0}
          subtitle='Deals currently in "Active Client" stage'
          isLoading={pipelineSnapshot.isLoading}
        />
        <FinServSnapshotCard
          label="Total MRR"
          value={pipelineSnapshot.data?.totalMrr ?? 0}
          format="currency"
          subtitle="Sum of MRR across active FinServ pipeline deals"
          isLoading={pipelineSnapshot.isLoading}
        />
        <FinServSnapshotCard
          label="Avg. Revenue / Client"
          value={
            (pipelineSnapshot.data?.totalClients ?? 0) > 0
              ? (totalRev.total ?? 0) / (pipelineSnapshot.data!.totalClients as number)
              : 0
          }
          format="currency"
          subtitle={`${periodBadge} revenue ÷ active clients`}
          isLoading={pipelineSnapshot.isLoading || totalRev.isLoading}
        />
        <FinServSnapshotCard
          label="Current Pipeline"
          value={pipelineSnapshot.data?.currentPipeline ?? 0}
          subtitle="Qualification → Negotiation"
          isLoading={pipelineSnapshot.isLoading}
        />
        <FinServSnapshotCard
          label="FinServ Clients Signed"
          value={newMrr.deals.length}
          subtitle={`Entered "Active Client" · ${periodBadge}`}
          isLoading={newMrr.isLoading}
        />
        <FinServSnapshotCard
          label="MRR Signed"
          value={newMrr.total}
          format="currency"
          subtitle={`MRR of deals entering "Active Client" · ${periodBadge}`}
          isLoading={newMrr.isLoading}
        />
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Net Revenue Retention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-foreground tabular-nums">
              {nrr.isLoading ? '—' : nrr.nrr == null ? 'n/a' : fmtPct(nrr.nrr)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              QBO FinServ · prior-period billed customers ({nrr.priorLabel})
            </div>
          </CardContent>
        </Card>
      </div>



      <Card className="glass-module">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
            </div>
            <TrendToggleButton active={showTrendRevenue} onToggle={() => setShowTrendRevenue(v => !v)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-3xl font-semibold text-foreground">{fmtCurrencyPrecise(totalRev.total)}</div>
            <div className="text-xs text-muted-foreground">Total Income from QuickBooks P&amp;L</div>
            {showTrendRevenue && (
              <div className="mt-1">
                <TrendDeltaText
                  values={totalRev.months.map((m) => m.amount)}
                  format={fmtCurrencyFull}
                />
              </div>
            )}
          </div>
          {totalRev.isLoading ? <WidgetLoading /> : totalRev.error ? <WidgetError /> : totalRev.months.every(m => m.amount === 0) ? <WidgetEmpty /> : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                {(() => {
                  const trend = computeLinearTrend(totalRev.months.map(m => m.amount));
                  const chartData = totalRev.months.map((m, i) => ({ ...m, trend: trend[i] }));
                  return (
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={(props: any) => (
                      <DeltaTooltip
                        {...props}
                        data={chartData}
                        dataKey="amount"
                        format={fmtCurrencyFull}
                        seriesName="Revenue"
                      />
                    )}
                  />
                  <Bar
                    dataKey="amount"
                    fill="hsl(var(--primary))"
                    name="Revenue"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openDrill({
                      kind: 'pnl', metric: 'revenue',
                      sourceLabel: 'Total Revenue',
                      selection: d?.month ?? '',
                      period: resolveBucket(d?.monthKey ?? d?.month),
                      granularity: range.granularity,
                    })}
                  />
                  {showTrendRevenue && (
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="hsl(142 71% 45%)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      activeDot={false}
                      name="Best-fit trend"
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
                  );
                })()}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 2: Gross Profit + Operating Profit side-by-side ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GrossProfitToggleCard
          periodBadge={periodBadge}
          totalRev={totalRev}
          profits={profits}
          openSinglePoint={openSinglePoint}
        />
        <OperatingProfitToggleCard
          periodBadge={periodBadge}
          totalRev={totalRev}
          profits={profits}
          openSinglePoint={openSinglePoint}
        />
      </div>

      {/* ── Row 4 + 5: FinServ Cashflow + Active Clients ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle
                className="text-sm font-medium cursor-help"
                title='FinServ Cashflow net of "Due To 5th Line Payments"'
              >
                FinServ Cashflow
              </CardTitle>
              <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
            </div>
            <TrendToggleButton active={showTrendCashflow} onToggle={() => setShowTrendCashflow(v => !v)} />
          </div>
        </CardHeader>
        <CardContent>
          {showTrendCashflow && (
            <div className="mb-3">
              <TrendDeltaText
                values={cashflow.points.map((p) => p.value)}
                format={fmtCurrencyFull}
              />
            </div>
          )}
          {cashflow.isLoading ? <WidgetLoading /> : cashflow.error ? <WidgetError message={cashflow.error instanceof Error ? cashflow.error.message : 'Failed to load cashflow'} /> : cashflow.points.every(p => p.value === 0) ? <WidgetEmpty /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                {(() => {
                  const trend = computeLinearTrend(cashflow.points.map(p => p.value));
                  const chartData = cashflow.points.map((p, i) => ({ ...p, trend: trend[i] }));
                  return (
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={(props: any) => (
                      <DeltaTooltip
                        {...props}
                        data={chartData}
                        dataKey="value"
                        format={fmtCurrencyFull}
                        seriesName="Free Cash Flow"
                      />
                    )}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    name="Cash Flow"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openDrill({
                      kind: 'cashflow',
                      sourceLabel: 'FinServ Cashflow',
                      selection: d?.month ?? '',
                      period: resolveBucket(d?.monthKey ?? d?.month),
                      granularity: range.granularity,
                    })}
                  >
                    {cashflow.points.map((entry, i) => (
                      <Cell key={i} fill={entry.value >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                  {showTrendCashflow && (
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="hsl(142 71% 45%)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      activeDot={false}
                      name="Best-fit trend"
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
                  );
                })()}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <ActiveClientsMetricWidget
        data={activeClients}
        periodBadge={periodBadge}
        onDrill={(idx) => {
          const point = activeClients.trend[idx];
          if (!point) return;
          openDrill({
            kind: 'active-clients',
            sourceLabel: 'Active Clients',
            selection: point.month,
            period: resolveBucket(point.monthKey ?? point.month),
            granularity: range.granularity,
          });
        }}
      />
      </div>

      {/* ── Row 5b + 6: Average Revenue by Client + Revenue Change by Client ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Average Revenue by Client</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
            </div>
            <TrendToggleButton active={showTrendAvgRevClient} onToggle={() => setShowTrendAvgRevClient(v => !v)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="text-3xl font-semibold text-foreground">
                {avgRevenueByClient.hasAny ? fmtCurrencyPrecise(avgRevenueByClient.headline) : '—'}
              </div>
              {showTrendAvgRevClient && avgRevenueByClient.headlineDelta != null && (
                <span
                  className={`text-xs font-medium ${
                    avgRevenueByClient.headlineDelta > 0
                      ? 'text-green-500'
                      : avgRevenueByClient.headlineDelta < 0
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  Trend: {avgRevenueByClient.headlineDelta >= 0 ? '+' : ''}
                  {avgRevenueByClient.headlinePct != null ? `${avgRevenueByClient.headlinePct.toFixed(1)}%` : '—'}
                  {' / '}
                  {avgRevenueByClient.headlineDelta >= 0 ? '+' : ''}
                  {fmtCurrencyFull(avgRevenueByClient.headlineDelta)}
                  <span className="text-muted-foreground font-normal"> vs start of period</span>
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Simple average of per-period (Revenue ÷ Active Clients)
            </div>
          </div>
          {totalRev.isLoading || activeClients.isLoading ? <WidgetLoading /> :
            totalRev.error || activeClients.error ? <WidgetError /> :
            !avgRevenueByClient.hasAny ? <WidgetEmpty /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={avgRevenueByClient.points} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]?.payload ?? {};
                      if (p.avg == null) {
                        return (
                          <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow">
                            <div className="font-medium mb-1">{label}</div>
                            <div className="text-muted-foreground">No active clients</div>
                          </div>
                        );
                      }
                      const varCls =
                        p.varianceDollars == null
                          ? 'text-muted-foreground'
                          : p.varianceDollars > 0
                          ? 'text-green-500'
                          : p.varianceDollars < 0
                          ? 'text-red-500'
                          : 'text-muted-foreground';
                      return (
                        <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow space-y-1">
                          <div className="font-medium">{label}</div>
                          <div>Avg / Client: <span className="font-medium">{fmtCurrencyFull(p.avg)}</span></div>
                          <div className="text-muted-foreground">
                            {fmtCurrencyFull(p.revenue)} ÷ {p.clients}
                          </div>
                          <div className={varCls}>
                            Δ vs prior: {p.varianceDollars == null ? '—' : `${p.varianceDollars >= 0 ? '+' : ''}${fmtCurrencyFull(p.varianceDollars)}`}
                            {p.variancePct != null && (
                              <> ({p.variancePct >= 0 ? '+' : ''}{p.variancePct.toFixed(1)}%)</>
                            )}
                          </div>
                          {p.trend != null && (
                            <div className="text-muted-foreground">Trend line: {fmtCurrencyFull(p.trend)}</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="avg"
                    fill="hsl(var(--primary))"
                    name="Avg Revenue / Client"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openDrill({
                      kind: 'avg-revenue',
                      sourceLabel: 'Average Revenue by Client',
                      selection: d?.month ?? '',
                      period: resolveBucket(d?.monthKey ?? d?.month),
                      granularity: range.granularity,
                    })}
                  >
                    <LabelList
                      dataKey="varianceDollars"
                      position="top"
                      content={(props: any) => {
                        const { x, y, width, index } = props;
                        const point = avgRevenueByClient.points[index];
                        if (!point || point.varianceDollars == null) return null;
                        const dollars = point.varianceDollars;
                        const pct = point.variancePct;
                        const color =
                          dollars > 0 ? 'hsl(142 71% 45%)' :
                          dollars < 0 ? 'hsl(0 72% 51%)' :
                          'hsl(var(--muted-foreground))';
                        const sign = dollars >= 0 ? '+' : '';
                        const pctText = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—';
                        const cx = (x ?? 0) + (width ?? 0) / 2;
                        return (
                          <g>
                            <text x={cx} y={(y ?? 0) - 14} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
                              {pctText}
                            </text>
                            <text x={cx} y={(y ?? 0) - 4} textAnchor="middle" fontSize={9} fill={color}>
                              {sign}{fmtCurrency(dollars)}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Bar>
                  {showTrendAvgRevClient && (
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="hsl(142 71% 45%)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      activeDot={false}
                      name="Best-fit trend"
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 6: Revenue Change by Client ── */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Revenue Change by Client</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">
                {revenueByClient.selectedMonthLabel} vs {revenueByClient.priorMonthLabel}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => {
                const rows = revenueByClient.clients.map((c) => {
                  const pct = c.prior !== 0 ? (c.variance / Math.abs(c.prior)) * 100 : null;
                  return {
                    client: c.client,
                    current: fmtCurrencyFull(c.current),
                    prior: fmtCurrencyFull(c.prior),
                    variance: fmtCurrencyFull(c.variance),
                    _variance: c.variance,
                    pct: pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
                    _pct: pct,
                  };
                });
                setDrill({
                  context: {
                    sourceId: 'finserv:revenue-change-by-client',
                    sourceLabel: 'Revenue Change by Client',
                    selection: `${revenueByClient.selectedMonthLabel} vs ${revenueByClient.priorMonthLabel}`,
                    periodLabel: selectedQuarter.label,
                  },
                  columns: [
                    { key: 'client', label: 'Client' },
                    { key: 'current', label: revenueByClient.selectedMonthLabel, align: 'right' },
                    { key: 'prior', label: revenueByClient.priorMonthLabel, align: 'right' },
                    {
                      key: 'variance',
                      label: 'Δ $',
                      align: 'right',
                      sortable: true,
                      sortAccessor: (r: any) => r._variance ?? 0,
                      render: (r: any) => (
                        <span style={{ color: (r._variance ?? 0) < 0 ? 'hsl(0, 85%, 65%)' : undefined, fontWeight: (r._variance ?? 0) < 0 ? 600 : undefined }}>
                          {r.variance}
                        </span>
                      ),
                    },
                    {
                      key: 'pct',
                      label: 'Δ %',
                      align: 'right',
                      sortable: true,
                      sortAccessor: (r: any) => (r._pct ?? Number.NEGATIVE_INFINITY),
                      render: (r: any) => (
                        <span style={{ color: (r._pct ?? 0) < 0 ? 'hsl(0, 85%, 65%)' : undefined, fontWeight: (r._pct ?? 0) < 0 ? 600 : undefined }}>
                          {r.pct}
                        </span>
                      ),
                    },
                  ],
                  rows,
                  defaultSort: { key: 'variance', dir: 'desc' },
                });
              }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
              aria-label="View all clients"
            >
              View all
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {revenueByClient.isLoading ? <WidgetLoading /> : revenueByClient.error ? <WidgetError /> : revenueByClient.clients.length === 0 ? <WidgetEmpty /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByClient.clients.slice(0, 15)} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="client"
                    tick={{ fontSize: 9 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                  />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtCurrencyFull(v), name]}
                    labelFormatter={(label) => `Client: ${label}`}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar
                    dataKey="current"
                    fill="hsl(var(--primary))"
                    name={revenueByClient.selectedMonthLabel}
                    shape={createGlassBarShape({ radius: 4, topSegmentKey: 'current', dataKey: 'current' })}
                    cursor="pointer"
                    onClick={(d: any) => openDrill({
                      kind: 'client-series',
                      sourceLabel: 'Revenue Change by Client',
                      selection: d?.client ?? '',
                      period: { start: range.resolved.start, end: range.resolved.end, label: range.resolved.label },
                      client: d?.client,
                    })}
                  />
                  <Bar
                    dataKey="variance"
                    name="Variance"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openDrill({
                      kind: 'client-series',
                      sourceLabel: 'Revenue Change by Client',
                      selection: d?.client ?? '',
                      period: { start: range.resolved.start, end: range.resolved.end, label: range.resolved.label },
                      client: d?.client,
                    })}
                  >
                    {revenueByClient.clients.slice(0, 15).map((entry, i) => (
                      <Cell key={i} fill={entry.variance >= 0 ? 'hsl(160, 65%, 50%)' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* ── Row 7: Income by Product/Service (stacked) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Income by Product/Service</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">{periodBadge} · Excl. null customers</Badge>
        </CardHeader>
        <CardContent>
          {stacked.isLoading ? <WidgetLoading /> : stacked.months.every(m => m.totalRevenue === 0) ? <WidgetEmpty /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stacked.months}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtCurrencyFull(v)]} />
                  <Legend />
                  {FINSERV_STACKED_CATEGORIES.map((cat, idx) => (
                    <Bar
                      key={cat.key}
                      dataKey={cat.key}
                      stackId="income"
                      fill={cat.color}
                      name={cat.label}
                      shape={createGlassBarShape({
                        radius: 4,
                        topSegmentKey: FINSERV_STACKED_CATEGORIES[FINSERV_STACKED_CATEGORIES.length - 1].key,
                        dataKey: cat.key,
                      })}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">New MRR Added</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">{periodBadge} · Entered Active Client</Badge>
        </CardHeader>
        <CardContent>
          {newMrr.isLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : newMrr.error ? (
            <WidgetError />
          ) : (
            <div className="space-y-1">
              <p className="text-3xl font-semibold tabular-nums text-foreground">
                {fmtCurrencyFull(newMrr.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {newMrr.deals.length} deal{newMrr.deals.length === 1 ? '' : 's'} entered Active Client
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>


      {/* ── Row 8: Placeholder widgets ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PerHourWidget
          title="Revenue per Hour"
          numeratorLabel="Revenue"
          monthKeys={monthlyKeys}
          monthLabels={monthlyLabels}
          badge={`Monthly · ${selectedPeriod.label}`}
          numeratorByMonth={monthlyRevenueByKey}
        />
        <PerHourWidget
          title="Profit per Hour"
          numeratorLabel="Operating Profit"
          monthKeys={monthlyKeys}
          monthLabels={monthlyLabels}
          badge={`Monthly · ${selectedPeriod.label}`}
          numeratorByMonth={monthlyProfitByKey}
        />
      </div>

      {/* ── Row 9: Utilization (Scott / Siddhi / Kris / Blended) — full width ── */}
      <div className="w-full">
        <UtilizationWidget
          monthKeys={monthlyKeys}
          monthLabels={monthlyLabels}
          badge={`Monthly · ${selectedPeriod.label}`}
        />
      </div>
    </div>
    <InsightsDrilldownDrawer
      open={!!drill}
      onClose={() => setDrill(null)}
      context={drill?.context ?? null}
      columns={drill?.columns ?? []}
      rows={drill?.rows ?? []}
      emptyHint="No detail records available for this datapoint."
      defaultSort={drill?.defaultSort}
      onRowClick={
        drill?.context?.sourceId === 'finserv:revenue-change-by-client'
          ? (row: any) => {
              if (!row?.client) return;
              openDrill({
                kind: 'client-series',
                sourceLabel: 'Revenue Change by Client',
                selection: row.client,
                period: { start: range.resolved.start, end: range.resolved.end, label: range.resolved.label },
                client: row.client,
              });
            }
          : undefined
      }
    />
    </>
  );
}
