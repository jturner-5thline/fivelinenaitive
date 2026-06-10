import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Users, DollarSign, FileCheck, FileSignature, FileText, ClipboardCheck,
  Coins, ScrollText, Handshake, Banknote,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';
import {
  useConsolidatedDebtPipelineMetrics,
  type StageTrendBucket,
  type StageSplitTrendBucket,
  type StageEntryDeal,
} from '@/hooks/usePipelineStageMetrics';
import { cn } from '@/lib/utils';
import { consumePendingReopen } from '@/lib/dealOriginContext';
import { StageTransitTimeChart } from '@/components/metrics/charts/StageTransitTimeChart';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

interface MetricCardConfig {
  id: string;
  title: string;
  icon: typeof Users;
  value: string | number;
  isLoading: boolean;
  deals: StageEntryDeal[];
  color: string;
  drilldownTitle: string;
  drilldownPeriodNote?: string;
  /** How the drilldown bar chart should aggregate `deals`. */
  drilldownMetricType?: 'count' | 'dollars' | 'average' | 'none';
  /** Formatter applied to each bar value (and chart total). Defaults inferred from metric type. */
  drilldownValueFormatter?: (value: number) => string;
  /** Bar/total color override. Defaults to card color. */
  drilldownChartColor?: string;
}

function MetricKPICard({
  config,
  onClick,
}: {
  config: MetricCardConfig;
  onClick: () => void;
}) {
  const Icon = config.icon;
  return (
    <Card
      className={cn(
        'relative group overflow-hidden transition-all duration-200',
        'glass-module',
        'hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${config.color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/20"
          style={{ background: `linear-gradient(135deg, ${config.color}20, transparent)` }}
        >
          <Icon className="h-5 w-5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate">{config.title}</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {config.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={onClick}
                className="drilldown-value text-xl font-bold font-mono tabular-nums text-foreground"
              >
                {config.value}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DrilldownBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  deals: StageEntryDeal[];
  count: number;
  sum: number;
  value: number; // aggregated value per metric type
}

function buildDrilldownBuckets(
  deals: StageEntryDeal[],
  quarter: QuarterOption,
  granularity: TrendChartMode,
  metricType: 'count' | 'dollars' | 'average',
): DrilldownBucket[] {
  // Monthly buckets from quarter.months; quarterly buckets group months into 3-month windows.
  const monthlyBuckets = quarter.months.map((m) => ({
    key: m.key,
    label: `${m.label} ${m.key.slice(2, 4)}`,
    start: m.start,
    end: m.end,
  }));

  let baseBuckets: { key: string; label: string; start: string; end: string }[];
  if (granularity === 'monthly') {
    baseBuckets = monthlyBuckets;
  } else {
    const grouped = new Map<string, { key: string; label: string; start: string; end: string }>();
    for (const m of quarter.months) {
      const [yearStr, monthStr] = m.key.split('-');
      const monthIdx = parseInt(monthStr, 10) - 1;
      const q = Math.floor(monthIdx / 3) + 1;
      const key = `${yearStr}-Q${q}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { key, label: `Q${q} ${yearStr.slice(2)}`, start: m.start, end: m.end });
      } else if (m.end > existing.end) {
        existing.end = m.end;
      }
    }
    baseBuckets = Array.from(grouped.values());
  }

  return baseBuckets.map((b) => {
    const bucketDeals = deals.filter((d) => {
      if (!d.entered_at) return false;
      const day = d.entered_at.slice(0, 10);
      return day >= b.start && day <= b.end;
    });
    const count = bucketDeals.length;
    const sum = bucketDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const value =
      metricType === 'count' ? count :
      metricType === 'dollars' ? sum :
      count > 0 ? sum / count : 0;
    return { ...b, deals: bucketDeals, count, sum, value };
  });
}

function DrilldownBarChart({
  buckets,
  color,
  formatter,
  selectedKey,
  onSelect,
  metricType,
}: {
  buckets: DrilldownBucket[];
  color: string;
  formatter: (v: number) => string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  metricType: 'count' | 'dollars' | 'average';
}) {
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={metricType !== 'count'}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatter(v)}
            width={54}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const b = payload[0].payload as DrilldownBucket;
              return (
                <div
                  style={{
                    backgroundColor: 'hsl(var(--popover) / 0.96)',
                    border: '1px solid hsl(0 0% 100% / 0.14)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                    color: 'hsl(0 0% 100%)',
                    boxShadow: 'var(--shadow-xl)',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{b.label} · {formatter(b.value)}</div>
                  <div style={{ color: 'hsl(0 0% 100% / 0.78)' }}>
                    {b.count} deal{b.count !== 1 ? 's' : ''} · {formatCurrency(b.sum)}
                  </div>
                </div>
              );
            }}
            wrapperStyle={{ outline: 'none' }}
            cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
          />
          <Bar
            dataKey="value"
            shape={createGlassBarShape({ radius: 3, dataKey: 'value' })}
            cursor="pointer"
            onClick={(b: DrilldownBucket) => onSelect(selectedKey === b.key ? null : b.key)}
          >
            {buckets.map((b, i) => {
              const isActive = selectedKey === null || selectedKey === b.key;
              return (
                <Cell
                  key={`${b.key}-${i}`}
                  fill={b.value > 0 ? color : 'hsl(var(--muted))'}
                  fillOpacity={b.value > 0 ? (isActive ? 0.85 : 0.35) : 0.25}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DrilldownModal({
  open, onClose, title, deals, periodNote, selectedQuarter,
  metricType = 'dollars', valueFormatter, chartColor,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  deals: StageEntryDeal[];
  periodNote?: string;
  selectedQuarter?: QuarterOption;
  metricType?: 'count' | 'dollars' | 'average' | 'none';
  valueFormatter?: (v: number) => string;
  chartColor?: string;
}) {
  const [granularity, setGranularity] = useState<TrendChartMode>('monthly');
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGranularity('monthly');
      setSelectedBucketKey(null);
    }
  }, [open, title]);

  const showChart = metricType !== 'none' && !!selectedQuarter && deals.length > 0;
  const chartMetricType = (metricType === 'none' ? 'count' : metricType) as 'count' | 'dollars' | 'average';
  const formatter = valueFormatter ?? (chartMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency);
  const color = chartColor ?? 'hsl(var(--chart-3))';

  const buckets = useMemo<DrilldownBucket[]>(() => {
    if (!selectedQuarter) return [];
    return buildDrilldownBuckets(deals, selectedQuarter, granularity, chartMetricType);
  }, [deals, selectedQuarter, granularity, chartMetricType]);

  const filteredDeals = useMemo(() => {
    if (!selectedBucketKey) return deals;
    const b = buckets.find((x) => x.key === selectedBucketKey);
    return b ? b.deals : deals;
  }, [deals, buckets, selectedBucketKey]);

  const total = deals.reduce((s, d) => s + d.value, 0);
  const selectedBucket = selectedBucketKey ? buckets.find((b) => b.key === selectedBucketKey) ?? null : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono">
            {formatCurrencyFull(total)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {showChart
              ? `${granularity === 'monthly' ? 'Monthly' : 'Quarterly'} trend for selected period`
              : (periodNote ?? 'Filtered by selected period')}
          </span>
        </div>

        {showChart && (
          <div className="mb-4 rounded-lg border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {chartMetricType === 'count' ? 'Deals' : chartMetricType === 'dollars' ? 'Dollar volume' : 'Average'} by {granularity === 'monthly' ? 'month' : 'quarter'}
              </div>
              <div className="flex items-center gap-2">
                {selectedBucket && (
                  <button
                    type="button"
                    onClick={() => setSelectedBucketKey(null)}
                    className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    Clear · {selectedBucket.label}
                  </button>
                )}
                <Tabs value={granularity} onValueChange={(v) => { setGranularity(v as TrendChartMode); setSelectedBucketKey(null); }}>
                  <TabsList className="h-7 bg-muted/40 border border-border/40">
                    <TabsTrigger value="monthly" className="h-6 px-2 text-[11px]">Monthly</TabsTrigger>
                    <TabsTrigger value="quarterly" className="h-6 px-2 text-[11px]">Quarterly</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            <DrilldownBarChart
              buckets={buckets}
              color={color}
              formatter={formatter}
              selectedKey={selectedBucketKey}
              onSelect={setSelectedBucketKey}
              metricType={chartMetricType}
            />
          </div>
        )}

        {filteredDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {selectedBucketKey ? 'No deals in this bucket.' : 'No deals found for this period.'}
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Deal / Company</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Current Stage</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Entered</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(deal => (
                  <tr key={deal.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{deal.company}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{formatCurrencyFull(deal.value)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {deal.current_stage?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(deal.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{deal.manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20">
                  <td className="px-3 py-2 text-xs font-medium">
                    Total {selectedBucketKey ? '(all periods)' : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">{formatCurrencyFull(total)}</td>
                  <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                    {deals.length} deal{deals.length !== 1 ? 's' : ''} across all buckets
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  cards: MetricCardConfig[];
}

type TrendChartMode = 'monthly' | 'quarterly';

type TrendMetricKey = 'deals-closed' | 'dollars-funded';

interface PendingTrendReopen {
  metric: TrendMetricKey;
  mode: TrendChartMode;
  bucketKey: string;
}

function CompactFundedBarChart({
  title,
  subtitle,
  buckets,
  isLoading,
  color,
  dataKey,
  valueFormatter,
  totalFormatter,
  onBarClick,
}: {
  title: string;
  subtitle: string;
  buckets: StageTrendBucket[];
  isLoading: boolean;
  color: string;
  dataKey: 'count' | 'dollarVolume';
  valueFormatter: (value: number) => string;
  totalFormatter: (value: number) => string;
  onBarClick: (bucket: StageTrendBucket) => void;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket[dataKey], 0);

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-1 h-3 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{totalFormatter(total)}</p>
          <p className="text-[10px] text-muted-foreground">{buckets.length} {buckets.length === 6 ? 'Months' : 'Quarters'}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={dataKey === 'dollarVolume'}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => valueFormatter(value)}
                width={54}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const bucket = payload[0].payload as StageTrendBucket;
                  const value = dataKey === 'dollarVolume' ? bucket.dollarVolume : bucket.count;
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: 'hsl(0 0% 100%)',
                        maxWidth: 280,
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(0 0% 100%)' }}>
                        {bucket.label} · {valueFormatter(value)}
                      </div>
                      <div style={{ color: 'hsl(0 0% 100% / 0.82)', marginBottom: bucket.deals.length ? 6 : 0 }}>
                        {bucket.count} deal{bucket.count !== 1 ? 's' : ''} · {formatCurrency(bucket.dollarVolume)}
                      </div>
                      {bucket.deals.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 14, lineHeight: 1.4 }}>
                          {bucket.deals.slice(0, 8).map((deal) => (
                            <li key={deal.deal_id} style={{ color: 'hsl(0 0% 100% / 0.88)' }}>
                              {deal.company}
                            </li>
                          ))}
                          {bucket.deals.length > 8 ? (
                            <li style={{ color: 'hsl(0 0% 100% / 0.78)' }}>+{bucket.deals.length - 8} more</li>
                          ) : null}
                        </ul>
                      ) : (
                        <div style={{ color: 'hsl(0 0% 100% / 0.78)' }}>No deals</div>
                      )}
                    </div>
                  );
                }}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Bar dataKey={dataKey} shape={createGlassBarShape({ radius: 3, dataKey })} cursor="pointer" onClick={(bucket: StageTrendBucket) => onBarClick(bucket)}>
                {buckets.map((bucket, index) => {
                  const rawValue = dataKey === 'dollarVolume' ? bucket.dollarVolume : bucket.count;
                  return (
                    <Cell
                      key={`${bucket.key}-${index}`}
                      fill={rawValue > 0 ? color : 'hsl(var(--muted))'}
                      fillOpacity={rawValue > 0 ? 0.85 : 0.3}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const FUNDED_INVOICED_COLOR = 'hsl(var(--chart-3))';
const CLOSED_WON_COLOR = 'hsl(142 71% 45%)';

function StageMovementStackedBarChart({
  buckets,
  isLoading,
  trendMode,
  onBarClick,
}: {
  buckets: StageSplitTrendBucket[];
  isLoading: boolean;
  trendMode: TrendChartMode;
  onBarClick: (bucket: StageSplitTrendBucket) => void;
}) {
  const total = buckets.reduce((s, b) => s + b.total, 0);

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="mt-1 h-3 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">
            Stage Movement — Funded/Invoiced vs Closed Won
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consolidated Debt Pipeline — {trendMode === 'monthly' ? 'monthly' : 'quarterly'} stage_enter events, past {trendMode === 'monthly' ? '6 months' : '4 quarters'} (rolling, anchored to today)
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">{buckets.length} {trendMode === 'monthly' ? 'Months' : 'Quarters'}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const bucket = payload[0].payload as StageSplitTrendBucket;
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: 'hsl(0 0% 100%)',
                        maxWidth: 280,
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {bucket.label} · {bucket.total} event{bucket.total !== 1 ? 's' : ''}
                      </div>
                      <div style={{ color: FUNDED_INVOICED_COLOR }}>
                        Funded / Invoiced: {bucket.fundedInvoicedCount}
                      </div>
                      <div style={{ color: CLOSED_WON_COLOR }}>
                        Closed Won: {bucket.closedWonCount}
                      </div>
                    </div>
                  );
                }}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}
                iconType="circle"
              />
              <Bar
                dataKey="fundedInvoicedCount"
                name="Funded / Invoiced"
                stackId="stage"
                fill={FUNDED_INVOICED_COLOR}
                fillOpacity={0.85}
                cursor="pointer"
                onClick={(bucket: StageSplitTrendBucket) => onBarClick(bucket)}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="closedWonCount"
                name="Closed Won"
                stackId="stage"
                fill={CLOSED_WON_COLOR}
                fillOpacity={0.9}
                cursor="pointer"
                onClick={(bucket: StageSplitTrendBucket) => onBarClick(bucket)}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConsolidatedDebtPipelineDashboard({
  selectedQuarter,
}: {
  selectedQuarter?: QuarterOption;
}) {
  const m = useConsolidatedDebtPipelineMetrics(selectedQuarter as QuarterOption);
  const [trendMode, setTrendMode] = useState<TrendChartMode>('monthly');
  const [pendingTrendReopen, setPendingTrendReopen] = useState<PendingTrendReopen | null>(null);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    deals: StageEntryDeal[];
    periodNote?: string;
    metricType?: 'count' | 'dollars' | 'average' | 'none';
    valueFormatter?: (v: number) => string;
    chartColor?: string;
  } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!m.fundedInvoicedTrend.isLoading && !m.fundedInvoiced.isLoading) {
      setLastRefresh(new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.fundedInvoicedTrend.isLoading, m.fundedInvoiced.isLoading, m.fundedInvoicedTrend.monthly]);

  const fundedTrendBuckets = trendMode === 'monthly' ? m.fundedInvoicedTrend.monthly : m.fundedInvoicedTrend.quarterly;

  const buildTrendPeriodNote = (bucket: StageTrendBucket, metricLabel: string) =>
    `${metricLabel} · Consolidated Debt Pipeline → Funded / Invoiced + Closed Won · ${bucket.label}`;

  useEffect(() => {
    if (m.fundedInvoicedTrend.isLoading || !selectedQuarter) return;
    const reopen = consumePendingReopen(
      (entry) => entry.source === 'insights.consolidated-debt-pipeline' && entry.quarterId === selectedQuarter.value,
    );
    if (!reopen) return;
    const [metric, mode, bucketKey] = reopen.bucketKey.split('|') as [TrendMetricKey, TrendChartMode, string];
    if (mode !== trendMode) {
      setPendingTrendReopen({ metric, mode, bucketKey });
      setTrendMode(mode);
      return;
    }
    const bucket = (mode === 'monthly' ? m.fundedInvoicedTrend.monthly : m.fundedInvoicedTrend.quarterly).find((entry) => entry.key === bucketKey);
    if (!bucket) return;
    setDrilldown({
      title: `${metric === 'deals-closed' ? 'Deals Closed' : 'Dollars Funded'} — ${bucket.label}`,
      deals: bucket.deals,
      periodNote: buildTrendPeriodNote(bucket, metric === 'deals-closed' ? 'Deal count' : 'Dollar volume'),
      metricType: metric === 'deals-closed' ? 'count' : 'dollars',
      valueFormatter: metric === 'deals-closed' ? (v: number) => `${Math.round(v)}` : formatCurrency,
      chartColor: metric === 'deals-closed' ? 'hsl(var(--chart-3))' : 'hsl(var(--success))',
    });
  }, [m.fundedInvoicedTrend.isLoading, m.fundedInvoicedTrend.monthly, m.fundedInvoicedTrend.quarterly, selectedQuarter, trendMode]);

  useEffect(() => {
    if (!pendingTrendReopen || pendingTrendReopen.mode !== trendMode) return;
    const bucket = (trendMode === 'monthly' ? m.fundedInvoicedTrend.monthly : m.fundedInvoicedTrend.quarterly).find(
      (entry) => entry.key === pendingTrendReopen.bucketKey,
    );
    if (!bucket) return;
    setDrilldown({
      title: `${pendingTrendReopen.metric === 'deals-closed' ? 'Deals Closed' : 'Dollars Funded'} — ${bucket.label}`,
      deals: bucket.deals,
      periodNote: buildTrendPeriodNote(bucket, pendingTrendReopen.metric === 'deals-closed' ? 'Deal count' : 'Dollar volume'),
      metricType: pendingTrendReopen.metric === 'deals-closed' ? 'count' : 'dollars',
      valueFormatter: pendingTrendReopen.metric === 'deals-closed' ? (v: number) => `${Math.round(v)}` : formatCurrency,
      chartColor: pendingTrendReopen.metric === 'deals-closed' ? 'hsl(var(--chart-3))' : 'hsl(var(--success))',
    });
    setPendingTrendReopen(null);
  }, [m.fundedInvoicedTrend.monthly, m.fundedInvoicedTrend.quarterly, pendingTrendReopen, trendMode]);

  const formatMetricCurrency = (value: number | null) => (value == null ? 'N/A' : formatCurrency(value));

  if (!selectedQuarter) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a quarter from the dashboard header to view Consolidated Debt Pipeline metrics.
      </div>
    );
  }

  const sections: SectionDef[] = [
    {
      id: 'sales',
      title: 'Sales',
      description: 'New opportunities entering the pipeline',
      cards: [
        {
          id: 'deals-on-board',
          title: 'Deals on the Board',
          icon: Users,
          value: m.ndaNeedsList.count,
          isLoading: m.ndaNeedsList.isLoading,
          deals: m.ndaNeedsList.deals,
          color: 'hsl(var(--primary))',
          drilldownTitle: 'Deals on the Board — added to Active Pipeline',
        },
        {
          id: 'debt-dollar-on-board',
          title: 'Debt $ on the Board',
          icon: DollarSign,
          value: formatCurrency(m.ndaNeedsList.dollarVolume),
          isLoading: m.ndaNeedsList.isLoading,
          deals: m.ndaNeedsList.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Debt $ on the Board — added to Active Pipeline',
        },
        {
          id: 'average-deal-on-board',
          title: 'Average Deal on the Board',
          icon: DollarSign,
          value: formatMetricCurrency(m.averageDealOnBoard.value),
          isLoading: m.averageDealOnBoard.isLoading,
          deals: m.averageDealOnBoard.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Average Deal on the Board — added to Active Pipeline',
          drilldownPeriodNote: 'Selected period · Debt $ on the Board ÷ Deals on the Board',
        },
      ],
    },
    {
      id: 'proposals',
      title: 'Proposals',
      description: 'Proposals issued to clients in the Active Pipeline',
      cards: [
        {
          id: 'proposals-issued',
          title: 'Proposals Issued',
          icon: FileText,
          value: m.proposalsIssued.count,
          isLoading: m.proposalsIssued.isLoading,
          deals: m.proposalsIssued.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Proposals Issued — entered Proposal Issued',
        },
        {
          id: 'dollars-proposed',
          title: 'Dollars Proposed',
          icon: Coins,
          value: formatCurrency(m.proposalsIssued.dollarVolume),
          isLoading: m.proposalsIssued.isLoading,
          deals: m.proposalsIssued.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Dollars Proposed — entered Proposal Issued',
        },
      ],
    },
    {
      id: 'signed',
      title: 'Signed',
      description: 'Engagements signed (entered Final Credit Items)',
      cards: [
        {
          id: 'debt-deals-signed',
          title: 'Debt Deals Signed',
          icon: FileSignature,
          value: m.finalCreditItems.count,
          isLoading: m.finalCreditItems.isLoading,
          deals: m.finalCreditItems.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Debt Deals Signed — entered Final Credit Items',
        },
        {
          id: 'debt-dollar-signed',
          title: 'Debt $ Signed',
          icon: Banknote,
          value: formatCurrency(m.finalCreditItems.dollarVolume),
          isLoading: m.finalCreditItems.isLoading,
          deals: m.finalCreditItems.deals,
          color: 'hsl(var(--success))',
          drilldownTitle: 'Debt $ Signed — entered Final Credit Items',
        },
        {
          id: 'average-deal-signed',
          title: 'Average Deal Signed',
          icon: DollarSign,
          value: formatMetricCurrency(m.averageDealSigned.value),
          isLoading: m.averageDealSigned.isLoading,
          deals: m.averageDealSigned.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Average Deal Signed — entered Final Credit Items',
          drilldownPeriodNote: 'Trailing 6 months · based on stage-entry deal volume ÷ deal count',
        },
        {
          id: 'average-revenue-per-deal-signed',
          title: 'Average Revenue per Deal Signed',
          icon: Coins,
          value: formatMetricCurrency(m.averageRevenuePerDealSigned.value),
          isLoading: m.averageRevenuePerDealSigned.isLoading,
          deals: m.averageRevenuePerDealSigned.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Average Revenue per Deal Signed — Final Credit Items',
          drilldownPeriodNote: 'Trailing 12 months revenue ÷ trailing 12 months signed-deal count',
        },
      ],
    },
    {
      id: 'closed',
      title: 'Closed',
      description: 'Deals entering Funded / Invoiced in the Active Pipeline',
      cards: [
        {
          id: 'deals-closed',
          title: 'Deals Closed',
          icon: FileSignature,
          value: m.fundedInvoicedOnly.count,
          isLoading: m.fundedInvoicedOnly.isLoading,
          deals: m.fundedInvoicedOnly.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Deals Closed — entered Funded / Invoiced',
        },
        {
          id: 'dollars-funded',
          title: 'Dollars Funded',
          icon: Banknote,
          value: formatCurrency(m.fundedInvoicedOnly.dollarVolume),
          isLoading: m.fundedInvoicedOnly.isLoading,
          deals: m.fundedInvoicedOnly.deals,
          color: 'hsl(var(--success))',
          drilldownTitle: 'Dollars Funded — entered Funded / Invoiced',
        },
        {
          id: 'average-deal-closed',
          title: 'Average Deal Closed',
          icon: Banknote,
          value: formatMetricCurrency(m.averageDealClosed.value),
          isLoading: m.averageDealClosed.isLoading,
          deals: m.averageDealClosed.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Average Deal Closed — entered Funded / Invoiced',
          drilldownPeriodNote: 'Trailing 6 months · based on stage-entry deal volume ÷ deal count',
        },
        {
          id: 'average-revenue-per-deal-closed',
          title: 'Average Revenue per Deal Closed',
          icon: Handshake,
          value: formatMetricCurrency(m.averageRevenuePerDealClosed.value),
          isLoading: m.averageRevenuePerDealClosed.isLoading,
          deals: m.averageRevenuePerDealClosed.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Average Revenue per Deal Closed — Funded / Invoiced',
          drilldownPeriodNote: 'Trailing 12 months revenue ÷ trailing 12 months funded-deal count',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Terms',
      description: 'Lender terms issued and signed',
      cards: [
        {
          id: 'terms-issued',
          title: 'Terms Issued',
          icon: ScrollText,
          value: m.termsIssued.count,
          isLoading: m.termsIssued.isLoading,
          deals: m.termsIssued.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Terms Issued — entered Terms Issued',
        },
        {
          id: 'terms-issued-dollars',
          title: 'Terms Issued $',
          icon: DollarSign,
          value: formatCurrency(m.termsIssued.dollarVolume),
          isLoading: m.termsIssued.isLoading,
          deals: m.termsIssued.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Terms Issued $ — entered Terms Issued',
        },
        {
          id: 'terms-signed',
          title: 'Terms Signed',
          icon: Handshake,
          value: m.inDueDiligence.count,
          isLoading: m.inDueDiligence.isLoading,
          deals: m.inDueDiligence.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Terms Signed — entered In Due Diligence',
        },
        {
          id: 'terms-signed-dollars',
          title: 'Terms Signed $',
          icon: ClipboardCheck,
          value: formatCurrency(m.inDueDiligence.dollarVolume),
          isLoading: m.inDueDiligence.isLoading,
          deals: m.inDueDiligence.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Terms Signed $ — entered In Due Diligence',
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Consolidated Debt Pipeline</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Stage-entry metrics from deal_stage_history (Funded / Invoiced + Closed Won) · {selectedQuarter.label} · Click any tile for detail
        </p>
      </div>

      {sections.map(section => (
        <div key={section.id} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              {section.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {section.cards.map(card => (
              <MetricKPICard
                key={card.id}
                config={card}
                onClick={() => setDrilldown({ title: card.drilldownTitle, deals: card.deals, periodNote: card.drilldownPeriodNote })}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Closed Trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Consolidated Debt Pipeline — stage_enter into Funded / Invoiced or Closed Won, zero-filled periods (rolling, anchored to today)
            </p>
          </div>
          <Tabs value={trendMode} onValueChange={(value) => setTrendMode(value as TrendChartMode)}>
            <TabsList className="bg-muted/40 border border-border/40">
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompactFundedBarChart
            title="Deals Closed"
            subtitle={`Consolidated Debt Pipeline → Funded / Invoiced + Closed Won · ${trendMode === 'monthly' ? 'Past 6 months' : 'Past 4 quarters'}`}
            buckets={fundedTrendBuckets}
            isLoading={m.fundedInvoicedTrend.isLoading}
            color="hsl(var(--chart-3))"
            dataKey="count"
            valueFormatter={(value) => `${Math.round(value)}`}
            totalFormatter={(value) => `${Math.round(value)}`}
            onBarClick={(bucket) =>
              setDrilldown({
                title: `Deals Closed — ${bucket.label}`,
                deals: bucket.deals,
                periodNote: buildTrendPeriodNote(bucket, 'Deal count'),
              })
            }
          />
          <CompactFundedBarChart
            title="Dollars Funded"
            subtitle={`Consolidated Debt Pipeline → Funded / Invoiced + Closed Won · ${trendMode === 'monthly' ? 'Past 6 months' : 'Past 4 quarters'}`}
            buckets={fundedTrendBuckets}
            isLoading={m.fundedInvoicedTrend.isLoading}
            color="hsl(var(--success))"
            dataKey="dollarVolume"
            valueFormatter={formatCurrency}
            totalFormatter={formatCurrency}
            onBarClick={(bucket) =>
              setDrilldown({
                title: `Dollars Funded — ${bucket.label}`,
                deals: bucket.deals,
                periodNote: buildTrendPeriodNote(bucket, 'Dollar volume'),
              })
            }
          />
        </div>

        <StageMovementStackedBarChart
          buckets={trendMode === 'monthly' ? m.closedSplitTrend.monthly : m.closedSplitTrend.quarterly}
          isLoading={m.closedSplitTrend.isLoading}
          trendMode={trendMode}
          onBarClick={(bucket) =>
            setDrilldown({
              title: `Stage Movement — ${bucket.label}`,
              deals: bucket.deals,
              periodNote: `Funded / Invoiced + Closed Won stage_enter events · ${bucket.label}`,
            })
          }
        />

        <StageTransitTimeChart />
      </div>

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
        periodNote={drilldown?.periodNote}
      />

      <div className="pt-2 text-[10px] text-muted-foreground/70 font-mono">
        data source: deal_stage_history · source: all · last refresh: {lastRefresh.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })}
      </div>
    </div>
  );
}
