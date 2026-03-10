import { useMemo, useState } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, fmtRatio, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DollarSign, BarChart3, Target, Shield, Zap, Users, TrendingUp, Activity, Clock, Calendar } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Line, ComposedChart,
} from 'recharts';
import { EnhancedKPICard } from './EnhancedKPICard';
import { AIInsightsPanel } from './AIInsightsPanel';
import { AnnotationBadge } from './AnnotationThread';
import type { Annotation } from '@/hooks/useModelAnnotations';

interface AnnotationHook {
  annotations: Annotation[];
  getAnnotationsForTarget: (targetType: string, targetRef: string) => Annotation[];
  addAnnotation: (targetType: Annotation['target_type'], targetRef: string, content: string, mentions?: string[]) => Promise<any>;
  resolveAnnotation: (id: string) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
}

interface Props {
  model: SaaSModelData;
  annotations?: AnnotationHook;
}

type PeriodFilter = 'all' | 'ttm' | '6m' | '3m';

function trailingSparkline(data: number[], count = 12): number[] {
  if (!data || data.length === 0) return [];
  const start = Math.max(0, data.length - count);
  return data.slice(start).filter(v => v !== 0 || data.some(d => d !== 0));
}

function filterByPeriod<T>(data: T[], period: PeriodFilter): T[] {
  if (period === 'all') return data;
  const count = period === 'ttm' ? 12 : period === '6m' ? 6 : 3;
  return data.slice(Math.max(0, data.length - count));
}

function estimateCustomerCount(model: SaaSModelData): { current: number; sparkline: number[]; delta: number } {
  const acv = 120_000;
  const current = model.arrToday > 0 ? Math.round(model.arrToday / acv) : 0;
  const sparkline = model.totalRevenue.slice(-12).map(r => Math.round((r * 12) / acv));
  const prev = sparkline.length >= 2 ? sparkline[sparkline.length - 2] : current;
  const delta = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  return { current, sparkline, delta };
}

function computeHealthScore(model: SaaSModelData): { score: number; label: string; color: string } {
  let score = 50;
  if (model.latestGrossMargin >= 70) score += 12;
  else if (model.latestGrossMargin >= 50) score += 6;
  else score -= 5;
  if (model.yoyRevGrowth >= 25) score += 12;
  else if (model.yoyRevGrowth >= 10) score += 6;
  else score -= 5;
  if (model.netRevenueRetention >= 110) score += 8;
  else if (model.netRevenueRetention >= 100) score += 4;
  else score -= 4;
  if (model.currentRatio >= 1.5) score += 8;
  else if (model.currentRatio >= 1.0) score += 3;
  else score -= 6;
  const last = model.months.length - 1;
  if (model.ebitda[last] > 0) score += 10;
  else score -= 8;

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Healthy' : score >= 40 ? 'Fair' : 'Weak';
  const color = score >= 80 ? '#2ED3B7' : score >= 60 ? '#4C6FFF' : score >= 40 ? '#FFB547' : '#F97373';
  return { score, label, color };
}

function HealthRing({ score, label, color, model: m }: { score: number; label: string; color: string; model: SaaSModelData }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <svg width={96} height={96} viewBox="0 0 96 96">
          <circle cx={48} cy={48} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
          <circle cx={48} cy={48} r={radius} fill="none" stroke={color} strokeWidth={6}
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashoffset}
            transform="rotate(-90 48 48)" style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 4px ${color}40)` }} />
          <text x={48} y={44} textAnchor="middle" className="fill-foreground" style={{ fontSize: 20, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{score}</text>
          <text x={48} y={58} textAnchor="middle" style={{ fontSize: 9, fill: color, fontWeight: 600 }}>{label}</text>
        </svg>
      </div>
      <div className="space-y-1.5">
        {[
          { label: 'Margins', pct: Math.min(100, Math.max(0, (m.latestGrossMargin / 80) * 100)), color: '#2ED3B7' },
          { label: 'Growth', pct: Math.min(100, Math.max(0, (m.yoyRevGrowth / 40) * 100)), color: '#4C6FFF' },
          { label: 'Liquidity', pct: Math.min(100, Math.max(0, (m.currentRatio / 2.5) * 100)), color: '#FFB547' },
        ].map(bar => (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-14">{bar.label}</span>
            <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bar.pct}%`, backgroundColor: bar.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatioCard({ label, value, formatted, benchmark, benchmarkLabel }: {
  label: string; value: number; formatted: string; benchmark: number; benchmarkLabel: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / (benchmark * 2)) * 100));
  const benchPct = Math.min(100, (benchmark / (benchmark * 2)) * 100);
  const isGood = value >= benchmark;

  return (
    <div className="p-3 rounded-md border border-border/20 bg-muted/10 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[9px] text-muted-foreground/60">{benchmarkLabel}</span>
      </div>
      <div className="text-lg font-bold font-mono tabular-nums">{formatted}</div>
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: isGood ? '#2ED3B7' : '#FFB547' }} />
        <div className="absolute top-0 h-full w-px" style={{ left: `${benchPct}%`, backgroundColor: 'rgba(255,255,255,0.3)' }} />
      </div>
    </div>
  );
}

function computeOperationalMetrics(m: SaaSModelData) {
  const last = m.months.length - 1;
  const monthlyBurn = m.ebitda[last] < 0 ? Math.abs(m.ebitda[last]) : 0;
  const cash = m.balanceSheet.cash[last];
  const runway = monthlyBurn > 0 ? cash / monthlyBurn : 999;

  const ebitdaMargin = m.totalRevenue[last] > 0 ? (m.ebitda[last] / m.totalRevenue[last]) * 100 : 0;
  const ruleOf40 = m.yoyRevGrowth + ebitdaMargin;

  const opexPct = m.totalRevenue[last] > 0 ? (m.totalOpEx[last] / m.totalRevenue[last]) * 100 : 0;

  const newArr = last >= 3 ? (m.revenue.recurring[last] - m.revenue.recurring[last - 3]) * 4 : 0;
  const smSpend = last >= 3 ? m.opex.salesMarketing.slice(last - 2, last + 1).reduce((s, v) => s + v, 0) : 1;
  const magicNumber = smSpend > 0 ? newArr / smSpend : 0;

  return { monthlyBurn, runway, ruleOf40, opexPct, magicNumber };
}

// ── Period Selector ────────────────────────────────────
function PeriodSelector({ value, onChange }: { value: PeriodFilter; onChange: (v: PeriodFilter) => void }) {
  const options: { value: PeriodFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'ttm', label: 'TTM' },
    { value: '6m', label: '6M' },
    { value: '3m', label: '3M' },
  ];

  return (
    <div className="flex gap-0.5 bg-muted/30 rounded-sm p-0.5">
      {options.map(opt => (
        <Button
          key={opt.value}
          variant={value === opt.value ? 'default' : 'ghost'}
          size="sm"
          className="h-5 text-[10px] px-2 rounded-sm"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function SaaSModelDashboard({ model: m, annotations: ann }: Props) {
  const [chartPeriod, setChartPeriod] = useState<PeriodFilter>('all');

  const last = m.months.length - 1;
  const health = useMemo(() => computeHealthScore(m), [m]);
  const ops = useMemo(() => computeOperationalMetrics(m), [m]);
  const customers = useMemo(() => estimateCustomerCount(m), [m]);

  const revenueChartData = useMemo(() => {
    const all = m.months.map((mo, i) => ({
      name: mo.label,
      recurring: m.revenue.recurring[i],
      nonRecurring: m.revenue.nonRecurring[i],
      total: m.totalRevenue[i],
    }));
    return filterByPeriod(all, chartPeriod);
  }, [m, chartPeriod]);

  const ebitdaChartData = useMemo(() => {
    const all = m.months.map((mo, i) => ({
      name: mo.label,
      ebitda: m.ebitda[i],
      operatingIncome: m.operatingIncome[i],
    }));
    return filterByPeriod(all, chartPeriod);
  }, [m, chartPeriod]);

  const annualData = annualRollup(m, [
    { key: 'recurring', source: m.revenue.recurring, type: 'sum' },
    { key: 'totalRevenue', source: m.totalRevenue, type: 'sum' },
    { key: 'grossMargin', source: m.grossMarginPct, type: 'avg' },
    { key: 'ebitda', source: m.ebitda, type: 'sum' },
  ]);

  const revSparkline = trailingSparkline(m.totalRevenue);
  const recurringSparkline = trailingSparkline(m.revenue.recurring);
  const marginSparkline = trailingSparkline(m.grossMarginPct);
  const ebitdaSparkline = trailingSparkline(m.ebitda);

  // Period label for charts
  const periodLabel = chartPeriod === 'all' ? '' : chartPeriod === 'ttm' ? ' (TTM)' : chartPeriod === '6m' ? ' (6M)' : ' (3M)';

  return (
    <div className="space-y-4">
      {/* Row 1: Health Score + Primary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Financial Health</h3>
            <HealthRing score={health.score} label={health.label} color={health.color} model={m} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <EnhancedKPICard
            label="ARR Today"
            value={m.arrToday}
            formattedValue={fmtCurrency(m.arrToday, true)}
            delta={m.yoyRevGrowth || undefined}
            deltaLabel="YoY"
            sparklineData={recurringSparkline}
            icon={DollarSign}
          />
          <EnhancedKPICard
            label="MRR (3mo Avg)"
            value={m.mrrT3M}
            formattedValue={fmtCurrency(m.mrrT3M, true)}
            sparklineData={recurringSparkline.slice(-6)}
            icon={BarChart3}
          />
          <EnhancedKPICard
            label="Gross Margin"
            value={m.latestGrossMargin}
            formattedValue={fmtPct(m.latestGrossMargin)}
            delta={marginSparkline.length >= 2 ? ((marginSparkline[marginSparkline.length - 1] - marginSparkline[marginSparkline.length - 2]) / Math.max(1, marginSparkline[marginSparkline.length - 2])) * 100 : undefined}
            deltaLabel="MoM"
            sparklineData={marginSparkline}
            icon={Target}
          />
          <EnhancedKPICard
            label="YoY Rev Growth"
            value={m.yoyRevGrowth}
            formattedValue={fmtPct(m.yoyRevGrowth)}
            sparklineData={revSparkline}
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Row 2: Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <EnhancedKPICard
          label="Net Rev Retention"
          value={m.netRevenueRetention}
          formattedValue={fmtPct(m.netRevenueRetention)}
          sparklineData={[95, 98, 100, 102, 105, m.netRevenueRetention || 100]}
          icon={Shield}
        />
        <EnhancedKPICard
          label="Borrowing Capacity"
          value={m.borrowingCapacity}
          formattedValue={fmtCurrency(m.borrowingCapacity, true)}
          sparklineData={ebitdaSparkline}
          icon={Zap}
        />
        <EnhancedKPICard
          label="Facility Rec."
          value={m.facilityRecommendation}
          formattedValue={fmtCurrency(m.facilityRecommendation, true)}
          icon={DollarSign}
        />
        <EnhancedKPICard
          label="Total Customers"
          value={customers.current}
          formattedValue={customers.current.toLocaleString('en-US')}
          delta={customers.delta || undefined}
          deltaLabel="MoM"
          sparklineData={customers.sparkline}
          icon={Users}
        />
      </div>

      {/* Row 3: Operational Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Rule of 40', value: `${ops.ruleOf40.toFixed(0)}%`, good: ops.ruleOf40 >= 40, icon: Activity },
          { label: 'OpEx / Revenue', value: `${ops.opexPct.toFixed(1)}%`, good: ops.opexPct < 80, icon: BarChart3 },
          { label: 'Magic Number', value: ops.magicNumber.toFixed(2), good: ops.magicNumber >= 0.75, icon: Zap },
          { label: 'Monthly Burn', value: ops.monthlyBurn > 0 ? fmtCurrency(ops.monthlyBurn, true) : 'Profitable', good: ops.monthlyBurn === 0, icon: DollarSign },
          { label: 'Cash Runway', value: ops.runway >= 999 ? '∞' : `${Math.round(ops.runway)} mo`, good: ops.runway >= 18, icon: Clock },
        ].map(item => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-border/30">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: item.good ? 'rgba(46,211,183,0.12)' : 'rgba(255,181,71,0.12)' }}>
                  <Icon className="h-4 w-4" style={{ color: item.good ? '#2ED3B7' : '#FFB547' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{item.label}</p>
                  <p className="text-sm font-bold font-mono tabular-nums">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts with period selector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/30 relative">
          {ann && (
            <AnnotationBadge
              targetType="chart" targetRef="revenue" targetLabel="Revenue Chart"
              annotations={ann.getAnnotationsForTarget('chart', 'revenue')}
              onAdd={ann.addAnnotation} onResolve={ann.resolveAnnotation} onDelete={ann.deleteAnnotation}
            />
          )}
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Revenue Trend{periodLabel}</h3>
              <PeriodSelector value={chartPeriod} onChange={setChartPeriod} />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCurrency(v, true)} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtCurrency(v), name]}
                    labelStyle={{ fontSize: 11 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="nonRecurring" name="Non-Recurring" fill="#FFB547" fillOpacity={0.6} stackId="rev" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="recurring" name="Recurring" fill="#4C6FFF" fillOpacity={0.7} stackId="rev" radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#2ED3B7" dot={false} strokeWidth={2} strokeDasharray="5 5" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30 relative">
          {ann && (
            <AnnotationBadge
              targetType="chart" targetRef="ebitda" targetLabel="EBITDA Chart"
              annotations={ann.getAnnotationsForTarget('chart', 'ebitda')}
              onAdd={ann.addAnnotation} onResolve={ann.resolveAnnotation} onDelete={ann.deleteAnnotation}
            />
          )}
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">EBITDA & Operating Income{periodLabel}</h3>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {m.ebitda[last] >= 0 ? 'Profitable' : 'Pre-profit'}
              </Badge>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ebitdaChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCurrency(v, true)} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtCurrency(v), name]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Bar dataKey="ebitda" name="EBITDA" radius={[2, 2, 0, 0]}>
                    {ebitdaChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.ebitda >= 0 ? '#4C6FFF' : '#F97373'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="operatingIncome" name="Op. Income" stroke="#2ED3B7" dot={false} strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Annual Summary */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Annual Summary</h3>
            <span className="text-[10px] text-muted-foreground">{annualData.length} years</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card">Metric</th>
                  {annualData.map((a, i) => (
                    <th key={a.year} className="text-right py-2 px-3 font-medium text-muted-foreground">
                      {a.year}
                      {i === annualData.length - 1 && (
                        <Badge variant="outline" className="ml-1 text-[8px] h-3.5 px-1">Latest</Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Recurring Revenue', key: 'recurring', fmt: fmtCurrency },
                  { label: 'Total Revenue', key: 'totalRevenue', fmt: fmtCurrency },
                  { label: 'Gross Margin %', key: 'grossMargin', fmt: fmtPct },
                  { label: 'EBITDA', key: 'ebitda', fmt: fmtCurrency },
                ].map(row => (
                  <tr key={row.key} className="border-b border-border/10 hover:bg-muted/20">
                    <td className="py-2 px-3 font-medium sticky left-0 bg-card">{row.label}</td>
                    {annualData.map((a, ai) => {
                      const val = a.values[row.key];
                      const prevVal = ai > 0 ? annualData[ai - 1].values[row.key] : null;
                      const yoyPct = prevVal && prevVal !== 0 && row.key !== 'grossMargin'
                        ? ((val - prevVal) / Math.abs(prevVal)) * 100
                        : null;

                      return (
                        <td key={a.year} className={cn(
                          "py-2 px-3 text-right font-mono tabular-nums",
                          isNegative(val) && "text-destructive"
                        )}>
                          <div className="flex flex-col items-end">
                            <span>{row.fmt(val)}</span>
                            {yoyPct !== null && ai > 0 && (
                              <span className={cn(
                                "text-[8px]",
                                yoyPct > 0 ? "text-emerald-500" : "text-destructive"
                              )}>
                                {yoyPct > 0 ? '+' : ''}{yoyPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Financial Health Ratios & AI Insights side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Financial Health Ratios</h3>
            <div className="grid grid-cols-2 gap-3">
              <RatioCard label="Current Ratio" value={m.currentRatio} formatted={fmtRatio(m.currentRatio)} benchmark={1.5} benchmarkLabel="Target: 1.5x" />
              <RatioCard label="AR/AP Ratio" value={m.arApRatio} formatted={fmtRatio(m.arApRatio)} benchmark={1.0} benchmarkLabel="Target: 1.0x" />
              <RatioCard label="Cash / Total Assets" value={m.cashTotalAssets * 100} formatted={fmtPct(m.cashTotalAssets * 100)} benchmark={15} benchmarkLabel="Target: 15%" />
              <RatioCard label="Debt / Total Liabilities" value={m.debtTotalLiabilities * 100} formatted={fmtPct(m.debtTotalLiabilities * 100)} benchmark={50} benchmarkLabel="Max: 50%" />
            </div>
          </CardContent>
        </Card>

        <AIInsightsPanel model={m} />
      </div>
    </div>
  );
}
