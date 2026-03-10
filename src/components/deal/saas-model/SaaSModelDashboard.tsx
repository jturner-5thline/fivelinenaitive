import { useMemo } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, fmtRatio, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DollarSign, BarChart3, Target, Shield, Zap, Users, TrendingUp, Activity, Clock } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Line,
} from 'recharts';
import { EnhancedKPICard } from './EnhancedKPICard';

interface Props {
  model: SaaSModelData;
}

function trailingSparkline(data: number[], count = 12): number[] {
  if (!data || data.length === 0) return [];
  const start = Math.max(0, data.length - count);
  return data.slice(start).filter(v => v !== 0 || data.some(d => d !== 0));
}

function estimateCustomerCount(model: SaaSModelData): { current: number; sparkline: number[]; delta: number } {
  const acv = 120_000;
  const current = model.arrToday > 0 ? Math.round(model.arrToday / acv) : 0;
  const sparkline = model.totalRevenue.slice(-12).map(r => Math.round((r * 12) / acv));
  const prev = sparkline.length >= 2 ? sparkline[sparkline.length - 2] : current;
  const delta = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  return { current, sparkline, delta };
}

// ── Health Score ──────────────────────────────────────────
function computeHealthScore(model: SaaSModelData): { score: number; label: string; color: string } {
  let score = 50;
  // Gross margin contribution
  if (model.latestGrossMargin >= 70) score += 12;
  else if (model.latestGrossMargin >= 50) score += 6;
  else score -= 5;
  // Growth
  if (model.yoyRevGrowth >= 25) score += 12;
  else if (model.yoyRevGrowth >= 10) score += 6;
  else score -= 5;
  // NRR
  if (model.netRevenueRetention >= 110) score += 8;
  else if (model.netRevenueRetention >= 100) score += 4;
  else score -= 4;
  // Current ratio
  if (model.currentRatio >= 1.5) score += 8;
  else if (model.currentRatio >= 1.0) score += 3;
  else score -= 6;
  // EBITDA positive
  const last = model.months.length - 1;
  if (model.ebitda[last] > 0) score += 10;
  else score -= 8;

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Healthy' : score >= 40 ? 'Fair' : 'Weak';
  const color = score >= 80 ? '#2ED3B7' : score >= 60 ? '#4C6FFF' : score >= 40 ? '#FFB547' : '#F97373';
  return { score, label, color };
}

// ── Health Score Ring ────────────────────────────────────
function HealthRing({ score, label, color }: { score: number; label: string; color: string }) {
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
          { label: 'Margins', pct: Math.min(100, Math.max(0, (model.latestGrossMargin / 80) * 100)), color: '#2ED3B7' },
          { label: 'Growth', pct: Math.min(100, Math.max(0, (model.yoyRevGrowth / 40) * 100)), color: '#4C6FFF' },
          { label: 'Liquidity', pct: Math.min(100, Math.max(0, (model.currentRatio / 2.5) * 100)), color: '#FFB547' },
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

// We need access to model in HealthRing — pass it via a wrapper
let model: SaaSModelData;

// ── Ratio Card with visual bar ───────────────────────────
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

// ── Operational Metrics ──────────────────────────────────
function computeOperationalMetrics(m: SaaSModelData) {
  const last = m.months.length - 1;
  const monthlyBurn = m.ebitda[last] < 0 ? Math.abs(m.ebitda[last]) : 0;
  const cash = m.balanceSheet.cash[last];
  const runway = monthlyBurn > 0 ? cash / monthlyBurn : 999;

  // Rule of 40
  const ebitdaMargin = m.totalRevenue[last] > 0 ? (m.ebitda[last] / m.totalRevenue[last]) * 100 : 0;
  const ruleOf40 = m.yoyRevGrowth + ebitdaMargin;

  // Operating efficiency (OpEx as % of Revenue)
  const opexPct = m.totalRevenue[last] > 0 ? (m.totalOpEx[last] / m.totalRevenue[last]) * 100 : 0;

  // Magic number proxy (QoQ new ARR / S&M spend)
  const newArr = last >= 3 ? (m.revenue.recurring[last] - m.revenue.recurring[last - 3]) * 4 : 0;
  const smSpend = last >= 3 ? m.opex.salesMarketing.slice(last - 2, last + 1).reduce((s, v) => s + v, 0) : 1;
  const magicNumber = smSpend > 0 ? newArr / smSpend : 0;

  return { monthlyBurn, runway, ruleOf40, opexPct, magicNumber };
}

export function SaaSModelDashboard({ model: m }: Props) {
  model = m; // for HealthRing access

  const last = m.months.length - 1;
  const health = useMemo(() => computeHealthScore(m), [m]);
  const ops = useMemo(() => computeOperationalMetrics(m), [m]);
  const customers = useMemo(() => estimateCustomerCount(m), [m]);

  const revenueChartData = m.months.map((mo, i) => ({
    name: mo.label,
    recurring: m.revenue.recurring[i],
    total: m.totalRevenue[i],
  }));

  const ebitdaChartData = m.months.map((mo, i) => ({
    name: mo.label,
    ebitda: m.ebitda[i],
  }));

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

  return (
    <div className="space-y-4">
      {/* Row 1: Health Score + Primary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
        {/* Health Score */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Financial Health</h3>
            <HealthRing score={health.score} label={health.label} color={health.color} />
          </CardContent>
        </Card>

        {/* Primary KPIs */}
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Revenue Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCurrency(v, true)} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} labelStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="recurring" name="Recurring" stroke="#4C6FFF" fill="#4C6FFF" fillOpacity={0.15} strokeWidth={2} />
                  <Line type="monotone" dataKey="total" name="Total Revenue" stroke="#2ED3B7" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">EBITDA Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ebitdaChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCurrency(v, true)} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Bar dataKey="ebitda" name="EBITDA" radius={[2, 2, 0, 0]}>
                    {ebitdaChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.ebitda >= 0 ? '#4C6FFF' : '#F97373'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Annual Summary */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Annual Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card">Metric</th>
                  {annualData.map(a => (
                    <th key={a.year} className="text-right py-2 px-3 font-medium text-muted-foreground">{a.year}</th>
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
                    {annualData.map(a => (
                      <td key={a.year} className={cn(
                        "py-2 px-3 text-right font-mono tabular-nums",
                        isNegative(a.values[row.key]) && "text-destructive"
                      )}>
                        {row.fmt(a.values[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Financial Health Ratios */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Financial Health Ratios</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <RatioCard label="Current Ratio" value={m.currentRatio} formatted={fmtRatio(m.currentRatio)} benchmark={1.5} benchmarkLabel="Target: 1.5x" />
            <RatioCard label="AR/AP Ratio" value={m.arApRatio} formatted={fmtRatio(m.arApRatio)} benchmark={1.0} benchmarkLabel="Target: 1.0x" />
            <RatioCard label="Cash / Total Assets" value={m.cashTotalAssets * 100} formatted={fmtPct(m.cashTotalAssets * 100)} benchmark={15} benchmarkLabel="Target: 15%" />
            <RatioCard label="Debt / Total Liabilities" value={m.debtTotalLiabilities * 100} formatted={fmtPct(m.debtTotalLiabilities * 100)} benchmark={50} benchmarkLabel="Max: 50%" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
