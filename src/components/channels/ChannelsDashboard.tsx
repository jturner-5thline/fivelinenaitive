import { useState, useMemo, useCallback } from 'react';
import { useChannelPerformanceData, type AttributedDeal } from '@/hooks/useChannelPerformanceData';
import { ChannelDrilldownModal, type DrilldownContext } from './ChannelDrilldownModal';
import { ChannelSourceDetailPanel, type SourceTarget } from './ChannelSourceDetailPanel';
import { PartnersFunnelChart } from './PartnersFunnelChart';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, DollarSign, Layers, AlertCircle, X, RotateCcw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  liquidGlassCard,
  liquidGlassKPI,
  LIQUID_GLASS_SERIES,
  INSIGHTS_TOOLTIP_STYLE,
  INSIGHTS_AXIS_TICK,
  INSIGHTS_BAR_RADIUS,
} from '@/components/metrics/liquidGlass';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { buildBuckets } from '@/lib/insightsTimeRange';

const CHANNEL_OPTIONS = CHANNEL_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }));

const STAGE_LABELS: Record<string, string> = {
  added: 'Added',
  proposalIssued: 'Proposal Issued',
  finalCreditItems: 'Final Credit Items',
  fundedInvoiced: 'Funded / Invoiced',
};

// Series colors come from the shared Insights palette so charts here match
// the Insights page exactly.
const SERIES_COLORS = {
  added: LIQUID_GLASS_SERIES[0],
  proposalIssued: LIQUID_GLASS_SERIES[1],
  finalCreditItems: LIQUID_GLASS_SERIES[2],
  fundedInvoiced: LIQUID_GLASS_SERIES[3],
};

type ChartGroupBy = 'channel' | 'source';

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

// Stage helpers
const STAGE_MATCHERS: Record<string, (s: string) => boolean> = {
  proposalIssued: (s) => /proposal.issued/i.test(s),
  finalCreditItems: (s) => /final.credit/i.test(s),
  fundedInvoiced: (s) => /funded|invoiced/i.test(s) && !/not/i.test(s),
};
function classifyStage(stage: string): string {
  const lower = stage.toLowerCase();
  if (STAGE_MATCHERS.fundedInvoiced(lower)) return 'fundedInvoiced';
  if (STAGE_MATCHERS.finalCreditItems(lower)) return 'finalCreditItems';
  if (STAGE_MATCHERS.proposalIssued(lower)) return 'proposalIssued';
  return 'added';
}
const STAGE_ORDER = ['added', 'proposalIssued', 'finalCreditItems', 'fundedInvoiced'];
function dealReachedStage(deal: AttributedDeal, stageKey: string): boolean {
  const idx = STAGE_ORDER.indexOf(classifyStage(deal.stage));
  return idx >= STAGE_ORDER.indexOf(stageKey);
}

// Use shared Liquid Glass tokens (Insights design system)
const glassCard = liquidGlassCard;
const glassCardKPI = liquidGlassKPI;

// ── Tooltip — matches Insights tooltip styling ──
function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="text-xs space-y-1 p-3"
      style={INSIGHTS_TOOLTIP_STYLE as React.CSSProperties}
    >
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' && p.value < 1 ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">Click bar to see deals</p>
    </div>
  );
}

// ── Multi-select popover ──
function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-xs gap-1.5 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] ${selected.length > 0 ? 'border-primary/30 text-foreground' : 'text-muted-foreground'}`}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] rounded-full bg-primary/20 text-primary">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <ScrollArea className="max-h-48">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-xs"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
                className="h-3.5 w-3.5"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </ScrollArea>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1 h-6 text-[10px]" onClick={() => onChange([])}>
            Clear selection
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Main ──
export function ChannelsDashboard() {
  const dateCtx = useOptionalSalesBdDateRange();
  const range = dateCtx?.range;
  const [channelTypeFilters, setChannelTypeFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [chartGroupBy, setChartGroupBy] = useState<ChartGroupBy>('channel');
  const [drilldown, setDrilldown] = useState<DrilldownContext | null>(null);
  const [sourceTarget, setSourceTarget] = useState<SourceTarget | null>(null);

  const { channelSources, attributedDeals, performanceRows, kpis, isLoading } = useChannelPerformanceData(channelTypeFilters, sourceFilters);

  const hasActiveFilters = channelTypeFilters.length > 0 || sourceFilters.length > 0;
  const clearAll = () => { setChannelTypeFilters([]); setSourceFilters([]); };

  // Source options filtered by selected channels
  const sourceOptions = useMemo(() => {
    return channelSources
      .filter(s => channelTypeFilters.length === 0 || channelTypeFilters.includes(s.channelType))
      .map(s => ({ value: s.channelEntryId, label: s.name }));
  }, [channelSources, channelTypeFilters]);

  // ── Drilldown ──
  const openDrilldown = useCallback((title: string, deals: AttributedDeal[]) => {
    setDrilldown({ title, deals });
  }, []);
  const handleKPIClick = useCallback((stageKey: string) => {
    const deals = attributedDeals.filter(d => dealReachedStage(d, stageKey));
    openDrilldown(`${STAGE_LABELS[stageKey]} — ${deals.length} deal${deals.length !== 1 ? 's' : ''}`, deals);
  }, [attributedDeals, openDrilldown]);
  const handleFunnelClick = useCallback((stageKey: string) => handleKPIClick(stageKey), [handleKPIClick]);
  const handleBarClick = useCallback((groupName: string, stageKey: string) => {
    const stageKeyMap: Record<string, string> = {
      added: 'added', Added: 'added',
      proposalIssued: 'proposalIssued', 'Proposal Issued': 'proposalIssued',
      finalCredit: 'finalCreditItems', 'Final Credit': 'finalCreditItems',
      funded: 'fundedInvoiced', Funded: 'fundedInvoiced',
    };
    const canonicalStage = stageKeyMap[stageKey] || 'added';
    let deals: AttributedDeal[];
    if (chartGroupBy === 'channel') {
      const channelType = groupName === 'M&A / IB' ? 'M&A and Investment Bankers' : groupName;
      deals = attributedDeals.filter(d => d.channelType === channelType && dealReachedStage(d, canonicalStage));
    } else {
      deals = attributedDeals.filter(d => {
        const truncated = d.channelName.length > 18 ? d.channelName.slice(0, 16) + '…' : d.channelName;
        return truncated === groupName && dealReachedStage(d, canonicalStage);
      });
    }
    openDrilldown(`${STAGE_LABELS[canonicalStage]} — ${groupName} · ${deals.length} deal${deals.length !== 1 ? 's' : ''}`, deals);
  }, [attributedDeals, chartGroupBy, openDrilldown]);
  const handleTableRowClick = useCallback((channelEntryId: string, channelName: string) => {
    const deals = attributedDeals.filter(d => d.channelEntryId === channelEntryId);
    openDrilldown(`${channelName} — All Stages · ${deals.length} deal${deals.length !== 1 ? 's' : ''}`, deals);
  }, [attributedDeals, openDrilldown]);

  // ── Chart data ──
  const bucketPeriods = useMemo(() => {
    if (!range) return [];
    return buildBuckets(range.resolved.start, range.resolved.end, range.granularity);
  }, [range]);
  const bucketKeyForDate = useCallback((iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    if (range?.granularity === 'quarterly') {
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    }
    if (range?.granularity === 'yearly') {
      return String(d.getFullYear());
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [range?.granularity]);
  const channelGroupedDeals = useMemo(() => {
    return bucketPeriods.map((bucket) => {
      const base: Record<string, string | number> = { name: bucket.label };
      for (const row of performanceRows) {
        const bucketDeals = row.deals.filter((deal) => bucketKeyForDate(deal.created_at) === bucket.key);
        const label = row.channelType === 'M&A and Investment Bankers' ? 'M&A / IB' : row.channelType;
        base[label] = bucketDeals.length;
      }
      return base;
    }).filter((row) => Object.entries(row).some(([key, value]) => key !== 'name' && Number(value) > 0));
  }, [bucketPeriods, performanceRows, bucketKeyForDate]);
  const channelGroupedVolume = useMemo(() => {
    return bucketPeriods.map((bucket) => {
      const base: Record<string, string | number> = { name: bucket.label };
      for (const row of performanceRows) {
        const bucketValue = row.deals
          .filter((deal) => bucketKeyForDate(deal.created_at) === bucket.key)
          .reduce((sum, deal) => sum + (deal.value || 0), 0);
        const label = row.channelType === 'M&A and Investment Bankers' ? 'M&A / IB' : row.channelType;
        base[label] = bucketValue / 1e6;
      }
      return base;
    }).filter((row) => Object.entries(row).some(([key, value]) => key !== 'name' && Number(value) > 0));
  }, [bucketPeriods, performanceRows, bucketKeyForDate]);
  const sourceGroupedDeals = useMemo(() => performanceRows.filter(r => r.added.count > 0).slice(0, 10).map(r => ({
    name: r.channelName.length > 18 ? r.channelName.slice(0, 16) + '…' : r.channelName,
    Added: r.added.count, 'Proposal Issued': r.proposalIssued.count, 'Final Credit': r.finalCreditItems.count, Funded: r.fundedInvoiced.count,
  })), [performanceRows]);
  const sourceGroupedVolume = useMemo(() => performanceRows.filter(r => r.added.volume > 0).slice(0, 10).map(r => ({
    name: r.channelName.length > 18 ? r.channelName.slice(0, 16) + '…' : r.channelName,
    Added: r.added.volume / 1e6, 'Proposal Issued': r.proposalIssued.volume / 1e6, 'Final Credit': r.finalCreditItems.volume / 1e6, Funded: r.fundedInvoiced.volume / 1e6,
  })), [performanceRows]);

  const dealChartData = chartGroupBy === 'channel' ? channelGroupedDeals : sourceGroupedDeals;
  const volumeChartData = chartGroupBy === 'channel' ? channelGroupedVolume : sourceGroupedVolume;
  const barKeysChannel = [
    { key: 'added', label: 'Added' }, { key: 'proposalIssued', label: 'Proposal Issued' },
    { key: 'finalCredit', label: 'Final Credit' }, { key: 'funded', label: 'Funded' },
  ];
  const barKeysSource = [
    { key: 'Added', label: 'Added' }, { key: 'Proposal Issued', label: 'Proposal Issued' },
    { key: 'Final Credit', label: 'Final Credit' }, { key: 'Funded', label: 'Funded' },
  ];
  const barKeys = chartGroupBy === 'channel' ? barKeysChannel : barKeysSource;

  const funnelData = useMemo(() => [
    { name: 'Added', stageKey: 'added', count: kpis.added.count, volume: kpis.added.volume, fill: SERIES_COLORS.added },
    { name: 'Proposal Issued', stageKey: 'proposalIssued', count: kpis.proposalIssued.count, volume: kpis.proposalIssued.volume, fill: SERIES_COLORS.proposalIssued },
    { name: 'Final Credit Items', stageKey: 'finalCreditItems', count: kpis.finalCreditItems.count, volume: kpis.finalCreditItems.volume, fill: SERIES_COLORS.finalCreditItems },
    { name: 'Funded / Invoiced', stageKey: 'fundedInvoiced', count: kpis.fundedInvoiced.count, volume: kpis.fundedInvoiced.volume, fill: SERIES_COLORS.fundedInvoiced },
  ], [kpis]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const hasData = performanceRows.some(r => r.added.count > 0);
  const dealChartTitle = chartGroupBy === 'channel' ? 'Deals by Channel' : 'Deals by Company';
  const volumeChartTitle = chartGroupBy === 'channel' ? 'Dollar Volume by Channel ($M)' : 'Dollar Volume by Company ($M)';

  const kpiCards = [
    { stageKey: 'added', label: 'Deals Added', subtitle: 'Sourced deals entering the pipeline', count: kpis.added.count, volume: kpis.added.volume, icon: Layers, color: SERIES_COLORS.added },
    { stageKey: 'proposalIssued', label: 'Proposal Issued', subtitle: 'Deals reaching proposal stage', count: kpis.proposalIssued.count, volume: kpis.proposalIssued.volume, icon: BarChart3, color: SERIES_COLORS.proposalIssued },
    { stageKey: 'finalCreditItems', label: 'Final Credit Items', subtitle: 'Deals in final credit review', count: kpis.finalCreditItems.count, volume: kpis.finalCreditItems.volume, icon: TrendingUp, color: SERIES_COLORS.finalCreditItems },
    { stageKey: 'fundedInvoiced', label: 'Funded / Invoiced', subtitle: 'Closed and funded deals', count: kpis.fundedInvoiced.count, volume: kpis.fundedInvoiced.volume, icon: DollarSign, color: SERIES_COLORS.fundedInvoiced },
  ];

  const seriesColors = Object.values(SERIES_COLORS);

  return (
    <div className="space-y-6">
      {/* ── Filters: shared page range + multi-select + clear ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {range && (
            <div className="text-[11px] text-muted-foreground px-1">
              {range.granularity === 'monthly' ? 'Monthly' : range.granularity === 'quarterly' ? 'Quarterly' : 'Yearly'} · {range.resolved.label}
            </div>
          )}

          <div className="h-4 w-px bg-border" />

          {/* Multi-select: Channels */}
          <MultiSelectFilter
            label="Channels"
            options={CHANNEL_OPTIONS}
            selected={channelTypeFilters}
            onChange={setChannelTypeFilters}
          />

          {/* Multi-select: Companies */}
          <MultiSelectFilter
            label="Companies"
            options={sourceOptions}
            selected={sourceFilters}
            onChange={setSourceFilters}
          />

          {/* Clear All */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1"
              onClick={clearAll}
            >
              <RotateCcw className="h-3 w-3" />
              Clear all
            </Button>
          )}
        </div>

        {/* Active filter chips */}
        {(channelTypeFilters.length > 0 || sourceFilters.length > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {channelTypeFilters.map(ct => {
              const label = CHANNEL_OPTIONS.find(o => o.value === ct)?.label || ct;
              return (
                <Badge
                  key={ct}
                  variant="secondary"
                  className="text-[10px] gap-1 pl-2 pr-1 py-0.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer"
                  onClick={() => setChannelTypeFilters(prev => prev.filter(v => v !== ct))}
                >
                  {label}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
            {sourceFilters.map(sf => {
              const label = channelSources.find(s => s.channelEntryId === sf)?.name || sf;
              return (
                <Badge
                  key={sf}
                  variant="secondary"
                  className="text-[10px] gap-1 pl-2 pr-1 py-0.5 bg-accent/20 text-accent-foreground border-accent/20 hover:bg-accent/30 cursor-pointer"
                  onClick={() => setSourceFilters(prev => prev.filter(v => v !== sf))}
                >
                  {label}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map(kpi => (
          <div
            key={kpi.stageKey}
            className={`${glassCardKPI} p-4 space-y-2 cursor-pointer group`}
            onClick={() => handleKPIClick(kpi.stageKey)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleKPIClick(kpi.stageKey)}
          >
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg border"
                style={{
                  backgroundColor: kpi.color + '1f',
                  borderColor: kpi.color + '33',
                }}
              >
                <kpi.icon className="h-3.5 w-3.5" style={{ color: kpi.color }} />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{kpi.count}</span>
              <span className="text-sm text-muted-foreground pb-0.5">{formatCurrency(kpi.volume)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {kpi.subtitle} · Click to view
            </p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className={`${glassCard} p-12 text-center space-y-3`}>
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No attributed deals found for this period.</p>
          <p className="text-xs text-muted-foreground/60">
            Deals are attributed to companies when the deal's referral field matches a company or contact name.
          </p>
        </div>
      ) : (
        <>
          <PartnersFunnelChart />
          {/* ── Stage Funnel ── */}
          <div className={`${glassCard} p-4`}>
            <h3 className="text-base font-semibold tracking-tight text-foreground mb-4">Stage Progression — Sourced Deals</h3>
            <div className="grid grid-cols-4 gap-2">
              {funnelData.map((stage, i) => {
                const maxCount = Math.max(...funnelData.map(f => f.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div
                    key={stage.name}
                    className="space-y-2 cursor-pointer group"
                    onClick={() => handleFunnelClick(stage.stageKey)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleFunnelClick(stage.stageKey)}
                  >
                    <div className="text-center">
                      <p className="text-lg font-bold font-mono tabular-nums group-hover:text-primary transition-colors">{stage.count}</p>
                      <p className="text-[10px] text-muted-foreground">{formatCurrency(stage.volume)}</p>
                    </div>
                    <div className="h-20 flex items-end justify-center">
                      <div
                        className="w-full max-w-[60px] rounded-t-md transition-all duration-500 group-hover:opacity-80"
                        style={{ height: `${Math.max(pct, 8)}%`, backgroundColor: stage.fill }}
                      />
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground font-medium leading-tight group-hover:text-foreground transition-colors">{stage.name}</p>
                    {i < funnelData.length - 1 && funnelData[i].count > 0 && (
                      <p className="text-[9px] text-center text-muted-foreground/50">
                        {Math.round((funnelData[i + 1].count / funnelData[i].count) * 100)}% →
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Group-by toggle ── */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Group by:</span>
            <Tabs value={chartGroupBy} onValueChange={(v) => setChartGroupBy(v as ChartGroupBy)}>
              <TabsList className="h-7">
                <TabsTrigger value="channel" className="text-xs h-6 px-3">Channel</TabsTrigger>
                <TabsTrigger value="source" className="text-xs h-6 px-3">Company</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { data: dealChartData, title: dealChartTitle, formatter: undefined },
              { data: volumeChartData, title: volumeChartTitle, formatter: (v: number) => `$${v.toFixed(1)}M` },
            ].map(({ data, title, formatter }) => (
              <div key={title} className={`${glassCard} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
                  <div className="flex items-center gap-3">
                    {barKeys.map((bk, idx) => (
                      <span key={bk.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ background: seriesColors[idx] }} />
                        {bk.label}
                      </span>
                    ))}
                  </div>
                </div>
                {data.length > 0 ? (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: data.length > 4 ? 60 : 24 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="name"
                          type="category"
                          tick={INSIGHTS_AXIS_TICK}
                          className="text-muted-foreground"
                          interval={0}
                          angle={data.length > 4 ? -35 : 0}
                          textAnchor={data.length > 4 ? 'end' : 'middle'}
                          height={data.length > 4 ? 60 : 24}
                        />
                        <YAxis
                          type="number"
                          tick={INSIGHTS_AXIS_TICK}
                          tickFormatter={formatter}
                          width={formatter ? 55 : 35}
                          allowDecimals={!(!formatter)}
                        />
                        <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                        {barKeys.map((bk, idx) => (
                          <Bar
                            key={bk.key}
                            dataKey={bk.key}
                            name={bk.label}
                            fill={seriesColors[idx]}
                            radius={INSIGHTS_BAR_RADIUS}
                            cursor="pointer"
                            onClick={(d: any) => d?.payload?.name && handleBarClick(d.payload.name, bk.key)}
                            maxBarSize={48}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-12">No data</p>
                )}
              </div>
            ))}
          </div>

          {/* ── Performance Table ── */}
          <div className={`${glassCard} overflow-hidden`}>
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold tracking-tight text-foreground">Company Performance</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Click any row to view underlying deals</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 text-muted-foreground font-medium">Company</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Channel</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Added</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Proposal</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Final Credit</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Funded</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRows.filter(r => r.added.count > 0).map(row => (
                    <tr
                      key={row.channelEntryId}
                      className="border-b border-border hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => setSourceTarget({ kind: 'company', name: row.channelName, channelType: row.channelType })}
                    >
                      <td className="p-3 font-medium text-foreground">{row.channelName}</td>
                      <td className="p-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSourceTarget({ kind: 'channel', channelType: row.channelType }); }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                        >
                          {row.channelType === 'M&A and Investment Bankers' ? 'M&A / IB' : row.channelType}
                        </button>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.added.count}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.proposalIssued.count}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.finalCreditItems.count}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.fundedInvoiced.count}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-foreground">{formatCurrency(row.added.volume)}</td>
                    </tr>
                  ))}
                  {performanceRows.every(r => r.added.count === 0) && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">No attributed companies</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ChannelDrilldownModal context={drilldown} onClose={() => setDrilldown(null)} />
      <ChannelSourceDetailPanel
        target={sourceTarget}
        open={!!sourceTarget}
        onClose={() => setSourceTarget(null)}
      />
    </div>
  );
}
