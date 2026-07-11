import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import {
  ResponsiveContainer, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Line, ComposedChart, Cell, ReferenceLine,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import {
  useFinServTotalRevenue,
  useFinServQuarterlyProfits,
  useFinServCashflow,
} from '@/hooks/useFinServFinancialMetrics';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { DrilldownProvider, useDrilldown } from '@/components/insights/ChartDrilldown';
import { buildBuckets } from '@/lib/insightsTimeRange';

// ── Formatters (mirrors FinServFinancialMetricsDashboard) ──
const fmtCurrency = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtCurrencyFull = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const fmtCurrencyPrecise = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtPctPrecise = (v: number) => `${v.toFixed(2)}%`;

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

function TrendToggleButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Toggle trend line"
      className={
        'text-[11px] px-2 py-0.5 rounded-md border border-border/60 transition-colors ' +
        (active ? 'bg-primary/20 text-foreground' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground')
      }
    >
      Trend
    </button>
  );
}

function TrendDeltaText({
  values, format, className = '',
}: { values: Array<number | null | undefined>; format: (v: number) => string; className?: string }) {
  const trend = useMemo(() => computeLinearTrend(values), [values]);
  const first = trend.find((v) => v != null) as number | undefined;
  const last = [...trend].reverse().find((v) => v != null) as number | undefined;
  if (first == null || last == null) return null;
  const delta = last - first;
  const pct = first !== 0 ? (delta / first) * 100 : null;
  const positive = delta >= 0;
  const color = delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground';
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
  active, payload, label, data, dataKey, format, seriesName,
}: any) {
  if (!active || !payload || !payload.length) return null;
  const current = payload.find((p: any) => p.dataKey === dataKey) ?? payload[0];
  const row = current?.payload;
  const idx = row ? data.indexOf(row) : -1;
  const currentVal = Number(current?.value) || 0;
  const prev = idx > 0 ? data[idx - 1] : null;
  const prevVal = prev ? Number((prev as any)[dataKey]) : null;
  const delta = prevVal != null ? currentVal - prevVal : null;
  const pct = prevVal != null && prevVal !== 0 ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100 : null;
  const positive = (delta ?? 0) >= 0;
  return (
    <div style={{ background: 'rgba(8,8,12,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', color: '#ECECF4', fontSize: 12 }}>
      <div style={{ color: '#8A8AA6', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{seriesName}: {format(currentVal)}</div>
      {delta != null && (
        <div style={{ color: positive ? '#5EEAD4' : '#FB7185', fontSize: 11, marginTop: 2 }}>
          {positive ? '▲' : '▼'} {positive ? '+' : ''}{format(delta)}
          {pct != null ? ` (${positive ? '+' : ''}${pct.toFixed(1)}%)` : ''} vs prev
        </div>
      )}
    </div>
  );
}

// ── Card variants ──

function TotalRevenueCard({
  periodBadge, totalRev, onBarClick,
}: {
  periodBadge: string;
  totalRev: ReturnType<typeof useFinServTotalRevenue>;
  onBarClick?: (d: any) => void;
}) {
  const [showTrend, setShowTrend] = useState(false);
  const chartData = useMemo(() => {
    const trend = computeLinearTrend(totalRev.months.map((m) => m.amount));
    return totalRev.months.map((m, i) => ({ ...m, trend: trend[i] }));
  }, [totalRev.months]);
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </div>
          <TrendToggleButton active={showTrend} onToggle={() => setShowTrend((v) => !v)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-3xl font-semibold text-foreground" title={fmtCurrencyPrecise(totalRev.total)}>{fmtCurrency(totalRev.total)}</div>
          {showTrend && (
            <div className="mt-1">
              <TrendDeltaText values={totalRev.months.map((m) => m.amount)} format={fmtCurrencyFull} />
            </div>
          )}
        </div>
        {totalRev.isLoading ? <WidgetLoading /> : totalRev.error ? <WidgetError /> : totalRev.months.every((m) => m.amount === 0) ? <WidgetEmpty /> : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                <Tooltip content={(props: any) => (
                  <DeltaTooltip {...props} data={chartData} dataKey="amount" format={fmtCurrencyFull} seriesName="Revenue" />
                )} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" name="Revenue" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" onClick={(d: any) => onBarClick?.(d)} />
                {showTrend && (
                  <Line type="monotone" dataKey="trend" stroke="hsl(142 71% 45%)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GrossProfitToggleCard({
  periodBadge, totalRev, profits, onBarClick,
}: {
  periodBadge: string;
  totalRev: ReturnType<typeof useFinServTotalRevenue>;
  profits: ReturnType<typeof useFinServQuarterlyProfits>;
  onBarClick?: (d: any, mode: '$' | '%') => void;
}) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const isDollar = mode === '$';
  const [showTrend, setShowTrend] = useState(false);
  const chartData = useMemo(() => {
    const source = profits.quarters.map((q) => (isDollar ? q.grossProfit : q.grossMargin));
    const trend = computeLinearTrend(source);
    return profits.quarters.map((q, i) => ({ ...q, trend: trend[i] }));
  }, [profits.quarters, isDollar]);
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">{isDollar ? 'Gross Profit $' : 'Gross Profit Margin %'}</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <TrendToggleButton active={showTrend} onToggle={() => setShowTrend((v) => !v)} />
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(['$', '%'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={'px-2.5 py-1 text-xs font-medium transition-colors ' + (mode === m ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >{m}</button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div
            className="text-3xl font-semibold text-foreground"
            title={isDollar ? fmtCurrencyPrecise(totalRev.grossProfit) : undefined}
          >
            {isDollar ? fmtCurrency(totalRev.grossProfit) : typeof totalRev.grossMargin === 'number' ? fmtPctPrecise(totalRev.grossMargin) : '—'}
          </div>
          {!isDollar && (
            <div className="text-xs text-muted-foreground">Gross Profit ÷ Revenue</div>
          )}
          {showTrend && (
            <div className="mt-1">
              <TrendDeltaText values={profits.quarters.map((q) => (isDollar ? q.grossProfit : q.grossMargin))} format={isDollar ? fmtCurrencyFull : (v: number) => `${v.toFixed(1)}%`} />
            </div>
          )}
        </div>
        {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every((q) => (isDollar ? (q.grossProfit === 0 && q.revenue === 0) : q.grossMargin === 0)) ? <WidgetEmpty /> : (
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
                <Tooltip content={(props: any) => (
                  <DeltaTooltip {...props} data={chartData} dataKey={isDollar ? 'grossProfit' : 'grossMargin'} format={isDollar ? fmtCurrencyFull : fmtPct} seriesName={isDollar ? 'Gross Profit' : 'Gross Margin'} />
                )} />
                {isDollar ? (
                  <Bar dataKey="grossProfit" fill="hsl(var(--chart-2))" name="Gross Profit" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" onClick={(d: any) => onBarClick?.(d, '$')} />
                ) : (
                  <Bar dataKey="grossMargin" fill="hsl(160, 65%, 50%)" name="Gross Margin %" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" onClick={(d: any) => onBarClick?.(d, '%')} />
                )}
                {showTrend && (
                  <Line type="monotone" dataKey="trend" stroke="hsl(142 71% 45%)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
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
  periodBadge, totalRev, profits, onBarClick,
}: {
  periodBadge: string;
  totalRev: ReturnType<typeof useFinServTotalRevenue>;
  profits: ReturnType<typeof useFinServQuarterlyProfits>;
  onBarClick?: (d: any, mode: '$' | '%') => void;
}) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const isDollar = mode === '$';
  const [showTrend, setShowTrend] = useState(false);
  const chartData = useMemo(() => {
    const source = profits.quarters.map((q) => (isDollar ? q.operatingProfit : q.operatingMargin));
    const trend = computeLinearTrend(source);
    return profits.quarters.map((q, i) => ({ ...q, trend: trend[i] }));
  }, [profits.quarters, isDollar]);
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">{isDollar ? 'Operating Profit $' : 'Operating Margin %'}</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <TrendToggleButton active={showTrend} onToggle={() => setShowTrend((v) => !v)} />
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(['$', '%'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={'px-2.5 py-1 text-xs font-medium transition-colors ' + (mode === m ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >{m}</button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div
            className="text-3xl font-semibold text-foreground"
            title={isDollar ? fmtCurrencyPrecise(totalRev.operatingProfit) : undefined}
          >
            {isDollar ? fmtCurrency(totalRev.operatingProfit) : typeof totalRev.operatingMargin === 'number' ? fmtPctPrecise(totalRev.operatingMargin) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            {isDollar ? 'Gross Profit − Operating Expenses from QuickBooks P&L' : 'Operating Profit ÷ Revenue'}
          </div>
          {showTrend && (
            <div className="mt-1">
              <TrendDeltaText values={profits.quarters.map((q) => (isDollar ? q.operatingProfit : q.operatingMargin))} format={isDollar ? fmtCurrencyFull : (v: number) => `${v.toFixed(1)}%`} />
            </div>
          )}
        </div>
        {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every((q) => (isDollar ? (q.operatingProfit === 0 && q.revenue === 0) : q.operatingMargin === 0)) ? <WidgetEmpty /> : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                {isDollar ? (
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]} />
                ) : (
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} />
                )}
                <Tooltip content={(props: any) => (
                  <DeltaTooltip {...props} data={chartData} dataKey={isDollar ? 'operatingProfit' : 'operatingMargin'} format={isDollar ? fmtCurrencyFull : fmtPct} seriesName={isDollar ? 'Operating Profit' : 'Operating Margin'} />
                )} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={0.75} />
                {isDollar ? (
                  <Bar dataKey="operatingProfit" name="Operating Profit" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" onClick={(d: any) => onBarClick?.(d, '$')}>
                    {profits.quarters.map((entry, i) => (
                      <Cell key={i} fill={entry.operatingProfit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                ) : (
                  <Bar dataKey="operatingMargin" name="Operating Margin %" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" onClick={(d: any) => onBarClick?.(d, '%')}>
                    {profits.quarters.map((entry, i) => (
                      <Cell key={i} fill={entry.operatingMargin >= 0 ? 'hsl(35, 85%, 55%)' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                )}
                {showTrend && (
                  <Line type="monotone" dataKey="trend" stroke="hsl(142 71% 45%)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CashflowCard({
  periodBadge, cashflow, title, onBarClick,
}: {
  periodBadge: string;
  cashflow: ReturnType<typeof useFinServCashflow>;
  title: string;
  onBarClick?: (d: any) => void;
}) {
  const [showTrend, setShowTrend] = useState(true);
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </div>
          <TrendToggleButton active={showTrend} onToggle={() => setShowTrend((v) => !v)} />
        </div>
      </CardHeader>
      <CardContent>
        {showTrend && (
          <div className="mb-3">
            <TrendDeltaText values={cashflow.points.map((p) => p.value)} format={fmtCurrencyFull} />
          </div>
        )}
        {cashflow.isLoading ? <WidgetLoading /> : cashflow.error ? <WidgetError message={cashflow.error instanceof Error ? cashflow.error.message : 'Failed to load cashflow'} /> : cashflow.points.every((p) => p.value === 0) ? <WidgetEmpty /> : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              {(() => {
                const trend = computeLinearTrend(cashflow.points.map((p) => p.value));
                const chartData = cashflow.points.map((p, i) => ({ ...p, trend: trend[i] }));
                return (
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip content={(props: any) => (
                      <DeltaTooltip {...props} data={chartData} dataKey="value" format={fmtCurrencyFull} seriesName="Free Cash Flow" />
                    )} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Bar dataKey="value" name="Cash Flow" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" onClick={(d: any) => onBarClick?.(d)}>
                      {cashflow.points.map((entry, i) => (
                        <Cell key={i} fill={entry.value >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                      ))}
                    </Bar>
                    {showTrend && (
                      <Line type="monotone" dataKey="trend" stroke="hsl(142 71% 45%)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
                    )}
                  </ComposedChart>
                );
              })()}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// PnlFourChartsSection: Reusable Total Revenue, GP, OP, Cashflow
// section, parameterized by realmId so the same layout can be
// mounted against either the FinServ or Debt Advisory QuickBooks
// company.
// ────────────────────────────────────────────────────────────
export function PnlFourChartsSection({
  realmId,
  cashflowTitle = 'Cashflow',
  sectionTitle,
  sectionSubtitle,
  halfWidthCashflow = false,
}: {
  realmId: string;
  cashflowTitle?: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
  halfWidthCashflow?: boolean;
}) {
  return (
    <DrilldownProvider>
      <PnlFourChartsSectionInner
        realmId={realmId}
        cashflowTitle={cashflowTitle}
        sectionTitle={sectionTitle}
        sectionSubtitle={sectionSubtitle}
        halfWidthCashflow={halfWidthCashflow}
      />
    </DrilldownProvider>
  );
}

function PnlFourChartsSectionInner({
  realmId,
  cashflowTitle,
  sectionTitle,
  sectionSubtitle,
  halfWidthCashflow,
}: {
  realmId: string;
  cashflowTitle: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
  halfWidthCashflow?: boolean;
}) {
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

  const selectedPeriod = useMemo(() => ({
    start_date: timeframe.start,
    end_date: timeframe.end,
    label: timeframe.label,
  }), [timeframe.start, timeframe.end, timeframe.label]);

  const totalRev = useFinServTotalRevenue(selectedPeriod, granularity, realmId);
  const profits = useFinServQuarterlyProfits(selectedPeriod, granularity, realmId);
  const cashflow = useFinServCashflow(selectedPeriod, granularity, realmId);

  const granularityLabel = granularity === 'monthly' ? 'Monthly' : granularity === 'quarterly' ? 'Quarterly' : 'Yearly';
  const periodBadge = `${granularityLabel} · ${selectedPeriod.label}`;

  const { open: openDrill } = useDrilldown();
  const bucketIndex = useMemo(() => {
    const map = new Map<string, { start: string; end: string; label: string }>();
    const buckets = buildBuckets(timeframe.start, timeframe.end, granularity);
    for (const b of buckets) {
      const entry = { start: b.start_date, end: b.end_date, label: b.label };
      map.set(b.key, entry);
      map.set(b.label, entry);
    }
    return map;
  }, [timeframe.start, timeframe.end, granularity]);
  const resolveBucket = (keyOrLabel: string | undefined) => {
    if (keyOrLabel && bucketIndex.has(keyOrLabel)) return bucketIndex.get(keyOrLabel)!;
    return { start: timeframe.start, end: timeframe.end, label: timeframe.label };
  };

  const openPnl = (
    metric: 'revenue' | 'gross_profit' | 'gross_margin' | 'operating_profit' | 'operating_margin',
    sourceLabel: string,
    d: any,
  ) => {
    const label = d?.month ?? d?.quarter ?? '';
    const key = d?.monthKey ?? d?.quarterKey ?? label;
    openDrill({
      kind: 'pnl',
      metric,
      sourceLabel,
      selection: String(label),
      period: resolveBucket(String(key)),
      granularity,
      realm: realmId,
    });
  };

  const openCashflow = (d: any) => {
    const label = d?.month ?? '';
    const key = d?.monthKey ?? label;
    openDrill({
      kind: 'cashflow',
      sourceLabel: cashflowTitle,
      selection: String(label),
      period: resolveBucket(String(key)),
      granularity,
      realm: realmId,
    });
  };

  return (
    <div className="space-y-4">
      {(sectionTitle || sectionSubtitle) && (
        <div>
          {sectionTitle && (
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{sectionTitle}</h3>
          )}
          {sectionSubtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{sectionSubtitle}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TotalRevenueCard
          periodBadge={periodBadge}
          totalRev={totalRev}
          onBarClick={(d) => openPnl('revenue', 'Total Revenue', d)}
        />
        <GrossProfitToggleCard
          periodBadge={periodBadge}
          totalRev={totalRev}
          profits={profits}
          onBarClick={(d, mode) => openPnl(mode === '$' ? 'gross_profit' : 'gross_margin', mode === '$' ? 'Gross Profit' : 'Gross Margin %', d)}
        />
      </div>

      {halfWidthCashflow ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OperatingProfitToggleCard
            periodBadge={periodBadge}
            totalRev={totalRev}
            profits={profits}
            onBarClick={(d, mode) => openPnl(mode === '$' ? 'operating_profit' : 'operating_margin', mode === '$' ? 'Operating Profit' : 'Operating Margin %', d)}
          />
          <CashflowCard
            periodBadge={periodBadge}
            cashflow={cashflow}
            title={cashflowTitle}
            onBarClick={(d) => openCashflow(d)}
          />
        </div>
      ) : (
        <>
          <OperatingProfitToggleCard
            periodBadge={periodBadge}
            totalRev={totalRev}
            profits={profits}
            onBarClick={(d, mode) => openPnl(mode === '$' ? 'operating_profit' : 'operating_margin', mode === '$' ? 'Operating Profit' : 'Operating Margin %', d)}
          />
          <CashflowCard
            periodBadge={periodBadge}
            cashflow={cashflow}
            title={cashflowTitle}
            onBarClick={(d) => openCashflow(d)}
          />
        </>
      )}
    </div>
  );
}

export default PnlFourChartsSection;