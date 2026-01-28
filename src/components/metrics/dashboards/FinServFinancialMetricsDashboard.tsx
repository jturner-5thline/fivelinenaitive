import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, ComposedChart, Legend } from 'recharts';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
};

export function FinServFinancialMetricsDashboard() {
  // Total Revenue / Gross Profit data
  const grossProfitData = [
    { quarter: 'Q1-26', grossProfit: 36000, grossProfitPercent: 100 },
  ];

  // Operating Profit data
  const operatingProfitData = [
    { month: 'Dec-25', value: 8000 },
    { month: 'Jan-26', value: 2000 },
  ];

  // FinServ Cashflow data
  const cashflowData = [
    { month: 'Feb-25', value: 47000 },
    { month: 'Mar-25', value: 47000 },
    { month: 'Apr-25', value: 47000 },
    { month: 'May-25', value: 40000 },
    { month: 'Jun-25', value: 40000 },
    { month: 'Jul-25', value: 40000 },
    { month: 'Aug-25', value: 7000 },
    { month: 'Sep-25', value: 5000 },
    { month: 'Oct-25', value: 5000 },
    { month: 'Nov-25', value: 0 },
    { month: 'Dec-25', value: -5000 },
    { month: 'Jan-26', value: -13000 },
  ];

  // Billable Hours data
  const billableHoursData = [
    { month: 'Feb-25', hours: -58.74 },
    { month: 'Mar-25', hours: -61.07 },
    { month: 'Apr-25', hours: -65.91 },
    { month: 'May-25', hours: -69.35 },
    { month: 'Jun-25', hours: -81.27 },
    { month: 'Jul-25', hours: -100 },
    { month: 'Aug-25', hours: -124.54 },
    { month: 'Sep-25', hours: -124.54 },
    { month: 'Oct-25', hours: -124.54 },
  ];

  // Variable Billing data
  const variableBillingData = [
    { month: 'Feb-25', amount: -5000 },
    { month: 'Mar-25', amount: -5000 },
    { month: 'Apr-25', amount: -5000 },
    { month: 'May-25', amount: -7000 },
    { month: 'Jun-25', amount: -7000 },
    { month: 'Jul-25', amount: -13000 },
    { month: 'Aug-25', amount: -16000 },
    { month: 'Sep-25', amount: -20000 },
    { month: 'Oct-25', amount: -35000 },
    { month: 'Nov-25', amount: -35000 },
    { month: 'Dec-25', amount: -40000 },
  ];

  // Income by Product/Service data
  const incomeByProductData = [
    { month: 'Feb-25', hours: 50000, recurringFee: 15000 },
    { month: 'Mar-25', hours: 45000, recurringFee: 14000 },
    { month: 'Apr-25', hours: 42000, recurringFee: 14500 },
    { month: 'May-25', hours: 40000, recurringFee: 15300 },
    { month: 'Jun-25', hours: 38000, recurringFee: 12500 },
    { month: 'Jul-25', hours: 35000, recurringFee: 11000 },
    { month: 'Aug-25', hours: 30000, recurringFee: 8700 },
    { month: 'Sep-25', hours: 32000, recurringFee: 9000 },
    { month: 'Oct-25', hours: 28000, recurringFee: 8500 },
    { month: 'Nov-25', hours: 25000, recurringFee: 7500 },
    { month: 'Dec-25', hours: 22000, recurringFee: 6000 },
    { month: 'Jan-26', hours: 18000, recurringFee: 5000 },
  ];

  // Client Count MoM Change data
  const clientCountData = [
    { month: 'Feb-25', count: 15 },
    { month: 'Mar-25', count: 14 },
    { month: 'Apr-25', count: 13 },
    { month: 'May-25', count: 12 },
    { month: 'Jun-25', count: 11 },
    { month: 'Jul-25', count: 10 },
    { month: 'Aug-25', count: 9 },
    { month: 'Sep-25', count: 8 },
    { month: 'Oct-25', count: 7 },
    { month: 'Nov-25', count: 6 },
    { month: 'Dec-25', count: 5 },
    { month: 'Jan-26', count: 4 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue & Profit Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue / Gross Profit $ / Margin %</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Year to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={grossProfitData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(value: number, name: string) => [
                    name === 'grossProfitPercent' ? `${value}%` : formatCurrency(value),
                    name === 'grossProfitPercent' ? 'Gross Profit %' : 'Gross Profit'
                  ]} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="grossProfit" fill="hsl(var(--primary))" name="Gross Profit" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="grossProfitPercent" stroke="hsl(var(--chart-2))" name="Gross Profit %" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operating Profit $ / Margin %</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Year to date</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operatingProfitData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" name="Operating Profit" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Cashflow & Billable Hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FinServ Cashflow</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflowData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar 
                    dataKey="value" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={billableHoursData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(2)} hrs`, 'Hours']} />
                  <Line type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Variable Billing & Income by Product */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Variable Billing</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={variableBillingData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--destructive))" name="Variable Billing" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Income by Product/Service</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Last 12 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={incomeByProductData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="hours" fill="hsl(var(--primary))" name="Hours" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="recurringFee" stroke="hsl(var(--chart-2))" name="Recurring Advisory Fee" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Client Count */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Client Count MoM Change</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">Excluding Null Customers - Last 12 Months</Badge>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clientCountData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Client Count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
