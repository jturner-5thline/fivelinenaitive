import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ComposedChart, Line, CartesianGrid } from 'recharts';
import { useMetricsData } from '@/hooks/useMetricsData';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

function RevenueStatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border bg-card text-center">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

export function IncomeBoardDashboard() {
  const { data: metrics, isLoading } = useMetricsData();

  if (isLoading || !metrics) {
    return <div className="animate-pulse">Loading...</div>;
  }

  const totalServicesData = [
    { month: 'Jul-25', income: 121000 },
    { month: 'Aug-25', income: 155000 },
  ];

  const revenueByDeptData = [
    { month: 'Jul-25', income: 121000 },
    { month: 'Aug-25', income: 155000 },
  ];

  const debtServicesData = [
    { month: 'Jul-25', value: 88000 },
    { month: 'Aug-25', value: 118000 },
  ];

  const retainerData = [
    { month: 'Jul-25', value: 37000 },
    { month: 'Aug-25', value: 10000 },
  ];

  const milestoneData = [
    { month: 'Aug-25', value: 75000 },
  ];

  const closingFeesData = [
    { month: 'Jul-25', value: 16000 },
    { month: 'Aug-25', value: 10000 },
  ];

  const finservRevenueData = [
    { month: 'Jul-25', value: 33000 },
    { month: 'Aug-25', value: 37000 },
  ];

  const techRevenueData = [
    { month: 'Jul-25', value: 372 },
    { month: 'Aug-25', value: 420 },
  ];

  const revenueByCustomerData = [
    { customer: 'Customer 1', value: 54000 },
    { customer: 'Customer 2', value: 33000 },
    { customer: 'Customer 3', value: 37000 },
    { customer: 'Customer 4', value: 110000 },
  ];

  const arAgingData = [
    { month: 'Sep-24', ar: 26000, aging: -21000 },
    { month: 'Oct-24', ar: 26000, aging: -24000 },
    { month: 'Nov-24', ar: 19000, aging: -24000 },
    { month: 'Dec-24', ar: 29000, aging: -24000 },
    { month: 'Jan-25', ar: 27000, aging: -35000 },
    { month: 'Feb-25', ar: 20000, aging: -35000 },
    { month: 'Mar-25', ar: 25000, aging: -38000 },
    { month: 'Apr-25', ar: 33000, aging: -38000 },
  ];

  const finservCustomerData = [
    { customer: 'Company A', value: 46000 },
    { customer: 'Company B', value: 28000 },
    { customer: 'Company C', value: 20000 },
    { customer: 'Company D', value: 18000 },
    { customer: 'Company E', value: 47000 },
    { customer: 'Company F', value: 32000 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue Stats */}
      <div className="grid grid-cols-3 md:grid-cols-8 gap-2">
        <RevenueStatCard title="Total Revenue" value="$1.16M" />
        <RevenueStatCard title="Total Debt Revenue" value="$13.77M" />
        <RevenueStatCard title="Retainer Revenue" value="$13.77M" />
        <RevenueStatCard title="FinServ Revenue" value="$13.77M" />
        <RevenueStatCard title="FS Non-Recurring Rev" value="$13.77M" />
        <RevenueStatCard title="Milestone Fees" value="$13.77M" />
        <RevenueStatCard title="DS Closing Fees" value="$13.77M" />
        <RevenueStatCard title="FS Recurring Revenue" value="$13.77M" />
      </div>

      {/* Row 2: Services Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Services Revenue</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">Drill Down: Account levels</Badge>
              <Badge variant="outline" className="text-xs">Quarter to date</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalServicesData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Income" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Dept.</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByDeptData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Income" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Solutions</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[180px]">
            <p className="text-muted-foreground text-sm">Entity filter active</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Debt Services Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Services Revenue</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={debtServicesData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Income - Retainer Revenue</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={retainerData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Income - Consulting & Milestone</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={milestoneData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Debt Income - Closing Fees</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={closingFeesData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Financial Services */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Financial Services Revenue</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finservRevenueData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">FinServ Revenue {i}</CardTitle>
              <Badge variant="outline" className="text-xs">Quarter to date</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={finservRevenueData}>
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 5: Technology & Customer Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Technology Revenue</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={techRevenueData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Customer</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByCustomerData}>
                  <XAxis dataKey="customer" tick={{ fontSize: 8 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FinServ AR Aging: Rolling 12 Months</CardTitle>
            <Badge variant="outline" className="text-xs">Last 12 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={arAgingData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 8 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="ar" fill="hsl(var(--primary))" name="A/R" />
                  <Line type="monotone" dataKey="aging" stroke="hsl(var(--destructive))" name="Aging" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 6: FinServ Customer Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FinServ AR Aging: Rolling 12 Months - Eden Test</CardTitle>
            <Badge variant="outline" className="text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={arAgingData.slice(0, 3)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="ar" fill="hsl(var(--primary))" />
                  <Line type="monotone" dataKey="aging" stroke="hsl(var(--destructive))" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Customer - FinServ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finservCustomerData}>
                  <XAxis dataKey="customer" tick={{ fontSize: 8 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
