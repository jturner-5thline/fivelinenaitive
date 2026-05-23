import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuickBooksMetrics, type QuickBooksMetricsPeriod } from '@/hooks/useQuickBooksMetrics';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Area,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { DollarSign, Users, FileText, AlertTriangle, TrendingUp, CreditCard, Percent } from 'lucide-react';
import { InsightsDrilldownDrawer, type DrilldownContext, type DrilldownColumn } from '@/components/metrics/insights/InsightsDrilldownDrawer';

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210, 70%, 50%)",
  "hsl(180, 60%, 45%)",
  "hsl(330, 60%, 50%)",
];

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

interface Props {
  /** Optional period filter for flow-based metrics (revenue/payments/etc). */
  period?: QuickBooksMetricsPeriod & { label: string };
  /** Optional text rendered as a Badge on each tile header (e.g. "Monthly · 2026 YTD"). */
  periodBadge?: string;
}

export function QuickBooksFinancialDashboard({ period, periodBadge }: Props = {}) {
  const { data: status } = useQuickBooksStatus();
  const { data: metrics, isLoading } = useQuickBooksMetrics(
    undefined,
    period ? { start: period.start, end: period.end } : undefined,
  );
  const [drill, setDrill] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);

  const showDrill = (
    sourceLabel: string,
    selection: string,
    rows: Array<{ metric: string; value: string }>,
  ) => setDrill({
    context: { sourceId: `qb:${sourceLabel}`, sourceLabel, selection },
    columns: [
      { key: 'metric', label: 'Field' },
      { key: 'value', label: 'Value', align: 'right' },
    ],
    rows,
  });

  if (!status?.connected) {
    return (
      <Card className="glass-module">
        <CardContent className="py-12 text-center">
          <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">QuickBooks Not Connected</h3>
          <p className="text-muted-foreground text-sm">
            Connect your QuickBooks account in Integrations to see financial metrics here.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const statCards = [
    { title: 'Total Revenue', value: formatCurrency(metrics.totalRevenue), icon: DollarSign, color: 'hsl(var(--primary))', onClick: () => showDrill('Total Revenue', 'All-time', [{ metric: 'Total Revenue', value: formatCurrency(metrics.totalRevenue) }]) },
    { title: 'Accounts Receivable', value: formatCurrency(metrics.totalAR), icon: FileText, color: 'hsl(var(--chart-2))', onClick: () => showDrill('Accounts Receivable', 'Outstanding', [{ metric: 'Outstanding A/R', value: formatCurrency(metrics.totalAR) }]) },
    { title: 'Payments Received', value: formatCurrency(metrics.totalPayments), icon: CreditCard, color: 'hsl(var(--success, 142 71% 45%))', onClick: () => showDrill('Payments Received', 'All-time', [{ metric: 'Payments Received', value: formatCurrency(metrics.totalPayments) }]) },
    { title: 'Active Customers', value: `${metrics.activeCustomers}`, icon: Users, color: 'hsl(var(--chart-4))', onClick: () => showDrill('Active Customers', 'Currently active', [{ metric: 'Active Customers', value: `${metrics.activeCustomers}` }]) },
    { title: 'Collection Rate', value: `${metrics.collectionRate.toFixed(1)}%`, icon: Percent, color: 'hsl(var(--chart-3))', onClick: () => showDrill('Collection Rate', 'Payments / Revenue', [
      { metric: 'Payments', value: formatCurrency(metrics.totalPayments) },
      { metric: 'Revenue', value: formatCurrency(metrics.totalRevenue) },
      { metric: 'Collection Rate', value: `${metrics.collectionRate.toFixed(1)}%` },
    ]) },
    { title: 'Overdue', value: formatCurrency(metrics.overdueAmount), subtitle: `${metrics.overdueCount} invoices`, icon: AlertTriangle, color: 'hsl(var(--destructive))', onClick: () => showDrill('Overdue Invoices', `${metrics.overdueCount} invoices`, [
      { metric: 'Overdue Amount', value: formatCurrency(metrics.overdueAmount) },
      { metric: 'Overdue Count', value: `${metrics.overdueCount}` },
    ]) },
  ];

  return (
    <>
    <div className="space-y-6">
      {/* Stat Cards */}
      {periodBadge && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{periodBadge}</Badge>
          <span className="text-[11px] text-muted-foreground">A/R, A/P, aging &amp; overdue are current snapshots</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} onClick={card.onClick} className="cursor-pointer hover:border-primary/40 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-xl font-bold text-foreground">{card.value}</p>
                  {'subtitle' in card && card.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  )}
                </div>
                <div className="p-2 rounded-full" style={{ backgroundColor: `${card.color}20` }}>
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Revenue & Payments Trend</CardTitle>
            <CardDescription>Rolling 12 months from QuickBooks</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metrics.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--primary))"
                    name="Revenue"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d: any) => showDrill('Revenue & Payments Trend', d?.month, [
                      { metric: 'Revenue', value: formatCurrency(Number(d?.revenue) || 0) },
                      { metric: 'Payments', value: formatCurrency(Number(d?.payments) || 0) },
                    ])}
                  />
                  <Line type="monotone" dataKey="payments" stroke="hsl(var(--chart-2))" name="Payments" strokeWidth={1} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AR Aging */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Accounts Receivable Aging</CardTitle>
            <CardDescription>Outstanding balances by aging bucket</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.arAgingData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Outstanding"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar
                    dataKey="value"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d: any) => showDrill('A/R Aging', d?.bucket, [
                      { metric: 'Bucket', value: String(d?.bucket ?? '') },
                      { metric: 'Outstanding', value: formatCurrency(Number(d?.value) || 0) },
                    ])}
                  >
                    {metrics.arAgingData.map((entry, index) => (
                      <Cell key={index} fill={index <= 1 ? "hsl(var(--primary))" : index <= 2 ? "hsl(var(--chart-4))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Top Customers by Revenue</CardTitle>
            <CardDescription>Based on invoice totals</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              {metrics.topCustomers.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.topCustomers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar
                      dataKey="revenue"
                      shape={createGlassBarShape({ radius: 3 })}
                      cursor="pointer"
                      onClick={(d: any) => showDrill('Top Customers by Revenue', d?.name, [
                        { metric: 'Customer', value: String(d?.name ?? '') },
                        { metric: 'Revenue', value: formatCurrency(Number(d?.revenue) || 0) },
                      ])}
                    >
                      {metrics.topCustomers.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No customer data</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Invoice Status & Payment Methods */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Invoice Status Breakdown</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              {metrics.invoiceStatusBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <PieGlassDefs colors={COLORS} />
                    <Pie
                      data={metrics.invoiceStatusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="status"
                      label={({ status, count }) => `${status} (${count})`}
                      labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                      activeShape={GlassActiveShape}
                      onClick={(d: any) => showDrill('Invoice Status Breakdown', d?.status, [
                        { metric: 'Status', value: String(d?.status ?? '') },
                        { metric: 'Count', value: `${d?.count ?? 0}` },
                        { metric: 'Value', value: formatCurrency(Number(d?.value) || 0) },
                      ])}
                      cursor="pointer"
                    >
                      {metrics.invoiceStatusBreakdown.map((_, index) => (
                        <Cell key={index} fill={pieGlassFill(index)} stroke={COLORS[index % COLORS.length]} strokeWidth={0.25} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No invoice data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    <InsightsDrilldownDrawer
      open={!!drill}
      onClose={() => setDrill(null)}
      context={drill?.context ?? null}
      columns={drill?.columns ?? []}
      rows={drill?.rows ?? []}
      emptyHint="No detail records available."
    />
    </>
  );
}
