import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Users, DollarSign, FileCheck, FileSignature, FileText, ClipboardCheck,
  Coins, ScrollText, Handshake, Banknote, Briefcase, Sigma, LayoutGrid, Table as TableIcon,
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
import { PnlFourChartsSection } from '@/components/metrics/finserv-charts/PnlFourChartsSection';
import { DEBT_ADVISORY_REALM_ID } from '@/hooks/useFinServFinancialMetrics';
import { InsightsDrilldownDrawer, type DrilldownContext } from '@/components/metrics/insights/InsightsDrilldownDrawer';

/**
 * Debt Advisory Metrics Board currency display.
 * Always renders as abbreviated millions with two decimals, e.g. $2.00MM, $0.75MM.
 * Used for KPI tiles, drilldown table cells, totals, and chart tooltips so every
 * surface on this board reconciles.
 */
const formatCurrency = (value: number) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 1_000_000).toFixed(2)}MM`;
};

const formatCurrencyFull = formatCurrency;

/**
 * Stage-slug → display-label map for this board. Centralized so KPI tiles,
 * drilldown tables, and tooltips never show a malformed title-cased slug
 * (e.g. "Ndaneeds List Sent").
 */
const STAGE_LABEL_OVERRIDES: Record<string, string> = {
  'ndaneeds-list-sent': 'NDA/Needs List Sent',
  'nda-needs-list-sent': 'NDA/Needs List Sent',
  'nda_needs_list_sent': 'NDA/Needs List Sent',
};

const formatStageLabel = (slug: string | null | undefined): string => {
  if (!slug) return '—';
  const key = String(slug).toLowerCase().trim();
  if (STAGE_LABEL_OVERRIDES[key]) return STAGE_LABEL_OVERRIDES[key];
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

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
  /** Optional numerator/denominator breakdown for conversion-rate widgets. */
  conversionBreakdown?: ConversionBreakdown;
  /** Short label for the denominator stage that anchors this card's
   *  passthrough filter (e.g. "Submitted to Lenders"). */
  signedAnchorLabel?: string;
  /** Optional secondary value displayed beneath the primary value
   *  (e.g. a dollar total under a deal count). Clicking it opens its own
   *  drilldown so users can inspect the count and dollar views separately. */
  secondary?: {
    label?: string;
    value: string | number;
    isLoading: boolean;
    deals: StageEntryDeal[];
    color?: string;
    drilldownTitle: string;
    drilldownPeriodNote?: string;
    drilldownMetricType?: 'count' | 'dollars' | 'average' | 'none';
    drilldownValueFormatter?: (value: number) => string;
    drilldownChartColor?: string;
  };
}

interface ConversionBreakdown {
  formula: string;
  numeratorLabel: string;
  denominatorLabel: string;
  numeratorDeals: StageEntryDeal[];
  denominatorDeals: StageEntryDeal[];
  numeratorCount: number;
  denominatorCount: number;
  percentText: string;
}

function MetricKPICard({
  config,
  onClick,
  onSecondaryClick,
}: {
  config: MetricCardConfig;
  onClick: () => void;
  onSecondaryClick?: () => void;
}) {
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
      <CardContent className="flex items-center gap-2 py-4 px-2">
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
          {config.secondary && (
            <div className="mt-1 pt-1 border-t border-border/40">
              {config.secondary.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  onClick={onSecondaryClick}
                  className="drilldown-value text-[1.3125rem] leading-tight font-semibold font-mono tabular-nums text-muted-foreground hover:text-foreground transition-colors"
                  style={config.secondary.color ? { color: config.secondary.color } : undefined}
                >
                  {config.secondary.value}
                </button>
              )}
            </div>
          )}
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
  metricType = 'dollars', valueFormatter, chartColor, conversionBreakdown,
  signedMode, onSignedModeChange, signedAnchorLabel,
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
  conversionBreakdown?: ConversionBreakdown;
  signedMode?: 'off' | 'ttm' | 'lifetime';
  onSignedModeChange?: (v: 'off' | 'ttm' | 'lifetime') => void;
  signedAnchorLabel?: string;
}) {
  return (
    <DrilldownModalInner
      open={open}
      onClose={onClose}
      title={title}
      deals={deals}
      periodNote={periodNote}
      selectedQuarter={selectedQuarter}
      metricType={metricType}
      valueFormatter={valueFormatter}
      chartColor={chartColor}
      conversionBreakdown={conversionBreakdown}
      signedMode={signedMode}
      onSignedModeChange={onSignedModeChange}
      signedAnchorLabel={signedAnchorLabel}
    />
  );
}

function ConversionDealsTable({ heading, deals, accent }: { heading: string; deals: StageEntryDeal[]; accent: string }) {
  return _ConversionDealsTable({ heading, deals, accent });
}

function SignedModeToggle({
  value,
  onChange,
  anchorLabel,
}: {
  value: 'off' | 'ttm' | 'lifetime';
  onChange: (v: 'off' | 'ttm' | 'lifetime') => void;
  anchorLabel: string;
}) {
  const opts: Array<{ v: 'off' | 'ttm' | 'lifetime'; label: string; hint: string }> = [
    { v: 'off', label: 'All entries', hint: `Raw stage-entry counts — no ${anchorLabel} passthrough filter` },
    { v: 'ttm', label: `In ${anchorLabel} (TTM)`, hint: `Only deals that entered ${anchorLabel} in the last 12 months` },
    { v: 'lifetime', label: `In ${anchorLabel} ever`, hint: `Only deals that entered ${anchorLabel} at any point in their history` },
  ];
  return (
    <div className="inline-flex rounded-md border border-border/40 bg-muted/40 p-0.5 gap-0.5">
      {opts.map(o => (
        <button
          key={o.v}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.v)}
          className={
            'px-2.5 py-1 text-[11px] rounded-sm transition-colors ' +
            (value === o.v
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function _ConversionDealsTable({ heading, deals, accent }: { heading: string; deals: StageEntryDeal[]; accent: string }) {
  const total = deals.reduce((s, d) => s + d.value, 0);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          <span className="text-xs font-semibold text-foreground">{heading}</span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · {formatCurrencyFull(total)}
        </span>
      </div>
      {deals.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No deals entered this stage in the trailing 12 months.</p>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/20">
              <tr className="border-b">
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Deal</th>
                <th className="text-right px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Entered</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-medium">{d.company}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatCurrencyFull(d.value)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(d.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrilldownModalInner({
  open, onClose, title, deals, periodNote, selectedQuarter,
  metricType = 'dollars', valueFormatter, chartColor, conversionBreakdown,
  signedMode, onSignedModeChange, signedAnchorLabel,
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
  conversionBreakdown?: ConversionBreakdown;
  signedMode?: 'off' | 'ttm' | 'lifetime';
  onSignedModeChange?: (v: 'off' | 'ttm' | 'lifetime') => void;
  signedAnchorLabel?: string;
}) {
  const [granularity, setGranularity] = useState<TrendChartMode>('monthly');
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGranularity('monthly');
      setSelectedBucketKey(null);
    }
  }, [open, title]);

  const showChart =
    !conversionBreakdown && metricType !== 'none' && !!selectedQuarter && deals.length > 0;
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

  const context: DrilldownContext = {
    sourceId: `debt-advisory:${title}`,
    sourceLabel: title,
    selection: periodNote,
    periodLabel: selectedQuarter?.label,
  };

  const body = (
    <div className="p-4 space-y-4 text-foreground">
        {conversionBreakdown && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversion rate
                </div>
                <div className="text-2xl font-bold text-foreground mt-0.5">
                  {conversionBreakdown.percentText}
                </div>
              </div>
              <Badge variant="secondary" className="text-xs font-mono">
                {conversionBreakdown.numeratorCount} ÷ {conversionBreakdown.denominatorCount}
              </Badge>
            </div>
            {onSignedModeChange && (
              <div className="rounded-md border border-border/40 bg-background/60 p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Restrict to deals that entered {signedAnchorLabel ?? 'the denominator stage'}
                </div>
                <SignedModeToggle
                  value={signedMode ?? 'off'}
                  onChange={onSignedModeChange}
                  anchorLabel={signedAnchorLabel ?? 'denominator'}
                />
                <p className="text-[11px] text-muted-foreground">
                  {signedMode === 'ttm' && `Numerator only counts deals whose ${signedAnchorLabel ?? 'denominator'} entry falls inside the trailing 12-month window.`}
                  {signedMode === 'lifetime' && `Numerator only counts deals that entered ${signedAnchorLabel ?? 'the denominator stage'} at any point in their history — even if the ${signedAnchorLabel ?? 'denominator'} event predates the TTM window.`}
                  {(!signedMode || signedMode === 'off') && `Raw stage-entry counts — no ${signedAnchorLabel ?? 'denominator'}-passthrough filter applied.`}
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Source: deal_stage_history · stage_enter events on the Active Pipeline,
              deduplicated to the first entry per deal per stage over the trailing 12 months.
              Numerator = {conversionBreakdown.numeratorLabel}. Denominator = {conversionBreakdown.denominatorLabel}.
            </p>
          </div>
        )}

      <div className="flex items-center gap-3 flex-wrap">
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
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
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

        {conversionBreakdown ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ConversionDealsTable
              heading={`Denominator · ${conversionBreakdown.denominatorLabel}`}
              deals={conversionBreakdown.denominatorDeals}
              accent="hsl(var(--chart-4))"
            />
            <ConversionDealsTable
              heading={`Numerator · ${conversionBreakdown.numeratorLabel}`}
              deals={conversionBreakdown.numeratorDeals}
              accent="hsl(var(--chart-3))"
            />
          </div>
        ) : filteredDeals.length === 0 ? (
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
                      {formatStageLabel(deal.current_stage)}
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
    </div>
  );

  return (
    <InsightsDrilldownDrawer
      open={open}
      onClose={onClose}
      context={context}
      columns={[]}
      rows={[]}
      body={body}
      onBackToDashboard={onClose}
    />
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
            Debt Advisory Metrics — {trendMode === 'monthly' ? 'monthly' : 'quarterly'} stage_enter events, past {trendMode === 'monthly' ? '6 months' : '4 quarters'} (rolling, anchored to today)
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

function PipelineMatrixTable({
  sections,
  selectedQuarter,
  onCellClick,
}: {
  sections: SectionDef[];
  selectedQuarter: QuarterOption;
  onCellClick: (card: MetricCardConfig, bucket: { key: string; label: string; deals: StageEntryDeal[] } | null) => void;
}) {
  const months = selectedQuarter.months;

  const rowsBySection = sections.map((section) => ({
    section,
    rows: section.cards.filter(c => !/average/i.test(c.title)),
  })).filter(s => s.rows.length > 0);

  const renderCell = (card: MetricCardConfig, monthStart: string, monthEnd: string) => {
    const dealsInMonth = card.deals.filter(d => {
      if (!d.entered_at) return false;
      const day = d.entered_at.slice(0, 10);
      return day >= monthStart && day <= monthEnd;
    });
    const metricType = card.drilldownMetricType ?? 'dollars';
    const count = dealsInMonth.length;
    const sum = dealsInMonth.reduce((s, d) => s + (Number(d.value) || 0), 0);
    if (metricType === 'count') return { display: count > 0 ? String(count) : '—', empty: count === 0, deals: dealsInMonth };
    return { display: count > 0 ? formatCurrency(sum) : '—', empty: count === 0, deals: dealsInMonth };
  };

  const renderTotal = (card: MetricCardConfig) => {
    const metricType = card.drilldownMetricType ?? 'dollars';
    if (metricType === 'count') return String(card.deals.length);
    const sum = card.deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    return formatCurrency(sum);
  };

  // Average cards across all sections, for the band below the table.
  const averageCards = sections.flatMap(s => s.cards.filter(c => /average/i.test(c.title)));

  return (
    <div className="space-y-4">
      <Card className="glass-module overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="sticky left-0 z-10 bg-muted/40 backdrop-blur text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[220px]">
                  Metric
                </th>
                {months.map(mo => (
                  <th
                    key={mo.key}
                    className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap min-w-[88px]"
                  >
                    {mo.label} {mo.key.slice(2, 4)}
                  </th>
                ))}
                <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground whitespace-nowrap min-w-[100px] border-l border-border/40">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsBySection.map(({ section, rows }) => (
                <Fragment key={section.id}>
                  <tr className="bg-muted/10">
                    <td
                      colSpan={months.length + 2}
                      className="sticky left-0 z-10 bg-muted/20 backdrop-blur px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground/80"
                    >
                      {section.title}
                      <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
                        {section.description}
                      </span>
                    </td>
                  </tr>
                  {rows.map(card => (
                    <tr key={card.id} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="sticky left-0 z-10 bg-card/95 backdrop-blur px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onCellClick(card, null)}
                          className="flex items-center gap-2 text-left hover:text-primary"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: card.color }}
                          />
                          {card.title}
                        </button>
                      </td>
                      {months.map(mo => {
                        const cell = renderCell(card, mo.start, mo.end);
                        return (
                          <td key={mo.key} className="px-3 py-2 text-right font-mono tabular-nums">
                            {card.isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                            ) : cell.empty ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onCellClick(card, {
                                    key: mo.key,
                                    label: `${mo.label} ${mo.key.slice(2, 4)}`,
                                    deals: cell.deals,
                                  })
                                }
                                className="hover:text-primary hover:underline underline-offset-2"
                              >
                                {cell.display}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-foreground border-l border-border/40">
                        {card.isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => onCellClick(card, null)}
                            className="hover:text-primary hover:underline underline-offset-2"
                          >
                            {renderTotal(card)}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {averageCards.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Averages</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Trailing-period averages — separated from the matrix because they are derived metrics
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {averageCards.map(card => (
              <MetricKPICard
                key={card.id}
                config={card}
                onClick={() => onCellClick(card, null)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConsolidatedDebtPipelineDashboard({
  selectedQuarter,
}: {
  selectedQuarter?: QuarterOption;
}) {
  const m = useConsolidatedDebtPipelineMetrics(selectedQuarter as QuarterOption);
  const [trendMode, setTrendMode] = useState<TrendChartMode>('monthly');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  // Conversion filter mode for the Pipeline Conversion section:
  //   'off'      → count every stage-entry event in the TTM window (raw)
  //   'ttm'      → downstream stages must ALSO have entered FCI inside TTM
  //   'lifetime' → downstream stages must have entered FCI at ANY point
  //                (includes deals whose FCI event predates the TTM window,
  //                 e.g. True North Transportation, Duracell Power Center)
  type SignedMode = 'off' | 'ttm' | 'lifetime';
  const [signedMode, setSignedMode] = useState<SignedMode>('off');
  const [pendingTrendReopen, setPendingTrendReopen] = useState<PendingTrendReopen | null>(null);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    deals: StageEntryDeal[];
    periodNote?: string;
    metricType?: 'count' | 'dollars' | 'average' | 'none';
    valueFormatter?: (v: number) => string;
    chartColor?: string;
    conversionBreakdown?: ConversionBreakdown;
    /** When set, the modal re-derives the breakdown from the live card by id
     *  so the FCI-only toggle inside the modal updates counts instantly. */
    conversionCardId?: string;
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
    `${metricLabel} · Debt Advisory Metrics → Funded / Invoiced + Closed Won · ${bucket.label}`;

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
        Select a quarter from the dashboard header to view Debt Advisory Metrics metrics.
      </div>
    );
  }

  const sections: SectionDef[] = [
    {
      id: 'sales',
      title: 'Sales',
      description: 'Top-line KPIs for the Active Pipeline',
      cards: [
        {
          id: 'deals-on-board',
          title: 'Deals on the Board',
          icon: Briefcase,
          value: m.ndaNeedsList.count,
          isLoading: m.ndaNeedsList.isLoading,
          deals: m.ndaNeedsList.deals,
          color: 'hsl(var(--primary))',
          drilldownTitle: 'Deals on the Board — added to Active Pipeline',
          drilldownMetricType: 'count',
          secondary: {
            value: formatCurrency(m.ndaNeedsList.dollarVolume),
            isLoading: m.ndaNeedsList.isLoading,
            deals: m.ndaNeedsList.deals,
            color: 'hsl(var(--chart-2))',
            drilldownTitle: 'Dollars on the Board — added to Active Pipeline',
            drilldownMetricType: 'dollars',
          },
        },
        {
          id: 'proposals-issued',
          title: 'Proposals Issued',
          icon: Briefcase,
          value: m.proposalsIssued.count,
          isLoading: m.proposalsIssued.isLoading,
          deals: m.proposalsIssued.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Proposals Issued — entered Proposal Issued',
          drilldownMetricType: 'count',
          secondary: {
            value: formatCurrency(m.proposalsIssued.dollarVolume),
            isLoading: m.proposalsIssued.isLoading,
            deals: m.proposalsIssued.deals,
            color: 'hsl(var(--chart-4))',
            drilldownTitle: 'Dollars Proposed — entered Proposal Issued',
            drilldownMetricType: 'dollars',
          },
        },
        {
          id: 'debt-deals-signed',
          title: 'Debt Deals Signed',
          icon: Briefcase,
          value: m.finalCreditItems.count,
          isLoading: m.finalCreditItems.isLoading,
          deals: m.finalCreditItems.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Debt Deals Signed — entered Final Credit Items',
          drilldownMetricType: 'count',
          secondary: {
            value: formatCurrency(m.finalCreditItems.dollarVolume),
            isLoading: m.finalCreditItems.isLoading,
            deals: m.finalCreditItems.deals,
            color: 'hsl(var(--success))',
            drilldownTitle: 'Dollars Signed — entered Final Credit Items',
            drilldownMetricType: 'dollars',
          },
        },
        {
          id: 'terms-issued',
          title: 'Terms Issued',
          icon: Briefcase,
          value: m.termsIssued.count,
          isLoading: m.termsIssued.isLoading,
          deals: m.termsIssued.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Terms Issued — entered Terms Issued',
          drilldownMetricType: 'count',
          secondary: {
            value: formatCurrency(m.termsIssued.dollarVolume),
            isLoading: m.termsIssued.isLoading,
            deals: m.termsIssued.deals,
            color: 'hsl(var(--chart-2))',
            drilldownTitle: 'Terms Issued $ — entered Terms Issued',
            drilldownMetricType: 'dollars',
          },
        },
        {
          id: 'terms-signed',
          title: 'Terms Signed',
          icon: Briefcase,
          value: m.inDueDiligence.count,
          isLoading: m.inDueDiligence.isLoading,
          deals: m.inDueDiligence.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Terms Signed — entered In Due Diligence',
          drilldownMetricType: 'count',
          secondary: {
            value: formatCurrency(m.inDueDiligence.dollarVolume),
            isLoading: m.inDueDiligence.isLoading,
            deals: m.inDueDiligence.deals,
            color: 'hsl(var(--chart-4))',
            drilldownTitle: 'Terms Signed $ — entered In Due Diligence',
            drilldownMetricType: 'dollars',
          },
        },
        {
          id: 'deals-closed',
          title: 'Deals Closed',
          icon: Briefcase,
          value: m.fundedInvoicedOnly.count,
          isLoading: m.fundedInvoicedOnly.isLoading,
          deals: m.fundedInvoicedOnly.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Deals Closed — entered Funded / Invoiced',
          drilldownMetricType: 'count',
          secondary: {
            value: formatCurrency(m.fundedInvoicedOnly.dollarVolume),
            isLoading: m.fundedInvoicedOnly.isLoading,
            deals: m.fundedInvoicedOnly.deals,
            color: 'hsl(var(--success))',
            drilldownTitle: 'Dollars Funded — entered Funded / Invoiced',
            drilldownMetricType: 'dollars',
          },
        },
      ],
    },
    {
      id: 'averages',
      title: 'Averages',
      description: 'Supporting averages — deal size and revenue per deal across the pipeline',
      cards: [
        {
          id: 'average-deal-on-board',
          title: 'Average Deal on the Board',
          icon: Sigma,
          value: formatMetricCurrency(m.averageDealOnBoard.value),
          isLoading: m.averageDealOnBoard.isLoading,
          deals: m.averageDealOnBoard.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Average Deal on the Board — added to Active Pipeline',
          drilldownPeriodNote: 'Selected period · Dollars on the Board ÷ Deals on the Board',
          drilldownMetricType: 'average',
        },
        {
          id: 'average-deal-signed',
          title: 'Average Deal Signed',
          icon: Sigma,
          value: formatMetricCurrency(m.averageDealSigned.value),
          isLoading: m.averageDealSigned.isLoading,
          deals: m.averageDealSigned.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Average Deal Signed — entered Final Credit Items',
          drilldownPeriodNote: 'Trailing 6 months · based on stage-entry deal volume ÷ deal count',
          drilldownMetricType: 'average',
        },
        {
          id: 'average-revenue-per-deal-signed',
          title: 'Average Revenue per Deal Signed',
          icon: Sigma,
          value: formatMetricCurrency(m.averageRevenuePerDealSigned.value),
          isLoading: m.averageRevenuePerDealSigned.isLoading,
          deals: m.averageRevenuePerDealSigned.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Average Revenue per Deal Signed — Final Credit Items',
          drilldownPeriodNote: 'Trailing 12 months revenue ÷ trailing 12 months signed-deal count',
          drilldownMetricType: 'none',
        },
        {
          id: 'average-deal-closed',
          title: 'Average Deal Closed',
          icon: Sigma,
          value: formatMetricCurrency(m.averageDealClosed.value),
          isLoading: m.averageDealClosed.isLoading,
          deals: m.averageDealClosed.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Average Deal Closed — entered Funded / Invoiced',
          drilldownPeriodNote: 'Trailing 6 months · based on stage-entry deal volume ÷ deal count',
          drilldownMetricType: 'average',
        },
        {
          id: 'average-revenue-per-deal-closed',
          title: 'Average Revenue per Deal Closed',
          icon: Sigma,
          value: formatMetricCurrency(m.averageRevenuePerDealClosed.value),
          isLoading: m.averageRevenuePerDealClosed.isLoading,
          deals: m.averageRevenuePerDealClosed.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Average Revenue per Deal Closed — Funded / Invoiced',
          drilldownPeriodNote: 'Trailing 12 months revenue ÷ trailing 12 months funded-deal count',
          drilldownMetricType: 'none',
        },
      ],
    },
    {
      id: 'pipeline-conversion',
      title: 'Pipeline Conversion',
      description: 'Trailing 12 months stage-to-stage conversion rates',
      cards: (() => {
        // Per-card denominator-anchored conversion filter.
        //
        // Each conversion card has a NUMERATOR stage (e.g. Terms Issued) and a
        // DENOMINATOR stage (e.g. Submitted to Lenders). The toggle restricts
        // the numerator to deals that ALSO passed through THAT card's own
        // denominator stage:
        //   'off'      → raw stage-entry counts (no passthrough filter)
        //   'ttm'      → numerator deal must have entered the denominator
        //                stage inside the trailing 12-month window
        //   'lifetime' → numerator deal must have entered the denominator
        //                stage at any point in its history (includes deals
        //                whose denominator event predates the TTM window)
        //
        // The denominator itself is the anchor — always shown unfiltered.
        const t = m.ttmCounts;
        const loading = t.isLoading || m.lifetimeStageDealIds.isLoading;
        const STAGE_LABELS = {
          proposalIssued: 'Proposal Issued',
          finalCreditItems: 'Final Credit Items',
          submittedToLenders: 'Submitted to Lenders / Lenders in Review',
          termsIssued: 'Terms Issued',
          inDueDiligence: 'In Due Diligence (Terms Signed)',
          fundedInvoiced: 'Funded / Invoiced',
        } as const;
        const SHORT_LABELS: Record<StageKey, string> = {
          proposalIssued: 'Proposal Issued',
          finalCreditItems: 'Final Credit Items',
          submittedToLenders: 'Submitted to Lenders',
          termsIssued: 'Terms Issued',
          inDueDiligence: 'Terms Signed',
          fundedInvoiced: 'Funded / Invoiced',
        };
        type StageKey = keyof typeof STAGE_LABELS;
        const pctText = (num: number, den: number) =>
          loading ? '…' : den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';
        const defs: Array<{ title: string; numKey: StageKey; denKey: StageKey }> = [
          { title: 'Proposal to Engagement',            numKey: 'finalCreditItems',    denKey: 'proposalIssued' },
          { title: 'Signed to Submission',              numKey: 'submittedToLenders',  denKey: 'finalCreditItems' },
          { title: 'Submission to Terms Issued',        numKey: 'termsIssued',         denKey: 'submittedToLenders' },
          { title: 'Signed to Terms Issued',            numKey: 'termsIssued',         denKey: 'finalCreditItems' },
          { title: 'Signed to Terms Signed',            numKey: 'inDueDiligence',      denKey: 'finalCreditItems' },
          { title: 'Submission to Terms Signed',        numKey: 'inDueDiligence',      denKey: 'submittedToLenders' },
          { title: 'Terms Issued to Terms Signed',      numKey: 'inDueDiligence',      denKey: 'termsIssued' },
          { title: 'Terms Signed to Funded / Invoiced', numKey: 'fundedInvoiced',      denKey: 'inDueDiligence' },
          { title: 'Signed to Funded / Invoiced',       numKey: 'fundedInvoiced',      denKey: 'finalCreditItems' },
          { title: 'Submission to Funded / Invoiced',   numKey: 'fundedInvoiced',      denKey: 'submittedToLenders' },
        ];
        return defs.map((d, i) => {
          const den = t[d.denKey];
          const numShort = SHORT_LABELS[d.numKey];
          const numLabel = STAGE_LABELS[d.numKey];
          const denLabel = STAGE_LABELS[d.denKey];
          const denShort = SHORT_LABELS[d.denKey];
          // Cohort tracking: of the deals that entered the DENOMINATOR stage
          // in the last 12 months, how many EVER progressed to the NUMERATOR
          // stage (any time — including after the TTM window).
          const reachedNumIds = m.lifetimeStageDealIds[d.numKey];
          const numDeals = den.deals.filter(dl => reachedNumIds.has(dl.deal_id));
          const num = {
            deals: numDeals,
            count: numDeals.length,
            dollarVolume: numDeals.reduce((s, dl) => s + (dl.value ?? 0), 0),
          };
          const value = pctText(num.count, den.count);
          const formula =
            `(Deals that entered ${denLabel} in the last 12 months and ever reached ${numLabel}) ÷ ` +
            `(Deals that entered ${denLabel} in the last 12 months) = ` +
            `${num.count} ÷ ${den.count} = ${value}`;
          return {
            id: `conversion-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
            title: d.title,
            icon: Sigma,
            value,
            isLoading: loading,
            deals: den.deals,
            color: `hsl(var(--chart-${(i % 5) + 1}))`,
            drilldownTitle: d.title,
            drilldownPeriodNote: formula,
            drilldownMetricType: 'none' as const,
            conversionBreakdown: {
              formula,
              numeratorLabel: `Entered ${denLabel} (TTM) and ever reached ${numShort}`,
              denominatorLabel: `Entered ${denLabel} (TTM)`,
              numeratorDeals: num.deals,
              denominatorDeals: den.deals,
              numeratorCount: num.count,
              denominatorCount: den.count,
              percentText: value,
            },
            signedAnchorLabel: denShort,
          };
        });
      })(),
    },
  ];

  // Split off a subset of conversion tiles into a separate "Other Metrics"
  // section that renders below Financial Performance. Keeps the primary
  // Pipeline Conversion grid focused on the headline funnel steps.
  const OTHER_METRICS_TITLES = new Set<string>([
    'Signed to Submission',
    'Signed to Terms Issued',
    'Signed to Terms Signed',
    'Submission to Terms Signed',
    'Submission to Funded / Invoiced',
  ]);
  const conversionIdx = sections.findIndex(s => s.id === 'pipeline-conversion');
  const otherMetricsCards = conversionIdx >= 0
    ? sections[conversionIdx].cards.filter(c => OTHER_METRICS_TITLES.has(c.title))
    : [];
  if (conversionIdx >= 0) {
    sections[conversionIdx] = {
      ...sections[conversionIdx],
      cards: sections[conversionIdx].cards.filter(c => !OTHER_METRICS_TITLES.has(c.title)),
    };
  }
  const otherMetricsSection: SectionDef = {
    id: 'other-metrics',
    title: 'Other Metrics',
    description: 'Supplementary trailing-12-month conversion rates',
    cards: otherMetricsCards,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Debt Advisory Metrics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stage-entry metrics from deal_stage_history (Funded / Invoiced + Closed Won) · {selectedQuarter.label} · Click any tile for detail
          </p>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'cards' | 'table')}>
          <TabsList className="bg-muted/40 border border-border/40">
            <TabsTrigger value="cards" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-1.5">
              <TableIcon className="h-3.5 w-3.5" /> Table
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === 'table' ? (
        <PipelineMatrixTable
          sections={sections}
          selectedQuarter={selectedQuarter}
          onCellClick={(card, bucket) => {
            const metricType = card.drilldownMetricType ?? 'dollars';
            setDrilldown({
              title: bucket
                ? `${card.drilldownTitle} — ${bucket.label}`
                : card.drilldownTitle,
              deals: bucket ? bucket.deals : card.deals,
              periodNote: card.drilldownPeriodNote,
              metricType,
              valueFormatter: card.drilldownValueFormatter
                ?? (metricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
              chartColor: card.drilldownChartColor ?? card.color,
              conversionBreakdown: bucket ? undefined : card.conversionBreakdown,
              conversionCardId: bucket ? undefined : (card.conversionBreakdown ? card.id : undefined),
            });
          }}
        />
      ) : (
        sections.map(section => (
        <div key={section.id} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                {section.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
            </div>
          </div>
          {(() => {
            const rows = [section.cards];
            // Sales KPI grid is the canonical tile-sizing template. Averages
            // reuses the exact same grid so each tile lines up with a Sales
            // column instead of stretching to fill a wider 4-col layout.
            const gridClass =
              section.id === 'sales' || section.id === 'averages' || section.id === 'pipeline-conversion'
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2'
                : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2';
            return (
              <div className="space-y-3">
                {rows.map((rowCards, idx) => (
                  <div key={idx} className={gridClass}>
                    {rowCards.map(card => (
                      <MetricKPICard
                        key={card.id}
                        config={card}
                        onClick={() => setDrilldown({
                          title: card.drilldownTitle,
                          deals: card.deals,
                          periodNote: card.drilldownPeriodNote,
                          metricType: card.drilldownMetricType ?? 'dollars',
                          valueFormatter: card.drilldownValueFormatter
                            ?? (card.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                          chartColor: card.drilldownChartColor ?? card.color,
                          conversionBreakdown: card.conversionBreakdown,
                          conversionCardId: card.conversionBreakdown ? card.id : undefined,
                        })}
                        onSecondaryClick={card.secondary ? () => {
                          const s = card.secondary!;
                          setDrilldown({
                            title: s.drilldownTitle,
                            deals: s.deals,
                            periodNote: s.drilldownPeriodNote,
                            metricType: s.drilldownMetricType ?? 'dollars',
                            valueFormatter: s.drilldownValueFormatter
                              ?? (s.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                            chartColor: s.drilldownChartColor ?? s.color ?? card.color,
                          });
                        } : undefined}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        ))
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Closed Trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Debt Advisory Metrics — stage_enter into Funded / Invoiced or Closed Won, zero-filled periods (rolling, anchored to today)
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
            subtitle={`Debt Advisory Metrics → Funded / Invoiced + Closed Won · ${trendMode === 'monthly' ? 'Past 6 months' : 'Past 4 quarters'}`}
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
            subtitle={`Debt Advisory Metrics → Funded / Invoiced + Closed Won · ${trendMode === 'monthly' ? 'Past 6 months' : 'Past 4 quarters'}`}
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

        <StageTransitTimeChart />
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Financial Performance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revenue, Gross Profit, Operating Profit, and Cashflow sourced from 5th Line Capital Advisors in QuickBooks.
          </p>
        </div>
        <PnlFourChartsSection
          realmId={DEBT_ADVISORY_REALM_ID}
          cashflowTitle="Debt Advisory Cashflow"
          halfWidthCashflow
        />
      </div>

      {otherMetricsSection.cards.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                {otherMetricsSection.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{otherMetricsSection.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {otherMetricsSection.cards.map(card => (
              <MetricKPICard
                key={card.id}
                config={card}
                onClick={() => setDrilldown({
                  title: card.drilldownTitle,
                  deals: card.deals,
                  periodNote: card.drilldownPeriodNote,
                  metricType: card.drilldownMetricType ?? 'dollars',
                  valueFormatter: card.drilldownValueFormatter
                    ?? (card.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                  chartColor: card.drilldownChartColor ?? card.color,
                  conversionBreakdown: card.conversionBreakdown,
                  conversionCardId: card.conversionBreakdown ? card.id : undefined,
                })}
              />
            ))}
          </div>
        </div>
      )}

      {(() => {
        // Re-derive the live breakdown from the currently-rendered conversion
        // card so the FCI-only toggle inside the modal updates counts and
        // deal lists instantly (drilldown state was captured at click time).
        const liveBreakdown = (() => {
          if (!drilldown?.conversionCardId) return drilldown?.conversionBreakdown;
          const conv = sections.find(s => s.id === 'pipeline-conversion');
          const card =
            conv?.cards.find(c => c.id === drilldown.conversionCardId)
            ?? otherMetricsSection.cards.find(c => c.id === drilldown.conversionCardId);
          return card?.conversionBreakdown ?? drilldown?.conversionBreakdown;
        })();
        return (
          <DrilldownModal
            open={!!drilldown}
            onClose={() => setDrilldown(null)}
            title={drilldown?.title ?? ''}
            deals={drilldown?.deals ?? []}
            periodNote={drilldown?.periodNote}
            selectedQuarter={selectedQuarter}
            metricType={drilldown?.metricType}
            valueFormatter={drilldown?.valueFormatter}
            chartColor={drilldown?.chartColor}
            conversionBreakdown={liveBreakdown}
            signedMode={undefined}
            onSignedModeChange={undefined}
            signedAnchorLabel={(() => {
              if (!drilldown?.conversionCardId) return undefined;
              const conv = sections.find(s => s.id === 'pipeline-conversion');
              return (
                conv?.cards.find(c => c.id === drilldown.conversionCardId)?.signedAnchorLabel
                ?? otherMetricsSection.cards.find(c => c.id === drilldown.conversionCardId)?.signedAnchorLabel
              );
            })()}
          />
        );
      })()}

      <div className="pt-2 text-[10px] text-muted-foreground/70 font-mono">
        data source: deal_stage_history · source: all · last refresh: {lastRefresh.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })}
      </div>
    </div>
  );
}
