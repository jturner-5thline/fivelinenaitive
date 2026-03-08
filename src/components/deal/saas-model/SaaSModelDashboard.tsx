import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, fmtRatio, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Target, Shield, Zap } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Area, AreaChart,
} from 'recharts';

interface Props {
  model: SaaSModelData;
}

function KPICard({ label, value, delta, icon: Icon, deltaPositive }: {
  label: string; value: string; delta?: string; icon: React.ElementType; deltaPositive?: boolean;
}) {
  return (
    <Card className="border-border/30 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums">{value}</div>
        {delta && (
          <div className={cn(
            "text-[11px] font-medium mt-1 flex items-center gap-1",
            deltaPositive ? "text-emerald-500" : "text-destructive"
          )}>
            {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard label="ARR Today" value={fmtCurrency(model.arrToday, true)} icon={DollarSign}
          delta={model.yoyRevGrowth ? fmtPct(model.yoyRevGrowth) + ' YoY' : undefined}
          deltaPositive={model.yoyRevGrowth > 0} />
        <KPICard label="MRR (3mo Avg)" value={fmtCurrency(model.mrrT3M, true)} icon={BarChart3} />
        <KPICard label="Gross Margin" value={fmtPct(model.latestGrossMargin)} icon={Target} />
        <KPICard label="YoY Rev Growth" value={fmtPct(model.yoyRevGrowth)} icon={TrendingUp}
          deltaPositive={model.yoyRevGrowth > 0} />
        <KPICard label="Net Rev Retention" value={fmtPct(model.netRevenueRetention)} icon={Shield} />
        <KPICard label="Borrowing Capacity" value={fmtCurrency(model.borrowingCapacity, true)} icon={Zap} />
        <KPICard label="Facility Rec." value={fmtCurrency(model.facilityRecommendation, true)} icon={DollarSign} />
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
