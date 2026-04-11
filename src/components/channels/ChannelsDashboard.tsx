import { useState, useMemo } from 'react';
import { useChannelPerformanceData, type ChannelTimePeriod } from '@/hooks/useChannelPerformanceData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, DollarSign, Layers, AlertCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
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

const STAGE_COLORS: Record<string, string> = {
  added: 'hsl(var(--primary))',
  proposalIssued: '#8b5cf6',
  finalCreditItems: '#f59e0b',
  fundedInvoiced: '#10b981',
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function KPICard({ label, count, volume, icon: Icon, color }: {
  label: string; count: number; volume: number; icon: any; color: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md" style={{ backgroundColor: color + '20' }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-2xl font-bold font-mono tabular-nums">{count}</span>
        <span className="text-sm text-muted-foreground font-mono pb-0.5">{formatCurrency(volume)}</span>
      </div>
    </div>
  );
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
          <span className="font-mono font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ChannelsDashboard() {
  const [timePeriod, setTimePeriod] = useState<ChannelTimePeriod>('last-12m');
  const [channelTypeFilter, setChannelTypeFilter] = useState('all');
  const [channelEntryFilter, setChannelEntryFilter] = useState('all');

  const { channelSources, performanceRows, kpis, isLoading } = useChannelPerformanceData(
    timePeriod, channelTypeFilter, channelEntryFilter,
  );

  // Chart data: deals by channel (bar chart)
  const dealsByChannelData = useMemo(() => {
    return performanceRows
      .filter(r => r.added.count > 0)
      .slice(0, 10)
      .map(r => ({
        name: r.channelName.length > 18 ? r.channelName.slice(0, 16) + '…' : r.channelName,
        Added: r.added.count,
        'Proposal Issued': r.proposalIssued.count,
        'Final Credit': r.finalCreditItems.count,
        'Funded': r.fundedInvoiced.count,
      }));
  }, [performanceRows]);

  // Volume by channel (bar chart)
  const volumeByChannelData = useMemo(() => {
    return performanceRows
      .filter(r => r.added.volume > 0)
      .slice(0, 10)
      .map(r => ({
        name: r.channelName.length > 18 ? r.channelName.slice(0, 16) + '…' : r.channelName,
        'Added': r.added.volume / 1_000_000,
        'Proposal Issued': r.proposalIssued.volume / 1_000_000,
        'Final Credit': r.finalCreditItems.volume / 1_000_000,
        'Funded': r.fundedInvoiced.volume / 1_000_000,
      }));
  }, [performanceRows]);

  // Stage progression funnel
  const funnelData = useMemo(() => [
    { name: 'Added', count: kpis.added.count, volume: kpis.added.volume, fill: STAGE_COLORS.added },
    { name: 'Proposal Issued', count: kpis.proposalIssued.count, volume: kpis.proposalIssued.volume, fill: STAGE_COLORS.proposalIssued },
    { name: 'Final Credit Items', count: kpis.finalCreditItems.count, volume: kpis.finalCreditItems.volume, fill: STAGE_COLORS.finalCreditItems },
    { name: 'Funded / Invoiced', count: kpis.fundedInvoiced.count, volume: kpis.fundedInvoiced.volume, fill: STAGE_COLORS.fundedInvoiced },
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as ChannelTimePeriod)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_PRESETS.map(p => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channelTypeFilter} onValueChange={setChannelTypeFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channelEntryFilter} onValueChange={setChannelEntryFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Sources</SelectItem>
            {channelSources
              .filter(s => channelTypeFilter === 'all' || s.channelType === channelTypeFilter)
              .map(s => (
                <SelectItem key={s.channelEntryId} value={s.channelEntryId} className="text-xs">{s.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Added" count={kpis.added.count} volume={kpis.added.volume} icon={Layers} color={STAGE_COLORS.added} />
        <KPICard label="Proposal Issued" count={kpis.proposalIssued.count} volume={kpis.proposalIssued.volume} icon={BarChart3} color={STAGE_COLORS.proposalIssued} />
        <KPICard label="Final Credit Items" count={kpis.finalCreditItems.count} volume={kpis.finalCreditItems.volume} icon={TrendingUp} color={STAGE_COLORS.finalCreditItems} />
        <KPICard label="Funded / Invoiced" count={kpis.fundedInvoiced.count} volume={kpis.fundedInvoiced.volume} icon={DollarSign} color={STAGE_COLORS.fundedInvoiced} />
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-border/30 bg-card p-12 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No channel-attributed deals found for this period.</p>
          <p className="text-xs text-muted-foreground/60">
            Deals are attributed when their referral source matches a channel contact or company name.
          </p>
        </div>
      ) : (
        <>
          {/* Stage Funnel */}
          <div className="rounded-xl border border-border/30 bg-card p-4">
            <h3 className="text-sm font-medium text-foreground mb-4">Stage Progression</h3>
            <div className="grid grid-cols-4 gap-2">
              {funnelData.map((stage, i) => {
                const maxCount = Math.max(...funnelData.map(f => f.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={stage.name} className="space-y-2">
                    <div className="text-center">
                      <p className="text-lg font-bold font-mono tabular-nums">{stage.count}</p>
                      <p className="text-[10px] text-muted-foreground">{formatCurrency(stage.volume)}</p>
                    </div>
                    <div className="h-20 flex items-end justify-center">
                      <div
                        className="w-full max-w-[60px] rounded-t-md transition-all duration-500"
                        style={{ height: `${Math.max(pct, 8)}%`, backgroundColor: stage.fill }}
                      />
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground font-medium leading-tight">{stage.name}</p>
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

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Deal Count by Channel */}
            <div className="rounded-xl border border-border/30 bg-card p-4">
              <h3 className="text-sm font-medium text-foreground mb-4">Deals by Channel</h3>
              {dealsByChannelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dealsByChannelData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Added" fill={STAGE_COLORS.added} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="Proposal Issued" fill={STAGE_COLORS.proposalIssued} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="Final Credit" fill={STAGE_COLORS.finalCreditItems} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="Funded" fill={STAGE_COLORS.fundedInvoiced} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">No data</p>
              )}
            </div>

            {/* Dollar Volume by Channel */}
            <div className="rounded-xl border border-border/30 bg-card p-4">
              <h3 className="text-sm font-medium text-foreground mb-4">Volume by Channel ($M)</h3>
              {volumeByChannelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={volumeByChannelData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v.toFixed(1)}M`} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Added" fill={STAGE_COLORS.added} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="Proposal Issued" fill={STAGE_COLORS.proposalIssued} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="Final Credit" fill={STAGE_COLORS.finalCreditItems} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="Funded" fill={STAGE_COLORS.fundedInvoiced} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">No data</p>
              )}
            </div>
          </div>

          {/* Performance Table */}
          <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
            <div className="p-4 border-b border-border/30">
              <h3 className="text-sm font-medium text-foreground">Channel Performance Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left p-3 text-muted-foreground font-medium">Source</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Type</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Added</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Proposal</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Final Credit</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Funded</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRows.filter(r => r.added.count > 0).map(row => (
                    <tr key={row.channelEntryId} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
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
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">No attributed deals</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
