import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, fmtRatio, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DollarSign, BarChart3, Target, Shield, Zap, Users } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Area, AreaChart,
} from 'recharts';
import { EnhancedKPICard } from './EnhancedKPICard';

interface Props {
  model: SaaSModelData;
}

// Generate trailing sparkline data from monthly arrays (last 12 months)
function trailingSparkline(data: number[], count = 12): number[] {
  if (!data || data.length === 0) return [];
  const start = Math.max(0, data.length - count);
  return data.slice(start).filter(v => v !== 0 || data.some(d => d !== 0));
}

// Estimate total customers from revenue (synthetic for demo when not available)
function estimateCustomerCount(model: SaaSModelData): { current: number; sparkline: number[]; delta: number } {
  // Use ARR / estimated ACV to derive customer count
  const acv = 120_000; // assumed average contract value
  const current = model.arrToday > 0 ? Math.round(model.arrToday / acv) : 0;
  const sparkline = model.totalRevenue.slice(-12).map((r, i, arr) => {
    const annualized = r * 12;
    return Math.round(annualized / acv);
  });
  const prev = sparkline.length >= 2 ? sparkline[sparkline.length - 2] : current;
  const delta = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  return { current, sparkline, delta };
}

export function SaaSModelDashboard({ model }: Props) {
  // Chart data
  const revenueChartData = model.months.map((m, i) => ({
    name: m.label,
    recurring: model.revenue.recurring[i],
    total: model.totalRevenue[i],
  }));

  const ebitdaChartData = model.months.map((m, i) => ({
    name: m.label,
    ebitda: model.ebitda[i],
    fill: model.ebitda[i] >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
  }));

  // Annual rollup
  const annualData = annualRollup(model, [
    { key: 'recurring', source: model.revenue.recurring, type: 'sum' },
    { key: 'totalRevenue', source: model.totalRevenue, type: 'sum' },
    { key: 'grossMargin', source: model.grossMarginPct, type: 'avg' },
    { key: 'ebitda', source: model.ebitda, type: 'sum' },
  ]);

  const hasData = model.totalRevenue.some(v => v !== 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {(() => {
        const customers = estimateCustomerCount(model);
        const revSparkline = trailingSparkline(model.totalRevenue);
        const recurringSparkline = trailingSparkline(model.revenue.recurring);
        const marginSparkline = trailingSparkline(model.grossMarginPct);
        const ebitdaSparkline = trailingSparkline(model.ebitda);

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <EnhancedKPICard
              label="ARR Today"
              value={model.arrToday}
              formattedValue={fmtCurrency(model.arrToday, true)}
              delta={model.yoyRevGrowth || undefined}
              deltaLabel="YoY"
              sparklineData={recurringSparkline}
              icon={DollarSign}
            />
            <EnhancedKPICard
              label="MRR (3mo Avg)"
              value={model.mrrT3M}
              formattedValue={fmtCurrency(model.mrrT3M, true)}
              sparklineData={recurringSparkline.slice(-6)}
              icon={BarChart3}
            />
            <EnhancedKPICard
              label="Gross Margin"
              value={model.latestGrossMargin}
              formattedValue={fmtPct(model.latestGrossMargin)}
              sparklineData={marginSparkline}
              icon={Target}
            />
            <EnhancedKPICard
              label="YoY Rev Growth"
              value={model.yoyRevGrowth}
              formattedValue={fmtPct(model.yoyRevGrowth)}
              delta={model.yoyRevGrowth || undefined}
              sparklineData={revSparkline}
              icon={BarChart3}
            />
            <EnhancedKPICard
              label="Net Rev Retention"
              value={model.netRevenueRetention}
              formattedValue={fmtPct(model.netRevenueRetention)}
              sparklineData={[95, 98, 100, 102, 105, model.netRevenueRetention || 100]}
              icon={Shield}
            />
            <EnhancedKPICard
              label="Borrowing Capacity"
              value={model.borrowingCapacity}
              formattedValue={fmtCurrency(model.borrowingCapacity, true)}
              sparklineData={ebitdaSparkline}
              icon={Zap}
            />
            <EnhancedKPICard
              label="Facility Rec."
              value={model.facilityRecommendation}
              formattedValue={fmtCurrency(model.facilityRecommendation, true)}
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
        );
      })()}

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
                  <Area type="monotone" dataKey="recurring" name="Recurring Revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                  <Line type="monotone" dataKey="total" name="Total Revenue" stroke="hsl(var(--info, 220 80% 60%))" strokeDasharray="5 5" dot={false} />
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
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar dataKey="ebitda" name="EBITDA" radius={[2, 2, 0, 0]}>
                    {ebitdaChartData.map((entry, idx) => (
                      <rect key={idx} fill={entry.ebitda >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
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

      {/* Financial Health */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Financial Health Ratios</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Current Ratio', value: fmtRatio(model.currentRatio) },
              { label: 'AR/AP Ratio', value: fmtRatio(model.arApRatio) },
              { label: 'Cash / Total Assets', value: fmtPct(model.cashTotalAssets) },
              { label: 'Debt / Total Liabilities', value: fmtPct(model.debtTotalLiabilities) },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-md border border-border/20 bg-muted/10">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{item.label}</div>
                <div className="text-lg font-bold font-mono tabular-nums">{item.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
