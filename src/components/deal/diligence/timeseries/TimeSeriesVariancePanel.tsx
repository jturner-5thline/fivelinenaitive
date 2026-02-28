import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowRight, BarChart3, MessageSquare, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Cell, Legend
} from 'recharts';
import { DetectedStatement } from '../types';
import {
  buildVarianceTable, buildWaterfallBridge, buildDriverDecomposition,
  generateTrendNarratives, PeriodVariance, WaterfallItem, TrendNarrative
} from './varianceEngine';

interface TimeSeriesVariancePanelProps {
  statements: DetectedStatement[];
  className?: string;
}

function formatValue(v: number | null): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function VarianceTable({ variances }: { variances: PeriodVariance[] }) {
  if (variances.length === 0) return <EmptyState message="No variance data available" />;

  const periods = variances[0]?.periods || [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left py-2 px-3 font-semibold text-muted-foreground w-40">Metric</th>
            {periods.map((p, i) => (
              <th key={p} className="text-right py-2 px-2 font-semibold text-muted-foreground">{p}</th>
            ))}
            {periods.length > 1 && (
              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Δ %</th>
            )}
          </tr>
        </thead>
        <tbody>
          {variances.map(v => {
            const latestPct = v.changePcts[v.changePcts.length - 1];
            return (
              <tr key={v.metric} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                <td className="py-2 px-3 font-medium">{v.label}</td>
                {v.values.map((val, i) => (
                  <td key={i} className="text-right py-2 px-2 font-mono">{formatValue(val)}</td>
                ))}
                {periods.length > 1 && (
                  <td className="text-right py-2 px-2">
                    {latestPct != null && (
                      <span className={cn(
                        "font-mono font-semibold",
                        latestPct > 0 ? "text-emerald-500" : latestPct < 0 ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {formatPct(latestPct)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WaterfallChart({ items }: { items: WaterfallItem[] }) {
  if (items.length === 0) return <EmptyState message="Select two periods to build a bridge" />;

  const data = items.map(item => ({
    name: item.name,
    value: item.value,
    fill: item.type === 'total' ? 'hsl(var(--primary))' :
          item.type === 'increase' ? 'hsl(142, 76%, 56%)' : 'hsl(0, 84%, 60%)',
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
          <ReTooltip
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => formatValue(v)}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function NarrativeCards({ narratives }: { narratives: TrendNarrative[] }) {
  if (narratives.length === 0) return <EmptyState message="No trend data to narrate" />;

  const icons = {
    positive: <TrendingUp className="h-4 w-4 text-emerald-500" />,
    negative: <TrendingDown className="h-4 w-4 text-red-500" />,
    neutral: <Minus className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {narratives.map(n => (
        <div
          key={n.metric}
          className={cn(
            "rounded-xl border p-4",
            n.sentiment === 'positive' ? "border-emerald-500/20 bg-emerald-500/5" :
            n.sentiment === 'negative' ? "border-red-500/20 bg-red-500/5" :
            "border-border/30 bg-card"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {icons[n.sentiment]}
            <span className="text-sm font-semibold">{n.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{n.narrative}</p>
          <div className="flex flex-wrap gap-1.5">
            {n.highlights.map((h, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{h}</Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

export function TimeSeriesVariancePanel({ statements, className }: TimeSeriesVariancePanelProps) {
  const [activeTab, setActiveTab] = useState('variance');

  const variances = useMemo(() => buildVarianceTable(statements), [statements]);
  const periods = variances[0]?.periods || [];

  const [fromPeriod, setFromPeriod] = useState(periods.length >= 2 ? periods[periods.length - 2] : '');
  const [toPeriod, setToPeriod] = useState(periods.length >= 1 ? periods[periods.length - 1] : '');

  const waterfallItems = useMemo(() => {
    if (!fromPeriod || !toPeriod) return [];
    return buildWaterfallBridge(statements, fromPeriod, toPeriod);
  }, [statements, fromPeriod, toPeriod]);

  const driverDecomp = useMemo(() => {
    if (!fromPeriod || !toPeriod) return null;
    return buildDriverDecomposition(statements, 'ebitda', fromPeriod, toPeriod);
  }, [statements, fromPeriod, toPeriod]);

  const narratives = useMemo(() => generateTrendNarratives(variances), [variances]);

  if (statements.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border/30 p-6", className)}>
        <EmptyState message="Upload and extract financial data to see time-series analysis" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border/30", className)}>
      <div className="p-4 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Time-Series & Variance Analysis</h3>
        </div>
        {periods.length >= 2 && (
          <div className="flex items-center gap-2">
            <Select value={fromPeriod} onValueChange={setFromPeriod}>
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                {periods.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Select value={toPeriod} onValueChange={setToPeriod}>
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                {periods.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="variance" className="text-xs">Period-over-Period</TabsTrigger>
          <TabsTrigger value="waterfall" className="text-xs">Waterfall Bridge</TabsTrigger>
          <TabsTrigger value="drivers" className="text-xs">Driver Decomposition</TabsTrigger>
          <TabsTrigger value="narratives" className="text-xs gap-1">
            <MessageSquare className="h-3 w-3" /> Trend Narratives
          </TabsTrigger>
        </TabsList>

        <TabsContent value="variance" className="mt-4">
          <VarianceTable variances={variances} />
        </TabsContent>

        <TabsContent value="waterfall" className="mt-4">
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              EBITDA Bridge: {fromPeriod} → {toPeriod}
            </h4>
          </div>
          <WaterfallChart items={waterfallItems} />
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          {driverDecomp ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {driverDecomp.label} Decomposition
                </h4>
                <Badge variant="outline" className="text-[10px]">
                  {formatValue(driverDecomp.fromValue)} → {formatValue(driverDecomp.toValue)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    driverDecomp.totalChange >= 0 ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"
                  )}
                >
                  Δ {formatValue(driverDecomp.totalChange)}
                </Badge>
              </div>
              <div className="space-y-2">
                {driverDecomp.drivers.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs w-36 text-muted-foreground">{d.label}</span>
                    <div className="flex-1 h-6 bg-muted/20 rounded-full overflow-hidden relative">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          d.direction === 'positive' ? "bg-emerald-500/60" : "bg-red-500/60"
                        )}
                        style={{ width: `${Math.min(Math.abs(d.pctOfChange), 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold">
                        {formatValue(d.contribution)} ({d.pctOfChange >= 0 ? '+' : ''}{d.pctOfChange.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState message="Insufficient data for driver decomposition" />
          )}
        </TabsContent>

        <TabsContent value="narratives" className="mt-4">
          <NarrativeCards narratives={narratives} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
