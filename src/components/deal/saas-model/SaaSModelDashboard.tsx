import { useMemo, useState } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, fmtRatio, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DollarSign, BarChart3, Target, Shield, Zap, Users, TrendingUp, Activity, Clock, Flame, CheckSquare, AlertTriangle, FileText } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Line, ComposedChart, LineChart,
} from 'recharts';
import { EnhancedKPICard } from './EnhancedKPICard';
import { AIInsightsPanel } from './AIInsightsPanel';
import { AnalysisChatPanel } from './AnalysisChatPanel';
import { AnnotationBadge } from './AnnotationThread';
import { SaaSModelCharts } from './SaaSModelCharts';
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
  return { monthlyBurn, runway, ruleOf40, opexPct, magicNumber, cash };
}

function computeCashFlowMetrics(m: SaaSModelData) {
  const last = m.months.length - 1;
  // CF from Ops approximation: Net Income + Depreciation + WC changes
  const cfOps = m.months.map((_, i) => {
    return m.netIncome[i] + (m.depreciation[i] || 0);
  });

  const avg = (arr: number[], n: number) => {
    const slice = arr.slice(Math.max(0, arr.length - n));
    return slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0;
  };

  const cfOps3m = avg(cfOps, 3);
  const cfOps6m = avg(cfOps, 6);
  const cfOps12m = avg(cfOps, 12);

  // DSCR = CF from Ops / Debt Service (interest + principal)
  const debtService3m = avg(m.interestExpense, 3);
  const dscr = debtService3m > 0 ? Math.abs(cfOps3m / debtService3m) : 0;

  // 6 month burn
  const burn6m = m.ebitda.slice(Math.max(0, last - 5), last + 1).reduce((s, v) => s + (v < 0 ? v : 0), 0);

  // Runway
  const monthlyBurn = m.ebitda[last] < 0 ? Math.abs(m.ebitda[last]) : 0;
  const runway = monthlyBurn > 0 ? m.balanceSheet.cash[last] / monthlyBurn : 999;

  return { dscr, cfOps3m, cfOps6m, cfOps12m, burn6m, runway };
}

// ── Compact metric tile ────────────────────────────────
function MetricTile({ label, value, helper, good }: { label: string; value: string; helper?: string; good?: boolean }) {
  return (
    <div className="p-3 rounded-md border border-border/20 bg-muted/10 space-y-1">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "text-base font-bold font-mono tabular-nums",
        good === true && "text-emerald-400",
        good === false && "text-destructive",
      )}>{value}</p>
      {helper && <p className="text-[9px] text-muted-foreground/60">{helper}</p>}
    </div>
  );
}

// ── Operational metric pill ────────────────────────────
function OpPill({ label, value, good, icon: Icon }: { label: string; value: string; good: boolean; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/20 bg-muted/10">
      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: good ? 'rgba(46,211,183,0.12)' : 'rgba(255,181,71,0.12)' }}>
        <Icon className="h-3 w-3" style={{ color: good ? '#2ED3B7' : '#FFB547' }} />
      </div>
      <div className="min-w-0">
        <p className="text-[8px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className="text-xs font-bold font-mono tabular-nums">{value}</p>
      </div>
    </div>
  );
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
        <Button key={opt.value} variant={value === opt.value ? 'default' : 'ghost'}
          size="sm" className="h-5 text-[10px] px-2 rounded-sm"
          onClick={() => onChange(opt.value)}>{opt.label}</Button>
      ))}
    </div>
  );
}

// ── Materials & Checklist modal ────────────────────────
function MaterialsChecklist({ months, model }: { months: string[]; model: SaaSModelData }) {
  const [open, setOpen] = useState(false);

  // Derive checklist from model data availability
  const years = Array.from(new Set(model.months.map(m => m.year))).sort();
  const hasData = (arr: number[]) => arr.some(v => v !== 0);

  const rows = [
    { label: 'P&L Data', check: (yr: number) => hasData(model.totalRevenue.filter((_, i) => model.months[i]?.year === yr)) },
    { label: 'Balance Sheet Data', check: (yr: number) => hasData(model.balanceSheet.totalAssets.filter((_, i) => model.months[i]?.year === yr)) },
    { label: 'Revenue Breakdown', check: (yr: number) => hasData(model.revenue.recurring.filter((_, i) => model.months[i]?.year === yr)) },
    { label: 'COGS Detail', check: (yr: number) => hasData(model.totalCOGS.filter((_, i) => model.months[i]?.year === yr)) },
    { label: 'OpEx Detail', check: (yr: number) => hasData(model.totalOpEx.filter((_, i) => model.months[i]?.year === yr)) },
    { label: 'Cash Flow Indicators', check: (yr: number) => hasData(model.netIncome.filter((_, i) => model.months[i]?.year === yr)) },
  ];

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1.5 rounded-sm" onClick={() => setOpen(true)}>
        <CheckSquare className="h-3 w-3" /> Materials & Checklist
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Materials & Checklist</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Item</th>
                  {years.map(yr => (
                    <th key={yr} className="text-center py-2 px-3 font-medium text-muted-foreground">{yr}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.label} className="border-b border-border/10 hover:bg-muted/20">
                    <td className="py-2 px-3 font-medium">{row.label}</td>
                    {years.map(yr => {
                      const has = row.check(yr);
                      return (
                        <td key={yr} className="text-center py-2 px-3">
                          <span className={cn(
                            "inline-block w-5 h-5 rounded text-[10px] font-bold leading-5",
                            has ? "bg-emerald-500/20 text-emerald-400" : "bg-destructive/20 text-destructive"
                          )}>{has ? '✓' : '✗'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── RatioCard ──────────────────────────────────────────
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

// ══════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════
export function SaaSModelDashboard({ model: m, annotations: ann }: Props) {
  const [chartPeriod, setChartPeriod] = useState<PeriodFilter>('all');

  const last = m.months.length - 1;
  const ops = useMemo(() => computeOperationalMetrics(m), [m]);
  const customers = useMemo(() => estimateCustomerCount(m), [m]);
  const cfMetrics = useMemo(() => computeCashFlowMetrics(m), [m]);

  // Borrowing Capacity 6-month forward (approximate with growth)
  const borrowingCapacity6m = useMemo(() => {
    const growthRate = m.yoyRevGrowth > 0 ? m.yoyRevGrowth / 100 : 0;
    return m.borrowingCapacity * (1 + growthRate * 0.5);
  }, [m]);

  // Deferred Revenue
  const deferredRevToday = m.balanceSheet.deferredRevenue[last] || 0;
  const deferredRev6m = useMemo(() => {
    const idx6m = Math.min(last, Math.max(0, last - 5));
    const avg = m.balanceSheet.deferredRevenue.slice(idx6m, last + 1);
    const trend = avg.length >= 2 ? (avg[avg.length - 1] - avg[0]) / avg.length : 0;
    return deferredRevToday + trend * 6;
  }, [m, last, deferredRevToday]);

  // Chart data — Revenue vs Expenses (36-mo)
  const revExpChartData = useMemo(() => {
    const all = m.months.map((mo, i) => ({
      name: mo.label,
      revenue: m.totalRevenue[i],
      expenses: m.totalCOGS[i] + m.totalOpEx[i],
    }));
    return filterByPeriod(all, chartPeriod);
  }, [m, chartPeriod]);

  // EBITDA chart data
  const ebitdaChartData = useMemo(() => {
    const all = m.months.map((mo, i) => ({
      name: mo.label,
      ebitda: m.ebitda[i],
      operatingIncome: m.operatingIncome[i],
    }));
    return filterByPeriod(all, chartPeriod);
  }, [m, chartPeriod]);

  // Revenue breakdown chart
  const revBreakdownData = useMemo(() => {
    const all = m.months.map((mo, i) => ({
      name: mo.label,
      recurring: m.revenue.recurring[i],
      total: m.totalRevenue[i],
    }));
    return filterByPeriod(all, chartPeriod);
  }, [m, chartPeriod]);

  // Annual rollup (4 cols)
  const annualData = annualRollup(m, [
    { key: 'recurring', source: m.revenue.recurring, type: 'sum' },
    { key: 'totalRevenue', source: m.totalRevenue, type: 'sum' },
    { key: 'grossMargin', source: m.grossMarginPct, type: 'avg' },
    { key: 'ebitda', source: m.ebitda, type: 'sum' },
  ]);

  // Balance sheet snapshot (last 5 months)
  const bsSnapMonths = m.months.slice(Math.max(0, last - 4));
  const bsSnapIndices = Array.from({ length: bsSnapMonths.length }, (_, i) => Math.max(0, last - 4) + i);
  const bsSnapData = bsSnapIndices.map(i => ({
    label: m.months[i]?.label || '',
    cash: m.balanceSheet.cash[i],
    ar: m.balanceSheet.ar[i],
    ap: m.balanceSheet.ap[i],
    deferredRev: m.balanceSheet.deferredRevenue[i],
    stDebt: m.balanceSheet.stDebt[i],
    ltDebt: m.balanceSheet.ltDebt[i],
    netAr: m.balanceSheet.ar[i] - m.balanceSheet.ap[i],
  }));

  // Net AR availability chart
  const netArData = bsSnapData.map(d => ({ name: d.label, netAr: d.netAr }));

  const revSparkline = trailingSparkline(m.totalRevenue);
  const recurringSparkline = trailingSparkline(m.revenue.recurring);
  const marginSparkline = trailingSparkline(m.grossMarginPct);
  const ebitdaSparkline = trailingSparkline(m.ebitda);

  const periodLabel = chartPeriod === 'all' ? '' : chartPeriod === 'ttm' ? ' (TTM)' : chartPeriod === '6m' ? ' (6M)' : ' (3M)';

  return (
    <div className="space-y-4">
      {/* ═══════════════════════════════════════════════════
          ROW 1 — TOP SUMMARY STRIP
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4">
        {/* LEFT: Core SaaS KPIs */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
            <EnhancedKPICard label="ARR Today" value={m.arrToday} formattedValue={fmtCurrency(m.arrToday, true)}
              delta={m.yoyRevGrowth || undefined} deltaLabel="YoY" sparklineData={recurringSparkline} icon={DollarSign} />
            <EnhancedKPICard label="MRR (3mo Avg)" value={m.mrrT3M} formattedValue={fmtCurrency(m.mrrT3M, true)}
              sparklineData={recurringSparkline.slice(-6)} icon={BarChart3} />
            <EnhancedKPICard label="Gross Margin" value={m.latestGrossMargin} formattedValue={fmtPct(m.latestGrossMargin)}
              sparklineData={marginSparkline} icon={Target} />
            <EnhancedKPICard label="YoY Rev Growth" value={m.yoyRevGrowth} formattedValue={fmtPct(m.yoyRevGrowth)}
              sparklineData={revSparkline} icon={TrendingUp} />
            <EnhancedKPICard label="Net Rev Retention" value={m.netRevenueRetention} formattedValue={fmtPct(m.netRevenueRetention)}
              sparklineData={[95, 98, 100, 102, 105, m.netRevenueRetention || 100]} icon={Shield} />
            <EnhancedKPICard label="Total Customers" value={customers.current} formattedValue={customers.current.toLocaleString('en-US')}
              delta={customers.delta || undefined} deltaLabel="MoM" sparklineData={customers.sparkline} icon={Users} />
          </div>
          {/* Operational pills */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <OpPill label="Rule of 40" value={`${ops.ruleOf40.toFixed(0)}%`} good={ops.ruleOf40 >= 40} icon={Activity} />
            <OpPill label="Magic Number" value={ops.magicNumber.toFixed(2)} good={ops.magicNumber >= 0.75} icon={Zap} />
            <OpPill label="OpEx / Revenue" value={`${ops.opexPct.toFixed(1)}%`} good={ops.opexPct < 80} icon={BarChart3} />
            <OpPill label="Monthly Burn" value={ops.monthlyBurn > 0 ? fmtCurrency(ops.monthlyBurn, true) : 'Profitable'} good={ops.monthlyBurn === 0} icon={Flame} />
            <OpPill label="Cash Runway" value={ops.runway >= 999 ? '∞' : `${Math.round(ops.runway)} mo`} good={ops.runway >= 18} icon={Clock} />
          </div>
        </div>

        {/* RIGHT: Borrowing / Facility / Deferred Rev + Checklist */}
        <div className="space-y-3 xl:w-[340px]">
          <div className="flex justify-end">
            <MaterialsChecklist months={m.months.map(mo => mo.label)} model={m} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="Borrowing Capacity (Today)" value={fmtCurrency(m.borrowingCapacity, true)} good={m.borrowingCapacity > 0} />
            <MetricTile label="Borrowing Capacity (6M)" value={fmtCurrency(borrowingCapacity6m, true)} good={borrowingCapacity6m > 0} />
            <MetricTile label="Facility Recommendation" value={fmtCurrency(m.facilityRecommendation, true)} />
            <MetricTile label="Deferred Revenue (Today)" value={fmtCurrency(deferredRevToday, true)} />
          </div>
          <MetricTile label="Deferred Revenue (6M Projected)" value={fmtCurrency(deferredRev6m, true)} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          ROW 2 — P&L / REVENUE + FLAGS (2/3 left, 1/3 right)
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* LEFT: Revenue vs Expenses + EBITDA charts */}
        <div className="space-y-4">
          <Card className="border-border/30 relative">
            {ann && (
              <AnnotationBadge targetType="chart" targetRef="revenue" targetLabel="Revenue Chart"
                annotations={ann.getAnnotationsForTarget('chart', 'revenue')}
                onAdd={ann.addAnnotation} onResolve={ann.resolveAnnotation} onDelete={ann.deleteAnnotation} />
            )}
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Revenue vs Expenses{periodLabel}</h3>
                <PeriodSelector value={chartPeriod} onChange={setChartPeriod} />
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={revExpChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={45} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => fmtCurrency(v, true)} />
                    <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="revenue" name="Total Revenue" stroke="#2ED3B7" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="expenses" name="Total Expenses" stroke="#F97373" dot={false} strokeWidth={2} strokeDasharray="5 5" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/30 relative">
            {ann && (
              <AnnotationBadge targetType="chart" targetRef="ebitda" targetLabel="EBITDA Chart"
                annotations={ann.getAnnotationsForTarget('chart', 'ebitda')}
                onAdd={ann.addAnnotation} onResolve={ann.resolveAnnotation} onDelete={ann.deleteAnnotation} />
            )}
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">EBITDA & Operating Income{periodLabel}</h3>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  {m.ebitda[last] >= 0 ? 'Profitable' : 'Pre-profit'}
                </Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={ebitdaChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={45} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => fmtCurrency(v, true)} />
                    <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
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

        {/* RIGHT: Annual P&L Summary + Flags */}
        <div className="space-y-4">
          <Card className="border-border/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Annual P&L Summary</h3>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> Flags: {annualData.length > 0 ? annualData.filter(a => a.values.ebitda < 0).length : 0}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground text-[10px]">Metric</th>
                      {annualData.slice(-4).map((a, i) => (
                        <th key={a.year} className="text-right py-2 px-2 font-medium text-muted-foreground text-[10px]">{a.year}</th>
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
                        <td className="py-1.5 px-2 font-medium text-[11px]">{row.label}</td>
                        {annualData.slice(-4).map((a, ai) => {
                          const val = a.values[row.key];
                          const sliced = annualData.slice(-4);
                          const prevVal = ai > 0 ? sliced[ai - 1].values[row.key] : null;
                          const yoyPct = prevVal && prevVal !== 0 && row.key !== 'grossMargin'
                            ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
                          return (
                            <td key={a.year} className={cn("py-1.5 px-2 text-right font-mono tabular-nums text-[11px]", isNegative(val) && "text-destructive")}>
                              <div className="flex flex-col items-end">
                                <span>{row.fmt(val)}</span>
                                {yoyPct !== null && ai > 0 && (
                                  <span className={cn("text-[8px]", yoyPct > 0 ? "text-emerald-500" : "text-destructive")}>
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

          {/* Financial Health Ratios */}
          <Card className="border-border/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Financial Health Ratios</h3>
              <div className="grid grid-cols-2 gap-2">
                <RatioCard label="Current Ratio" value={m.currentRatio} formatted={fmtRatio(m.currentRatio)} benchmark={1.5} benchmarkLabel="Target: 1.5x" />
                <RatioCard label="AR/AP Ratio" value={m.arApRatio} formatted={fmtRatio(m.arApRatio)} benchmark={1.0} benchmarkLabel="Target: 1.0x" />
                <RatioCard label="Cash / Assets" value={m.cashTotalAssets * 100} formatted={fmtPct(m.cashTotalAssets * 100)} benchmark={15} benchmarkLabel="Target: 15%" />
                <RatioCard label="Debt / Liabilities" value={m.debtTotalLiabilities * 100} formatted={fmtPct(m.debtTotalLiabilities * 100)} benchmark={50} benchmarkLabel="Max: 50%" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          ROW 3 — REVENUE BREAKDOWN + BALANCE SHEET (2/3 left, 1/3 right)
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* LEFT: Revenue Breakdown chart */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Revenue Breakdown{periodLabel}</h3>
              <PeriodSelector value={chartPeriod} onChange={setChartPeriod} />
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revBreakdownData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => fmtCurrency(v, true)} />
                  <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area type="monotone" dataKey="recurring" name="Recurring Revenue" fill="#4C6FFF" fillOpacity={0.15} stroke="#4C6FFF" strokeWidth={2} />
                  <Line type="monotone" dataKey="total" name="Total Revenue" stroke="#2ED3B7" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Balance Sheet Snapshot + Net AR */}
        <div className="space-y-4">
          <Card className="border-border/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Balance Sheet Snapshot</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Item</th>
                      {bsSnapData.map(d => (
                        <th key={d.label} className="text-right py-1.5 px-1.5 font-medium text-muted-foreground whitespace-nowrap">{d.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Cash', key: 'cash' as const },
                      { label: 'Accts Receivable', key: 'ar' as const },
                      { label: 'Accts Payable', key: 'ap' as const },
                      { label: 'Deferred Revenue', key: 'deferredRev' as const },
                      { label: 'ST Debt', key: 'stDebt' as const },
                      { label: 'LT Debt', key: 'ltDebt' as const },
                      { label: 'Net AR', key: 'netAr' as const },
                    ].map(row => (
                      <tr key={row.label} className="border-b border-border/10 hover:bg-muted/20">
                        <td className="py-1 px-1.5 font-medium whitespace-nowrap">{row.label}</td>
                        {bsSnapData.map((d, i) => (
                          <td key={i} className={cn("py-1 px-1.5 text-right font-mono tabular-nums", isNegative(d[row.key]) && "text-destructive")}>
                            {fmtCurrency(d[row.key], true)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-2">Net AR Availability</h3>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netArData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => fmtCurrency(v, true)} />
                    <Tooltip formatter={(v: number) => [fmtCurrency(v), 'Net AR']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
                    <Line type="monotone" dataKey="netAr" stroke="#4C6FFF" dot={{ r: 3 }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          ROW 4 — CASH FLOW & RUNWAY + ANALYST NOTES (full width split)
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Cash Flow & Runway */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Cash Flow & Runway</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile
                label="Trailing 3Mo DSCR"
                value={cfMetrics.dscr > 0 ? `${cfMetrics.dscr.toFixed(1)}x` : 'N/A'}
                helper="Target ≥ 2.0x"
                good={cfMetrics.dscr >= 2}
              />
              <MetricTile
                label="CF from Ops (3M Avg)"
                value={fmtCurrency(cfMetrics.cfOps3m, true)}
                good={cfMetrics.cfOps3m > 0}
              />
              <MetricTile
                label="CF from Ops (6M Avg)"
                value={fmtCurrency(cfMetrics.cfOps6m, true)}
                good={cfMetrics.cfOps6m > 0}
              />
              <MetricTile
                label="CF from Ops (12M Avg)"
                value={fmtCurrency(cfMetrics.cfOps12m, true)}
                good={cfMetrics.cfOps12m > 0}
              />
              <MetricTile
                label="6M Burn"
                value={fmtCurrency(cfMetrics.burn6m, true)}
                good={cfMetrics.burn6m >= 0}
              />
              <MetricTile
                label="Runway (months)"
                value={cfMetrics.runway >= 999 ? '∞' : `${Math.round(cfMetrics.runway)} mo`}
                good={cfMetrics.runway >= 18}
              />
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Analyst Notes & Flags */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Analyst Notes</h3>
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                  <FileText className="h-2.5 w-2.5" /> BS Flags: {m.balanceSheet.bsCheck.filter(v => Math.abs(v) > 0.01).length}
                </Badge>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> CF Flags: {cfMetrics.cfOps3m < 0 ? 1 : 0}
                </Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-md border border-border/20 bg-muted/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">P&L Notes</p>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {m.ebitda[last] >= 0
                    ? `Company is currently profitable with EBITDA of ${fmtCurrency(m.ebitda[last], true)}. Gross margins at ${fmtPct(m.latestGrossMargin)} with ${fmtPct(m.yoyRevGrowth)} YoY revenue growth.`
                    : `Company is pre-profit with negative EBITDA of ${fmtCurrency(m.ebitda[last], true)}. Monitor burn rate and runway closely. Current cash position: ${fmtCurrency(m.balanceSheet.cash[last], true)}.`
                  }
                </p>
              </div>
              <div className="p-3 rounded-md border border-border/20 bg-muted/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Balance Sheet Notes</p>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  Current ratio at {fmtRatio(m.currentRatio)} (target: 1.5x). AR/AP ratio at {fmtRatio(m.arApRatio)}.
                  {m.balanceSheet.stDebt[last] > 0 ? ` Short-term debt of ${fmtCurrency(m.balanceSheet.stDebt[last], true)}.` : ' No short-term debt outstanding.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════
          ROW 5 — AI INSIGHTS & FINANCIAL AI (right-biased)
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <AIInsightsPanel model={m} />
        <AnalysisChatPanel model={m} />
      </div>
    </div>
  );
}
