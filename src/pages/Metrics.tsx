import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format, subMonths } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Percent, Building2, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Generate rolling 12 months labels
const generateMonthLabels = () => {
  const labels = [];
  for (let i = 11; i >= 0; i--) {
    labels.push(format(subMonths(new Date(), i), "MMM-yy"));
  }
  return labels;
};

const monthLabels = generateMonthLabels();

// Sample data matching P&L dashboard style
const consolidatedIncomeData = monthLabels.map((month, i) => ({
  month,
  income: [67, 29, 131, 110, 48, 50, 35, 88, 118, 53, 48, 685][i] * 1000,
  netIncomePercent: [-43, -43, 0, 0, 0, 0, 0, -150, -360, -360, -360, 0][i],
}));

const entityBreakdownData = [
  { entity: "5th Line Capital Advisors LLC", value: -21000, percent: -43 },
  { entity: "5th Line Capital, LLC", value: -3000, percent: 0 },
  { entity: "5th Line Financial Services, LLC", value: -1000, percent: 0 },
  { entity: "5th Line Technologies LLC", value: -53000, percent: -360 },
];

const expenseTTMData = monthLabels.map((month, i) => ({
  month,
  cogs: [20, 15, 30, 35, 25, 22, 28, 45, 60, 50, 48, 122][i] * 1000,
  operating: [81, 86, 69, 75, 65, 67, 55, 138, 189, 139, 111, 279][i] * 1000,
}));

const periodOverPeriodData = [
  { category: "Income", previous: 86000, current: 80000, variance: -6000 },
  { category: "Expense", previous: 189000, current: 159000, variance: -31000 },
];

const incomeYTDData = monthLabels.slice(4).map((month, i) => ({
  month,
  actuals: [714, 879, 1017, 1093, 1168, 1615, 1736, 1891, 1977, 2057][i] * 1000,
}));

const incomeQTDData = [
  { month: "May-25", value: 121000 },
  { month: "Jun-25", value: 152000 },
  { month: "Jul-25", value: 80000 },
  { month: "Aug-25", value: 276000 },
  { month: "Sep-25", value: 362000 },
  { month: "Oct-25", value: 598000 },
];

const laborCompensationData = monthLabels.map((month, i) => ({
  month,
  compensation: [17, 35, 46, 59, 94, 106, 116, 130, 134, 140, 149, 160][i] * 1000,
}));

const expenseComponentsData = monthLabels.map((month, i) => ({
  month,
  cogs: [10, 9, 6, 10, 8, 10, 12, 33, 29, 24, 27, 61][i] * 1000,
  operating: [91, 92, 95, 89, 81, 79, 71, 150, 160, 165, 162, 340][i] * 1000,
}));

const operatingExpenseBreakdown = [
  { name: "Payroll Expenses", value: 45000, percent: 43 },
  { name: "Office & Admin", value: 20000, percent: 19 },
  { name: "Travel", value: 10000, percent: 10 },
  { name: "Advertising", value: 6000, percent: 6 },
  { name: "Cost Of Labor", value: 6000, percent: 5 },
  { name: "Insurance", value: 5000, percent: 5 },
  { name: "Payroll Tax", value: 4000, percent: 3 },
  { name: "Rent/Lease", value: 3000, percent: 3 },
  { name: "Interest Paid", value: 3000, percent: 3 },
  { name: "All Others", value: 2000, percent: 2 },
];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210, 70%, 50%)",
  "hsl(180, 60%, 45%)",
  "hsl(330, 60%, 50%)",
  "hsl(45, 70%, 50%)",
  "hsl(120, 50%, 40%)",
];

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value}`;
};

const formatPercent = (value: number) => `${value}%`;

export default function Metrics() {
  const [reportingMonth, setReportingMonth] = useState("Oct-25");

  return (
    <>
      <Helmet>
        <title>P&L Metrics | 5thLine</title>
      </Helmet>
      <div className="container mx-auto py-6 px-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">P&L</h1>
              <Badge variant="outline" className="text-sm">
                <Calendar className="h-3 w-3 mr-1" />
                Oct, 2025
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Powered by 5thLine Analytics
            </p>
          </div>
          <Select value={reportingMonth} onValueChange={setReportingMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {monthLabels.map((month) => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Top Row: Consolidated Income & Entity Breakdown */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Consolidated Income: Rolling 12 Months */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Consolidated Income: Rolling 12 Months</CardTitle>
              <CardDescription>Drill Down: Account levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={consolidatedIncomeData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis 
                      yAxisId="left" 
                      tickFormatter={formatCurrency} 
                      tick={{ fontSize: 11 }} 
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      tickFormatter={formatPercent}
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === "income" ? formatCurrency(value) : `${value}%`,
                        name === "income" ? "Net Income" : "Net Income %"
                      ]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="income" fill="hsl(var(--primary))" name="Net Income" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="netIncomePercent" stroke="hsl(var(--chart-2))" name="Net Income %" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Net Income: Breakdown by Entity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Net Income: Breakdown by Entity</CardTitle>
              <CardDescription>Reporting Month: Last 1 Month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityBreakdownData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="entity" type="category" width={120} tick={{ fontSize: 9 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Net Income"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Bar 
                      dataKey="value" 
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expense: TTM */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Expense: TTM</CardTitle>
            <CardDescription>Expense includes: Cost of Goods Sold, Operating Expense, Other Expense. Drill Down: Account levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseTTMData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "cogs" ? "Cost of Goods Sold" : "Operating Expense"
                    ]}
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Bar dataKey="cogs" stackId="a" fill="hsl(var(--chart-3))" name="Cost of Goods Sold" />
                  <Bar dataKey="operating" stackId="a" fill="hsl(var(--chart-2))" name="Operating Expense" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Period over Period Analysis */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Income: Period over Period</CardTitle>
              <CardDescription>Reporting Month: Last 2 Months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[periodOverPeriodData[0]]}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value)]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name="Sep-25" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" fill="hsl(var(--primary))" name="Oct-25" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="variance" fill="hsl(var(--destructive))" name="Variance" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Expense: Period over Period</CardTitle>
              <CardDescription>Reporting Month: Last 2 Months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[periodOverPeriodData[1]]}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value)]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name="Sep-25" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" fill="hsl(var(--chart-2))" name="Oct-25" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="variance" fill="hsl(var(--success))" name="Variance" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Income Trends */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Income: YTD Trend vs. Budget</CardTitle>
              <CardDescription>Drill Down: Account levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={incomeYTDData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Actuals"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="actuals" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" name="Actuals" />
                    <Line type="monotone" dataKey="actuals" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Income: QTD</CardTitle>
              <CardDescription>Quarter to date performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incomeQTDData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Income"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" name="Actuals" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expense Details Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Expense Details
          </h2>
          
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Labor Compensation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Expense: Labor Compensation Rolling 12 Months</CardTitle>
                <CardDescription>Drill Down: Account levels</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={laborCompensationData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), "Compensation"]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="compensation" fill="hsl(var(--chart-4))" name="Compensation" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Expense Components */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Expense: Trend per main components Rolling 12 Months</CardTitle>
                <CardDescription>Cost of Goods Sold vs Operating Expense</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expenseComponentsData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          formatCurrency(value),
                          name === "cogs" ? "Cost of Goods Sold" : "Operating Expense"
                        ]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Legend />
                      <Bar dataKey="cogs" stackId="a" fill="hsl(var(--chart-3))" name="Cost of Goods Sold" />
                      <Bar dataKey="operating" stackId="a" fill="hsl(var(--chart-2))" name="Operating Expense" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Operating Expense Breakdown */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Operating Expense: Account Grouping Distribution</CardTitle>
              <CardDescription>Reporting Month: Year to date</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={operatingExpenseBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name.split(" ")[0]} (${percent}%)`}
                      labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                    >
                      {operatingExpenseBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Operating Expense Breakdown</CardTitle>
              <CardDescription>Detailed view by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={operatingExpenseBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9 }} />
                    <Tooltip 
                      formatter={(value: number, name: string, props: any) => [
                        `${formatCurrency(value)} (${props.payload.percent}%)`,
                        "Amount"
                      ]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {operatingExpenseBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gross Profit & Net Income Rolling */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Gross Profit: Rolling 12 Months</CardTitle>
              <CardDescription>Drill Down: Entity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={consolidatedIncomeData.map((d, i) => ({
                    ...d,
                    grossProfit: [4, 11, 27, 31, 32, 63, 69, 93, 102, 143, 289, 705][i] * 1000,
                    grossProfitPercent: [0, 0, 15, 25, 34, 36, 57, 60, 65, 69, 72, 87][i],
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={formatPercent} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name.includes("Percent") ? `${value}%` : formatCurrency(value),
                        name.includes("Percent") ? "Gross Profit %" : "Gross Profit"
                      ]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="grossProfit" fill="hsl(var(--success))" name="Gross Profit" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="grossProfitPercent" stroke="hsl(var(--chart-5))" name="Gross Profit %" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Net Income: Rolling 12 Months</CardTitle>
              <CardDescription>Drill Down: Entity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={consolidatedIncomeData.map((d, i) => ({
                    ...d,
                    netIncome: [-103, -99, -101, -78, -76, -67, -30, -202, -188, -175, 46, 596][i] * 1000,
                    netIncomePercent: [-228, -217, -270, -145, -120, -98, -82, -74, -49, -18, 10, 0][i],
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={formatPercent} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name.includes("Percent") ? `${value}%` : formatCurrency(value),
                        name.includes("Percent") ? "Net Income %" : "Net Income"
                      ]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="netIncome" fill="hsl(var(--primary))" name="Net Income" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="netIncomePercent" stroke="hsl(var(--chart-2))" name="Net Income %" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Income (YTD)</p>
                  <p className="text-2xl font-bold text-foreground">$2.06M</p>
                </div>
                <div className="p-2 rounded-full bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
              </div>
              <p className="text-xs text-success mt-2">+4.0% vs prior month</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Expense (TTM)</p>
                  <p className="text-2xl font-bold text-foreground">$401k</p>
                </div>
                <div className="p-2 rounded-full bg-destructive/10">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </div>
              </div>
              <p className="text-xs text-success mt-2">-19% vs prior month</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Gross Profit</p>
                  <p className="text-2xl font-bold text-foreground">$705k</p>
                </div>
                <div className="p-2 rounded-full bg-primary/10">
                  <Percent className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">87% margin</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Net Income</p>
                  <p className="text-2xl font-bold text-foreground">$596k</p>
                </div>
                <div className="p-2 rounded-full bg-success/10">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
              </div>
              <p className="text-xs text-success mt-2">Profitable this month</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}