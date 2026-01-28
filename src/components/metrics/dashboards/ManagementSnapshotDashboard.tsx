import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Lock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ComposedChart, Line, CartesianGrid } from 'recharts';
import { useMetricsData } from '@/hooks/useMetricsData';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
};

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  planPercent?: string;
  subtitle?: string;
}

function MetricCard({ title, value, change, changeLabel = 'vs Previous Period', planPercent }: MetricCardProps) {
  const isPositive = change && change >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <div className="flex items-center gap-2 mt-1 text-xs">
          {change !== undefined && (
            <span className={isPositive ? 'text-success' : 'text-destructive'}>
              {isPositive ? '+' : ''}{change}% {changeLabel}
            </span>
          )}
          {planPercent && <span className="text-muted-foreground">{planPercent} of Plan</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function NoPermissionCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Lock className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm font-medium">No Permission</p>
        <p className="text-xs">You do not have permission to view the data</p>
        <Button variant="default" size="sm" className="mt-3">Request Permission</Button>
      </CardContent>
    </Card>
  );
}

export function ManagementSnapshotDashboard() {
  const { data: metrics, isLoading } = useMetricsData();

  if (isLoading || !metrics) {
    return <div className="animate-pulse space-y-4">Loading...</div>;
  }

  // Sample data for charts
  const debtRevenueData = [
    { quarter: 'Q4-25', retainer: 60000, milestone: 1000, closing: 178000, label: '$244k' },
  ];

  const finservRevenueData = [
    { month: 'Nov-25', revenue: 27000, recurring: 9000 },
    { month: 'Dec-25', revenue: 25000, recurring: 9000 },
    { month: 'Jan-26', revenue: 23000, recurring: 9000 },
  ];

  const clientsSignedDebt = [{ month: 'Jan-26', count: 1 }];
  const clientsSignedFinServ = [{ month: 'Jan-26', count: 1 }];

  const debtProfitData = [{ quarter: 'Q1-26', netIncome: 22000, netIncomePercent: 70 }];
  const finservProfitData = [{ quarter: 'Q1-26', netIncome: 32000, netIncomePercent: 75 }];

  const arData = [
    { entity: '5th Line Capital Advisors LLC', amount: 80500 },
    { entity: '5th Line Financial Services, LLC', amount: 51680 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Debt Revenue Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Revenue</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Reporting Month: Q4-25</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={debtRevenueData}>
                  <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="closing" stackId="a" fill="hsl(var(--primary))" name="Closing Fees" />
                  <Bar dataKey="milestone" stackId="a" fill="hsl(var(--chart-2))" name="Milestone" />
                  <Bar dataKey="retainer" stackId="a" fill="hsl(var(--chart-3))" name="Retainer" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* FinServ Revenue Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FinServ Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finservRevenueData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" />
                  <Bar dataKey="recurring" fill="hsl(var(--chart-2))" name="Recurring" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Total Revenue Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-4xl font-bold">{formatCurrency(metrics.totalFees || 87500)}</p>
              <p className="text-destructive text-sm">-43% vs Previous Period</p>
              <p className="text-muted-foreground text-sm">of Plan</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Debt Revenue</p>
                <p className="font-semibold">{formatCurrency(53100)}</p>
                <p className="text-destructive text-xs">-55%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">FinServ Revenue</p>
                <p className="font-semibold">{formatCurrency(33400)}</p>
                <p className="text-success text-xs">+52%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Sales Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <MetricCard title="Debt: Deals on Board" value="6" change={-57} planPercent="67%" />
            <MetricCard title="Debt: $ on Board" value="$0" change={-100} planPercent="#DIV/0!" />
            <MetricCard title="Debt: Deals Signed" value="5" change={67} planPercent="72%" />
            <MetricCard title="Debt: $ Signed" value="$0" change={undefined} planPercent="72%" />
            <MetricCard title="FinServ: Deals on Board" value="2" change={100} planPercent="72%" />
            <MetricCard title="FinServ: Clients Signed" value="1" change={-50} planPercent="72%" />
          </div>
        </CardContent>
      </Card>

      {/* Row 3: Clients Signed Charts & A/R */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clients Signed - Debt</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Year to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientsSignedDebt}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clients Signed - FinServ</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Year to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientsSignedFinServ}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding A/R</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={arData} layout="vertical">
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="entity" type="category" width={150} tick={{ fontSize: 8 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Financial & Active Deals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Profit</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">Entity: All</Badge>
              <Badge variant="outline" className="text-xs">Year to date</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={debtProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="netIncome" fill="hsl(var(--primary))" name="Net Income" />
                  <Line yAxisId="right" type="monotone" dataKey="netIncomePercent" stroke="hsl(var(--chart-2))" name="Net Income %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FinServ Revenue</CardTitle>
            <Badge variant="outline" className="text-xs">Year to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finservProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="netIncome" fill="hsl(var(--primary))" name="Net Income" />
                  <Line yAxisId="right" type="monotone" dataKey="netIncomePercent" stroke="hsl(var(--chart-2))" name="Net Income %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <NoPermissionCard title="Active Deals" />
      </div>
    </div>
  );
}
