import { useState, useMemo, useCallback } from 'react';
import { useChannelPerformanceData, type ChannelTimePeriod, type AttributedDeal } from '@/hooks/useChannelPerformanceData';
import { ChannelDrilldownModal, type DrilldownContext } from './ChannelDrilldownModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, DollarSign, Layers, AlertCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';

const TIME_PRESETS: { value: ChannelTimePeriod; label: string }[] = [
  { value: 'last-30d', label: 'Last 30 Days' },
  { value: 'qtd', label: 'QTD' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'last-6m', label: 'Last 6 Months' },
  { value: 'last-12m', label: 'Last 12 Months' },
];

const CHANNEL_TYPES = [
  { value: 'all', label: 'All Channels' },
  { value: 'Banks', label: 'Banks' },
  { value: 'M&A and Investment Bankers', label: 'M&A / IB' },
  { value: 'Service Providers', label: 'Service Providers' },
  { value: 'Investors', label: 'Investors' },
];

const STAGE_KEYS = ['added', 'proposalIssued', 'finalCreditItems', 'fundedInvoiced'] as const;
const STAGE_LABELS: Record<string, string> = {
  added: 'Added',
  proposalIssued: 'Proposal Issued',
  finalCreditItems: 'Final Credit Items',
  fundedInvoiced: 'Funded / Invoiced',
};
const STAGE_COLORS: Record<string, string> = {
  added: 'hsl(var(--primary))',
  proposalIssued: '#8b5cf6',
  finalCreditItems: '#f59e0b',
  fundedInvoiced: '#10b981',
};

type ChartGroupBy = 'channel' | 'source';

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

// Stage matching (duplicated from hook for filtering deals by stage in drilldown)
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
  const classification = classifyStage(deal.stage);
  const classIdx = STAGE_ORDER.indexOf(classification);
  const targetIdx = STAGE_ORDER.indexOf(stageKey);
  return classIdx >= targetIdx;
}

function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-mono font-medium">{typeof p.value === 'number' && p.value < 1 ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
      <p className="text-[9px] text-muted-foreground/50 pt-1 border-t border-border/30">Click bar to see deals</p>
    </div>
  );
}

export function ChannelsDashboard() {
  const [timePeriod, setTimePeriod] = useState<ChannelTimePeriod>('last-12m');
  const [channelTypeFilter, setChannelTypeFilter] = useState('all');
  const [referralSourceFilter, setReferralSourceFilter] = useState('all');
  const [chartGroupBy, setChartGroupBy] = useState<ChartGroupBy>('channel');
  const [drilldown, setDrilldown] = useState<DrilldownContext | null>(null);

  const { channelSources, attributedDeals, performanceRows, kpis, isLoading } = useChannelPerformanceData(
    timePeriod, channelTypeFilter, referralSourceFilter,
  );

  // --- Drilldown helpers ---
  const openDrilldown = useCallback((title: string, deals: AttributedDeal[]) => {
    setDrilldown({ title, deals });
  }, []);

  // KPI click: filter deals that reached a given stage
  const handleKPIClick = useCallback((stageKey: string) => {
    const deals = attributedDeals.filter(d => dealReachedStage(d, stageKey));
    openDrilldown(`${STAGE_LABELS[stageKey]} — ${deals.length} deal${deals.length !== 1 ? 's' : ''}`, deals);
  }, [attributedDeals, openDrilldown]);

  // Funnel step click
  const handleFunnelClick = useCallback((stageKey: string) => {
    handleKPIClick(stageKey);
  }, [handleKPIClick]);

  // Chart bar click — grouped by channel or source, for a specific stage
  const handleBarClick = useCallback((groupName: string, stageKey: string) => {
    // Map stage data keys back to canonical keys
    const stageKeyMap: Record<string, string> = {
      added: 'added', Added: 'added',
      proposalIssued: 'proposalIssued', 'Proposal Issued': 'proposalIssued',
      finalCredit: 'finalCreditItems', 'Final Credit': 'finalCreditItems',
      funded: 'fundedInvoiced', Funded: 'fundedInvoiced',
    };
    const canonicalStage = stageKeyMap[stageKey] || 'added';

    let deals: AttributedDeal[];
    if (chartGroupBy === 'channel') {
      // groupName is the channel type label — resolve back
      const channelType = groupName === 'M&A / IB' ? 'M&A and Investment Bankers' : groupName;
      deals = attributedDeals.filter(d => d.channelType === channelType && dealReachedStage(d, canonicalStage));
    } else {
      // groupName is truncated source name — match prefix
      deals = attributedDeals.filter(d => {
        const truncated = d.channelName.length > 18 ? d.channelName.slice(0, 16) + '…' : d.channelName;
        return truncated === groupName && dealReachedStage(d, canonicalStage);
      });
    }
    const label = `${STAGE_LABELS[canonicalStage]} — ${groupName}`;
    openDrilldown(`${label} · ${deals.length} deal${deals.length !== 1 ? 's' : ''}`, deals);
  }, [attributedDeals, chartGroupBy, openDrilldown]);

  // Table row click
  const handleTableRowClick = useCallback((channelEntryId: string, channelName: string) => {
    const deals = attributedDeals.filter(d => d.channelEntryId === channelEntryId);
    openDrilldown(`${channelName} — All Stages · ${deals.length} deal${deals.length !== 1 ? 's' : ''}`, deals);
  }, [attributedDeals, openDrilldown]);

  // --- Chart data ---
  const channelGroupedDeals = useMemo(() => {
    const map = new Map<string, { name: string; added: number; proposalIssued: number; finalCredit: number; funded: number }>();
    for (const row of performanceRows) {
      const key = row.channelType;
      const label = key === 'M&A and Investment Bankers' ? 'M&A / IB' : key;
      const existing = map.get(key) || { name: label, added: 0, proposalIssued: 0, finalCredit: 0, funded: 0 };
      existing.added += row.added.count;
      existing.proposalIssued += row.proposalIssued.count;
      existing.finalCredit += row.finalCreditItems.count;
      existing.funded += row.fundedInvoiced.count;
      map.set(key, existing);
    }
    return Array.from(map.values()).filter(r => r.added > 0).sort((a, b) => b.funded - a.funded);
  }, [performanceRows]);

  const channelGroupedVolume = useMemo(() => {
    const map = new Map<string, { name: string; added: number; proposalIssued: number; finalCredit: number; funded: number }>();
    for (const row of performanceRows) {
      const key = row.channelType;
      const label = key === 'M&A and Investment Bankers' ? 'M&A / IB' : key;
      const existing = map.get(key) || { name: label, added: 0, proposalIssued: 0, finalCredit: 0, funded: 0 };
      existing.added += row.added.volume / 1_000_000;
      existing.proposalIssued += row.proposalIssued.volume / 1_000_000;
      existing.finalCredit += row.finalCreditItems.volume / 1_000_000;
      existing.funded += row.fundedInvoiced.volume / 1_000_000;
      map.set(key, existing);
    }
    return Array.from(map.values()).filter(r => r.added > 0).sort((a, b) => b.funded - a.funded);
  }, [performanceRows]);

  const sourceGroupedDeals = useMemo(() => {
    return performanceRows
      .filter(r => r.added.count > 0)
      .slice(0, 10)
      .map(r => ({
        name: r.channelName.length > 18 ? r.channelName.slice(0, 16) + '…' : r.channelName,
        Added: r.added.count,
        'Proposal Issued': r.proposalIssued.count,
        'Final Credit': r.finalCreditItems.count,
        Funded: r.fundedInvoiced.count,
      }));
  }, [performanceRows]);

  const sourceGroupedVolume = useMemo(() => {
    return performanceRows
      .filter(r => r.added.volume > 0)
      .slice(0, 10)
      .map(r => ({
        name: r.channelName.length > 18 ? r.channelName.slice(0, 16) + '…' : r.channelName,
        Added: r.added.volume / 1_000_000,
        'Proposal Issued': r.proposalIssued.volume / 1_000_000,
        'Final Credit': r.finalCreditItems.volume / 1_000_000,
        Funded: r.fundedInvoiced.volume / 1_000_000,
      }));
  }, [performanceRows]);

  const dealChartData = chartGroupBy === 'channel' ? channelGroupedDeals : sourceGroupedDeals;
  const volumeChartData = chartGroupBy === 'channel' ? channelGroupedVolume : sourceGroupedVolume;

  const barKeysChannel = [
    { key: 'added', label: 'Added' },
    { key: 'proposalIssued', label: 'Proposal Issued' },
    { key: 'finalCredit', label: 'Final Credit' },
    { key: 'funded', label: 'Funded' },
  ];
  const barKeysSource = [
    { key: 'Added', label: 'Added' },
    { key: 'Proposal Issued', label: 'Proposal Issued' },
    { key: 'Final Credit', label: 'Final Credit' },
    { key: 'Funded', label: 'Funded' },
  ];
  const barKeys = chartGroupBy === 'channel' ? barKeysChannel : barKeysSource;

  const funnelData = useMemo(() => [
    { name: 'Added', stageKey: 'added', count: kpis.added.count, volume: kpis.added.volume, fill: STAGE_COLORS.added },
    { name: 'Proposal Issued', stageKey: 'proposalIssued', count: kpis.proposalIssued.count, volume: kpis.proposalIssued.volume, fill: STAGE_COLORS.proposalIssued },
    { name: 'Final Credit Items', stageKey: 'finalCreditItems', count: kpis.finalCreditItems.count, volume: kpis.finalCreditItems.volume, fill: STAGE_COLORS.finalCreditItems },
    { name: 'Funded / Invoiced', stageKey: 'fundedInvoiced', count: kpis.fundedInvoiced.count, volume: kpis.fundedInvoiced.volume, fill: STAGE_COLORS.fundedInvoiced },
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
  const dealChartTitle = chartGroupBy === 'channel' ? 'Deals by Channel' : 'Deals by Referral Source';
  const volumeChartTitle = chartGroupBy === 'channel' ? 'Dollar Volume by Channel ($M)' : 'Dollar Volume by Referral Source ($M)';

  const kpiCards = [
    { stageKey: 'added', label: 'Deals Added', subtitle: 'Sourced deals entering the pipeline', count: kpis.added.count, volume: kpis.added.volume, icon: Layers, color: STAGE_COLORS.added },
    { stageKey: 'proposalIssued', label: 'Proposal Issued', subtitle: 'Deals reaching proposal stage', count: kpis.proposalIssued.count, volume: kpis.proposalIssued.volume, icon: BarChart3, color: STAGE_COLORS.proposalIssued },
    { stageKey: 'finalCreditItems', label: 'Final Credit Items', subtitle: 'Deals in final credit review', count: kpis.finalCreditItems.count, volume: kpis.finalCreditItems.volume, icon: TrendingUp, color: STAGE_COLORS.finalCreditItems },
    { stageKey: 'fundedInvoiced', label: 'Funded / Invoiced', subtitle: 'Closed and funded deals', count: kpis.fundedInvoiced.count, volume: kpis.fundedInvoiced.volume, icon: DollarSign, color: STAGE_COLORS.fundedInvoiced },
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as ChannelTimePeriod)}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIME_PRESETS.map(p => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelTypeFilter} onValueChange={setChannelTypeFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHANNEL_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={referralSourceFilter} onValueChange={setReferralSourceFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="All Referral Sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Referral Sources</SelectItem>
            {channelSources
              .filter(s => channelTypeFilter === 'all' || s.channelType === channelTypeFilter)
              .map(s => (
                <SelectItem key={s.channelEntryId} value={s.channelEntryId} className="text-xs">{s.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards — clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map(kpi => (
          <div
            key={kpi.stageKey}
            className="rounded-xl border border-border/30 bg-card p-4 space-y-2 cursor-pointer hover:border-border/60 hover:bg-accent/10 transition-colors group"
            onClick={() => handleKPIClick(kpi.stageKey)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleKPIClick(kpi.stageKey)}
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md" style={{ backgroundColor: kpi.color + '20' }}>
                <kpi.icon className="h-3.5 w-3.5" style={{ color: kpi.color }} />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-bold font-mono tabular-nums">{kpi.count}</span>
              <span className="text-sm text-muted-foreground font-mono pb-0.5">{formatCurrency(kpi.volume)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors">
              {kpi.subtitle} · Click to view deals
            </p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-border/30 bg-card p-12 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No attributed deals found for this period.</p>
          <p className="text-xs text-muted-foreground/60">
            Deals are attributed to referral sources when the deal's referral field matches a source's company or contact name.
          </p>
        </div>
      ) : (
        <>
          {/* Stage Funnel — clickable steps */}
          <div className="rounded-xl border border-border/30 bg-card p-4">
            <h3 className="text-sm font-medium text-foreground mb-4">Stage Progression — Sourced Deals</h3>
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

          {/* Group-by toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Group by:</span>
            <Tabs value={chartGroupBy} onValueChange={(v) => setChartGroupBy(v as ChartGroupBy)}>
              <TabsList className="h-7">
                <TabsTrigger value="channel" className="text-xs h-6 px-3">Channel</TabsTrigger>
                <TabsTrigger value="source" className="text-xs h-6 px-3">Referral Source</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Charts — clickable bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border/30 bg-card p-4">
              <h3 className="text-sm font-medium text-foreground mb-4">{dealChartTitle}</h3>
              {dealChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dealChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {barKeys.map((bk, idx) => (
                      <Bar
                        key={bk.key}
                        dataKey={bk.key}
                        name={bk.label}
                        fill={Object.values(STAGE_COLORS)[idx]}
                        radius={[0, 2, 2, 0]}
                        cursor="pointer"
                        onClick={(data: any) => {
                          if (data?.name || data?.payload?.name) {
                            handleBarClick(data.payload?.name || data.name, bk.key);
                          }
                        }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">No data</p>
              )}
            </div>

            <div className="rounded-xl border border-border/30 bg-card p-4">
              <h3 className="text-sm font-medium text-foreground mb-4">{volumeChartTitle}</h3>
              {volumeChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={volumeChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v.toFixed(1)}M`} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {barKeys.map((bk, idx) => (
                      <Bar
                        key={bk.key}
                        dataKey={bk.key}
                        name={bk.label}
                        fill={Object.values(STAGE_COLORS)[idx]}
                        radius={[0, 2, 2, 0]}
                        cursor="pointer"
                        onClick={(data: any) => {
                          if (data?.name || data?.payload?.name) {
                            handleBarClick(data.payload?.name || data.name, bk.key);
                          }
                        }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">No data</p>
              )}
            </div>
          </div>

          {/* Performance Table — clickable rows */}
          <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
            <div className="p-4 border-b border-border/30">
              <h3 className="text-sm font-medium text-foreground">Referral Source Performance</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Click any row to view underlying deals</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left p-3 text-muted-foreground font-medium">Referral Source</th>
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
                      className="border-b border-border/10 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => handleTableRowClick(row.channelEntryId, row.channelName)}
                    >
                      <td className="p-3 font-medium text-foreground">{row.channelName}</td>
                      <td className="p-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {row.channelType === 'M&A and Investment Bankers' ? 'M&A / IB' : row.channelType}
                        </span>
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
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">No attributed referral sources</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Universal Drilldown Modal */}
      <ChannelDrilldownModal context={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  );
}
