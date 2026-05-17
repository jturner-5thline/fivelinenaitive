import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RotateCcw, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import {
  usePipelineConversionForecast,
  FORECAST_STAGE_LABELS,
  type ForecastStage,
} from '@/hooks/usePipelineConversionForecast';
import { cn } from '@/lib/utils';

type MetricKey = 'revenue' | 'pipeline' | 'deals' | 'funded';
type ViewKey = 'plan_vs_forecast' | 'forecast_only';
type TimeKey = 'monthly' | 'cumulative';

const METRICS: { key: MetricKey; label: string; forecastField: string; planField?: string; unit: 'currency' | 'count' }[] = [
  { key: 'revenue',  label: 'Revenue',         forecastField: 'projectedRevenue',  planField: 'planRevenue',         unit: 'currency' },
  { key: 'pipeline', label: 'Pipeline Dollars',forecastField: 'pipelineDollars',   planField: 'planPipelineDollars', unit: 'currency' },
  { key: 'deals',    label: 'Deals Closed',    forecastField: 'dealsClosed',       planField: 'planDealsClosed',     unit: 'count' },
  { key: 'funded',   label: 'Funded Dollars',  forecastField: 'fundedDollars',                                       unit: 'currency' },
];

function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(abs / 1_000_000 >= 10 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}K`;
  return `$${Math.round(abs)}`;
}
function fmtCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(value >= 10 ? 0 : 1);
}
function fmtPct(v: number) { return `${Math.round(v * 100)}%`; }

export function PipelineConversionForecastCard() {
  const { transitions, setTransition, reset, months, transitionStats, avgDollarsPerDeal } = usePipelineConversionForecast();

  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [view, setView] = useState<ViewKey>('plan_vs_forecast');
  const [time, setTime] = useState<TimeKey>('monthly');
  const STAGE_PILLS: { key: string; label: string }[] = [
    { key: 'Deals on Board', label: 'Deals on Board' },
    { key: 'Proposals Issued', label: 'Proposals Issued' },
    { key: 'Clients Signed', label: 'Clients Signed' },
    { key: 'Receiving Terms', label: 'Receiving Terms' },
    { key: 'Terms Signed', label: 'Terms Signed' },
    { key: 'Deals Closed', label: 'Deals Closed' },
  ];
  const allOn = STAGE_PILLS.reduce((acc, s) => ({ ...acc, [s.key]: true }), {} as Record<string, boolean>);
  const [visibleStages, setVisibleStages] = useState<Record<string, boolean>>(allOn);

  const toggleStage = (key: string) => {
    setVisibleStages(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!Object.values(next).some(Boolean)) return allOn;
      return next;
    });
  };
  const showAllStages = () => setVisibleStages(allOn);
  const allVisible = STAGE_PILLS.every(s => visibleStages[s.key]);

  const metricDef = METRICS.find(m => m.key === metric)!;

  const chartData = useMemo(() => {
    let cumForecast = 0;
    let cumPlan = 0;
    return months.map(m => {
      const fv = (m as any)[metricDef.forecastField] as number;
      const pv = metricDef.planField ? ((m as any)[metricDef.planField] as number | undefined) : undefined;
      if (time === 'cumulative') {
        cumForecast += fv ?? 0;
        if (pv != null) cumPlan += pv;
        return { month: m.monthLabel, Forecast: cumForecast, Plan: pv != null ? cumPlan : undefined };
      }
      return { month: m.monthLabel, Forecast: fv, Plan: pv };
    });
  }, [months, metric, time, metricDef]);

  const stageChartData = useMemo(() => {
    return months.map(m => ({
      month: m.monthLabel,
      'Deals on Board': m.dealsOnBoard,
      'Proposals Issued': m.proposalsIssued,
      'Clients Signed': m.clientsSigned,
      'Receiving Terms': m.clientsReceivingTerms,
      'Terms Signed': m.termsSigned,
      'Deals Closed': m.dealsClosed,
    }));
  }, [months]);

  const totals = useMemo(() => {
    const sum = (k: keyof (typeof months)[number]) => months.reduce((s, m) => s + (Number(m[k]) || 0), 0);
    return {
      revenue: sum('projectedRevenue'),
      pipeline: sum('pipelineDollars'),
      funded: sum('fundedDollars'),
      deals: sum('dealsClosed'),
      planRevenue: sum('planRevenue' as any),
    };
  }, [months]);

  const fmt = (v: number) => (metricDef.unit === 'currency' ? fmtMoney(v) : fmtCount(v));

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Pipeline Conversion Forecast
          </CardTitle>
          <CardDescription className="text-xs">
            Driver-based 9-month forecast. These are planning assumptions used to forecast future pipeline
            movement; they do not change historical actuals.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={reset}>
          <RotateCcw className="h-3 w-3" />
          Reset to Baseline
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Assumptions table */}
        <div className="rounded-lg border border-border/40 bg-card/60 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/30 hover:bg-transparent">
                <TableHead className="h-9 px-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">From</TableHead>
                <TableHead className="h-9 px-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">To</TableHead>
                <TableHead className="h-9 px-3 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Conv %</TableHead>
                <TableHead className="h-9 px-3 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Timeline (mo)</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Avg Exit Vol / mo</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Avg Entry Vol / mo</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">$ Impact / mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transitions.map(t => {
                const s = transitionStats[t.id];
                return (
                  <TableRow key={t.id} className="border-b border-border/10 hover:bg-muted/10">
                    <TableCell className="py-2 px-3 text-xs">{FORECAST_STAGE_LABELS[t.fromStage]}</TableCell>
                    <TableCell className="py-2 px-3 text-xs">{FORECAST_STAGE_LABELS[t.toStage]}</TableCell>
                    <TableCell className="py-2 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(t.conversionRate * 100)}
                          onChange={e => setTransition(t.id, { conversionRate: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })}
                          className="h-7 w-16 text-xs text-center"
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-center">
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={t.timelineMonths}
                        onChange={e => setTransition(t.id, { timelineMonths: Math.max(0.25, Number(e.target.value)) })}
                        className="h-7 w-16 text-xs text-center mx-auto"
                      />
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right tabular-nums text-xs">{fmtCount(s?.avgExitVolume ?? 0)}</TableCell>
                    <TableCell className="py-2 px-3 text-right tabular-nums text-xs">{fmtCount(s?.avgEntryVolume ?? 0)}</TableCell>
                    <TableCell className="py-2 px-3 text-right tabular-nums text-xs text-muted-foreground">{fmtMoney(s?.avgExitDollars ?? 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={metric}
            onChange={v => setMetric(v as MetricKey)}
            options={METRICS.map(m => ({ value: m.key, label: m.label }))}
          />
          <ToggleGroup
            value={view}
            onChange={v => setView(v as ViewKey)}
            options={[
              { value: 'plan_vs_forecast', label: 'Plan vs Forecast' },
              { value: 'forecast_only', label: 'Forecast Only' },
            ]}
          />
          <ToggleGroup
            value={time}
            onChange={v => setTime(v as TimeKey)}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'cumulative', label: 'Cumulative' },
            ]}
          />
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="9mo Projected Revenue" value={fmtMoney(totals.revenue)} sub={`Plan: ${fmtMoney(totals.planRevenue)}`} />
          <SummaryTile label="9mo Pipeline $" value={fmtMoney(totals.pipeline)} />
          <SummaryTile label="9mo Funded $" value={fmtMoney(totals.funded)} />
          <SummaryTile label="9mo Deals Closed" value={fmtCount(totals.deals)} />
        </div>

        {/* Main chart */}
        <div className="rounded-lg border border-border/40 bg-card/40 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-xs font-semibold text-foreground">{metricDef.label} — {time === 'cumulative' ? 'Cumulative' : 'Monthly'}</h4>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Next 9 months</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.3)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => metricDef.unit === 'currency' ? fmtMoney(v) : String(v)} />
                <RTooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                  formatter={(v: number) => metricDef.unit === 'currency' ? fmtMoney(v) : fmtCount(v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {view === 'plan_vs_forecast' && metricDef.planField && (
                  <Bar dataKey="Plan" fill="hsl(var(--muted-foreground) / 0.4)" radius={[3, 3, 0, 0]} />
                )}
                <Bar dataKey="Forecast" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stage funnel trend */}
        <div className="rounded-lg border border-border/40 bg-card/40 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-xs font-semibold text-foreground">Stage-by-Stage Forecast</h4>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Population by stage</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <button
              type="button"
              onClick={showAllStages}
              className={cn(
                'px-2.5 py-1 text-[11px] rounded-full border transition-colors',
                allVisible
                  ? 'border-primary/40 bg-primary/10 text-foreground font-semibold'
                  : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              All Stages
            </button>
            {STAGE_PILLS.map(s => {
              const active = visibleStages[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleStage(s.key)}
                  className={cn(
                    'px-2.5 py-1 text-[11px] rounded-full border transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/10 text-foreground font-medium'
                      : 'border-border/60 bg-muted/10 text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stageChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.3)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <RTooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                  formatter={(v: number) => fmtCount(v)}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {(['Deals on Board', 'Proposals Issued', 'Clients Signed', 'Receiving Terms', 'Terms Signed', 'Deals Closed'] as const)
                  .map((name, idx) => visibleStages[name] ? (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={['hsl(var(--primary))', 'hsl(var(--chart-2, 200 80% 60%))', 'hsl(var(--chart-3, 280 70% 65%))', 'hsl(var(--chart-4, 35 90% 60%))', 'hsl(var(--chart-5, 150 65% 55%))', 'hsl(var(--destructive))'][idx % 6]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ) : null)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          Avg deal $ per stage inferred from current rep actuals
          {Object.entries(avgDollarsPerDeal)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ` · ${FORECAST_STAGE_LABELS[k as ForecastStage]}: ${fmtMoney(v)}`)}
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

function ToggleGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 py-1 text-[11px] rounded-md transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}