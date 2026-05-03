import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Area,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { DollarSign, Users, FileText, AlertTriangle, TrendingUp, CreditCard, Percent } from 'lucide-react';

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

export function QuickBooksFinancialDashboard() {
  const { data: status } = useQuickBooksStatus();
  const { data: metrics, isLoading } = useQuickBooksMetrics();

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
    { title: 'Total Revenue', value: formatCurrency(metrics.totalRevenue), icon: DollarSign, color: 'hsl(var(--primary))' },
    { title: 'Accounts Receivable', value: formatCurrency(metrics.totalAR), icon: FileText, color: 'hsl(var(--chart-2))' },
    { title: 'Payments Received', value: formatCurrency(metrics.totalPayments), icon: CreditCard, color: 'hsl(var(--success, 142 71% 45%))' },
    { title: 'Active Customers', value: `${metrics.activeCustomers}`, icon: Users, color: 'hsl(var(--chart-4))' },
    { title: 'Collection Rate', value: `${metrics.collectionRate.toFixed(1)}%`, icon: Percent, color: 'hsl(var(--chart-3))' },
    { title: 'Overdue', value: formatCurrency(metrics.overdueAmount), subtitle: `${metrics.overdueCount} invoices`, icon: AlertTriangle, color: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
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
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[3, 3, 0, 0]} />
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
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
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
                    <Bar dataKey="revenue" shape={createGlassBarShape({ radius: 3 })}>
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
  );
}
