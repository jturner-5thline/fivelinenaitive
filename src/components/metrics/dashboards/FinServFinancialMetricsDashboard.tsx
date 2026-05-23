import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, ComposedChart, Legend, Cell, ReferenceLine,
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
import {
  useQBStackedFinServRevenue,
  FINSERV_STACKED_CATEGORIES,
} from '@/hooks/useQBStackedFinServRevenue';
import { InsightsTimeRangeSelector, type InsightsTimeRangeValue } from '@/components/insights/InsightsTimeRangeSelector';
import { loadPersistedRange, resolveRange, defaultGranularityForRange } from '@/lib/insightsTimeRange';
import { buildCustomPeriod } from '@/hooks/useQBQuarterlyRevenue';

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
  // Per-board time range selector — overrides the global context for this board.
  const initialPersisted = useMemo(() => loadPersistedRange('finserv-financial-metrics'), []);
  const initialResolved = useMemo(() => {
    const id = initialPersisted?.presetId ?? 'ytd';
    return resolveRange(id, {
      custom: initialPersisted?.custom,
      includeCurrentMonth: initialPersisted?.includeCurrentMonth ?? true,
    });
  }, [initialPersisted]);
  const [range, setRange] = useState<InsightsTimeRangeValue>(() => ({
    presetId: initialPersisted?.presetId ?? 'ytd',
    granularity:
      initialPersisted?.granularity ?? defaultGranularityForRange(initialResolved.start, initialResolved.end),
    custom: initialPersisted?.custom,
    includeCurrentMonth: initialPersisted?.includeCurrentMonth ?? true,
    resolved: initialResolved,
  }));

  const [drill, setDrill] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);

  const selectedPeriod = useMemo(() => ({
    start_date: range.resolved.start,
    end_date: range.resolved.end,
    label: range.resolved.label,
  }), [range.resolved.start, range.resolved.end, range.resolved.label]);

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
  const profits = useFinServQuarterlyProfits(selectedPeriod, range.granularity);
  const revenueByClient = useFinServRevenueByClient(selectedQuarter, selectedQuarter.months.length - 1);
  const cashflow = useFinServCashflow(selectedPeriod, range.granularity);
  const stacked = useQBStackedFinServRevenue(selectedQuarter);
  const activeClients = useFinServActiveClients();

  const granularityLabel =
    range.granularity === 'monthly' ? 'Monthly' :
    range.granularity === 'quarterly' ? 'Quarterly' : 'Yearly';
  const periodBadge = `${granularityLabel} · ${selectedPeriod.label}`;

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <InsightsTimeRangeSelector
          boardId="finserv-financial-metrics"
          defaultPresetId="ytd"
          defaultGranularity="monthly"
          onChange={setRange}
        />
        {(totalRev.isLoading || profits.isLoading) && (
          <Badge variant="outline" className="text-xs animate-pulse">Loading from QuickBooks…</Badge>
        )}
      </div>

      {/* ── Row 0: Active Clients KPI ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-module">
          <CardContent className="p-4">
            {activeClients.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : activeClients.error ? (
              <WidgetError />
            ) : (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active Clients</p>
                <div className="flex items-end gap-3 mt-1">
                  <span className="text-3xl font-bold text-foreground">{activeClients.currentCount}</span>
                  <VarianceIndicator value={activeClients.variance} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">vs prior period ({activeClients.priorCount})</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 1: Total Revenue ── */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-3xl font-semibold text-foreground">{fmtCurrencyPrecise(totalRev.total)}</div>
            <div className="text-xs text-muted-foreground">Total Income from QuickBooks P&amp;L</div>
          </div>
          {totalRev.isLoading ? <WidgetLoading /> : totalRev.error ? <WidgetError /> : totalRev.months.every(m => m.amount === 0) ? <WidgetEmpty /> : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalRev.months}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtCurrencyFull(v), 'Revenue']} />
                  <Bar
                    dataKey="amount"
                    fill="hsl(var(--primary))"
                    name="Revenue"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('Total Revenue', d?.month, 'Revenue', Number(d?.amount) || 0, fmtCurrencyFull)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 2: Gross Profit $ + Gross Margin % ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit $</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="text-3xl font-semibold text-foreground">{fmtCurrencyPrecise(totalRev.grossProfit)}</div>
              <div className="text-xs text-muted-foreground">Gross Profit from QuickBooks P&amp;L</div>
            </div>
            {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every(q => q.grossProfit === 0 && q.revenue === 0) ? <WidgetEmpty /> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profits.quarters}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number, name: string) => [fmtCurrencyFull(v), name]} />
                    <Bar
                      dataKey="revenue"
                      fill="hsl(var(--primary) / 0.35)"
                      name="Revenue"
                      shape={createGlassBarShape({ radius: 4 })}
                    />
                    <Bar
                      dataKey="grossProfit"
                      fill="hsl(var(--chart-2))"
                      name="Gross Profit"
                      shape={createGlassBarShape({ radius: 4 })}
                      cursor="pointer"
                      onClick={(d: any) => openSinglePoint('Gross Profit $', d?.quarter, 'Gross Profit', Number(d?.grossProfit) || 0, fmtCurrencyFull)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit Margin %</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="text-3xl font-semibold text-foreground">
                {typeof totalRev.grossMargin === 'number' ? fmtPctPrecise(totalRev.grossMargin) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">Gross Profit ÷ Revenue</div>
            </div>
            {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every(q => q.grossMargin === 0) ? <WidgetEmpty /> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profits.quarters}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => [fmtPct(v), 'Gross Margin']} />
                    <Bar
                      dataKey="grossMargin"
                      fill="hsl(160, 65%, 50%)"
                      name="Gross Margin %"
                      shape={createGlassBarShape({ radius: 4 })}
                      cursor="pointer"
                      onClick={(d: any) => openSinglePoint('Gross Profit Margin %', d?.quarter, 'Gross Margin', Number(d?.grossMargin) || 0, fmtPct)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Operating Profit $ + Operating Margin % ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operating Profit $</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="text-3xl font-semibold text-foreground">{fmtCurrencyPrecise(totalRev.operatingProfit)}</div>
              <div className="text-xs text-muted-foreground">Gross Profit − Operating Expenses from QuickBooks P&amp;L</div>
            </div>
            {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every(q => q.operatingProfit === 0 && q.revenue === 0) ? <WidgetEmpty /> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profits.quarters}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                    <YAxis
                      tickFormatter={fmtCurrency}
                      tick={{ fontSize: 10 }}
                      domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]}
                    />
                    <Tooltip formatter={(v: number) => [fmtCurrencyFull(v), 'Operating Profit']} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={0.75} />
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
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operating Margin %</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="text-3xl font-semibold text-foreground">
                {typeof totalRev.operatingMargin === 'number' ? fmtPctPrecise(totalRev.operatingMargin) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">Operating Profit ÷ Revenue</div>
            </div>
            {profits.isLoading ? <WidgetLoading /> : profits.error ? <WidgetError /> : profits.quarters.every(q => q.operatingMargin === 0 && q.revenue === 0) ? <WidgetEmpty /> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profits.quarters}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [fmtPct(v), 'Operating Margin']} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
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
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: FinServ Cashflow ── */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">FinServ Cashflow</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">{periodBadge}</Badge>
        </CardHeader>
        <CardContent>
          {cashflow.isLoading ? <WidgetLoading /> : cashflow.error ? <WidgetError message={cashflow.error instanceof Error ? cashflow.error.message : 'Failed to load cashflow'} /> : cashflow.points.every(p => p.value === 0) ? <WidgetEmpty /> : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashflow.points}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtCurrencyFull(v), 'Free Cash Flow']} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    name="Cash Flow"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('FinServ Cashflow', d?.month, 'Free Cash Flow', Number(d?.value) || 0, fmtCurrencyFull)}
                  >
                    {cashflow.points.map((entry, i) => (
                      <Cell key={i} fill={entry.value >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-2))" strokeWidth={1} dot={false} name="Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 5: Active Clients trend ── */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">Monthly · Past 6 months</Badge>
        </CardHeader>
        <CardContent>
          {activeClients.isLoading ? <WidgetLoading /> : activeClients.error ? <WidgetError /> : activeClients.trend.every(t => t.count === 0) ? <WidgetEmpty message="No active FinServ clients yet" /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={activeClients.trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number, name: string) => [
                    name === 'Trend' ? v : v,
                    name,
                  ]} />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    name="Active Clients"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint('Active Clients', d?.month, 'Active Clients', Number(d?.count) || 0, (v) => `${v}`)}
                  />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" strokeWidth={1} dot={{ r: 3 }} name="Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 6: Revenue Change by Client ── */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue Change by Client</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">
            {revenueByClient.selectedMonthLabel} vs {revenueByClient.priorMonthLabel}
          </Badge>
        </CardHeader>
        <CardContent>
          {revenueByClient.isLoading ? <WidgetLoading /> : revenueByClient.error ? <WidgetError /> : revenueByClient.clients.length === 0 ? <WidgetEmpty /> : (
            <div className="h-[280px]">
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
                    onClick={(d: any) => openSinglePoint(
                      'Revenue Change by Client',
                      d?.client,
                      revenueByClient.selectedMonthLabel,
                      Number(d?.current) || 0,
                      fmtCurrencyFull,
                      [
                        { metric: revenueByClient.priorMonthLabel, value: fmtCurrencyFull(Number(d?.prior) || 0) },
                        { metric: 'Variance', value: fmtCurrencyFull(Number(d?.variance) || 0) },
                      ],
                    )}
                  />
                  <Bar
                    dataKey="variance"
                    name="Variance"
                    shape={createGlassBarShape({ radius: 4 })}
                    cursor="pointer"
                    onClick={(d: any) => openSinglePoint(
                      'Revenue Change by Client',
                      d?.client,
                      'Variance',
                      Number(d?.variance) || 0,
                      fmtCurrencyFull,
                      [
                        { metric: revenueByClient.selectedMonthLabel, value: fmtCurrencyFull(Number(d?.current) || 0) },
                        { metric: revenueByClient.priorMonthLabel, value: fmtCurrencyFull(Number(d?.prior) || 0) },
                      ],
                    )}
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

      {/* ── Row 7: Income by Product/Service (stacked) ── */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Income by Product/Service</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">{periodBadge} · Excl. null customers</Badge>
        </CardHeader>
        <CardContent>
          {stacked.isLoading ? <WidgetLoading /> : stacked.months.every(m => m.totalRevenue === 0) ? <WidgetEmpty /> : (
            <div className="h-[240px]">
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

      {/* ── Row 8: Placeholder widgets ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlaceholderWidget title="Revenue per Hour" />
        <PlaceholderWidget title="Profit per Hour" />
      </div>
    </div>
    <InsightsDrilldownDrawer
      open={!!drill}
      onClose={() => setDrill(null)}
      context={drill?.context ?? null}
      columns={drill?.columns ?? []}
      rows={drill?.rows ?? []}
      emptyHint="No detail records available for this datapoint."
    />
    </>
  );
}
