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
import { TrendingUp, TrendingDown, DollarSign, Percent, Building2, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetricsData } from "@/hooks/useMetricsData";

// Generate rolling 12 months labels
const generateMonthLabels = () => {
  const labels = [];
  for (let i = 11; i >= 0; i--) {
    labels.push(format(subMonths(new Date(), i), "MMM-yy"));
  }
  return labels;
};

const monthLabels = generateMonthLabels();

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
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value: number) => `${value}%`;

export default function Metrics() {
  const [reportingMonth, setReportingMonth] = useState(format(new Date(), "MMM-yy"));
  const { data: metrics, isLoading, error } = useMetricsData();

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Deal Metrics | 5thLine</title>
        </Helmet>
        <div className="container mx-auto py-6 px-4 space-y-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading metrics...</span>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            <Skeleton className="h-[350px] lg:col-span-2" />
            <Skeleton className="h-[350px]" />
          </div>
        </div>
      </>
    );
  }

  // Calculate variance
  const valueVariance = metrics.currentMonthValue - metrics.previousMonthValue;
  const feesVariance = metrics.currentMonthFees - metrics.previousMonthFees;
  const valueChangePercent = metrics.previousMonthValue > 0 
    ? ((valueVariance / metrics.previousMonthValue) * 100).toFixed(1)
    : '0';
  const feesChangePercent = metrics.previousMonthFees > 0
    ? ((feesVariance / metrics.previousMonthFees) * 100).toFixed(1)
    : '0';

  // Prepare chart data
  const closedValueData = metrics.monthlyData.map(d => ({
    month: d.month,
    closedWon: d.closedWonValue,
    fees: d.totalFees,
    dealCount: d.dealCount,
  }));

  const periodOverPeriodData = [
    { 
      category: "Closed Value", 
      previous: metrics.previousMonthValue, 
      current: metrics.currentMonthValue, 
      variance: valueVariance 
    },
    { 
      category: "Fees Earned", 
      previous: metrics.previousMonthFees, 
      current: metrics.currentMonthFees, 
      variance: feesVariance 
    },
  ];

  return (
    <>
      <Helmet>
        <title>Deal Metrics | 5thLine</title>
      </Helmet>
      <div className="container mx-auto py-6 px-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Deal Metrics</h1>
              <Badge variant="outline" className="text-sm">
                <Calendar className="h-3 w-3 mr-1" />
                {format(new Date(), "MMM, yyyy")}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Pipeline performance analytics powered by real deal data
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

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Pipeline</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(metrics.totalPipelineValue)}</p>
                </div>
                <div className="p-2 rounded-full bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{metrics.activeDealsCount} active deals</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Closed Won (All Time)</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(metrics.totalClosedWonValue)}</p>
                </div>
                <div className="p-2 rounded-full bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{metrics.closedWonCount} deals closed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Fees Earned</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(metrics.totalFees)}</p>
                </div>
                <div className="p-2 rounded-full bg-chart-2/10">
                  <DollarSign className="h-5 w-5 text-chart-2" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">From closed deals</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Deal Size</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(metrics.avgDealSize)}</p>
                </div>
                <div className="p-2 rounded-full bg-chart-4/10">
                  <Percent className="h-5 w-5 text-chart-4" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Based on closed deals</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Row: Closed Value & Stage Breakdown */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Closed Value: Rolling 12 Months */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Closed Deal Value: Rolling 12 Months</CardTitle>
              <CardDescription>Monthly closed-won value and fees earned</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={closedValueData}>
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
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === "closedWon" ? "Closed Value" : "Fees Earned"
                      ]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="closedWon" fill="hsl(var(--primary))" name="Closed Value" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="fees" stroke="hsl(var(--chart-2))" name="Fees Earned" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Stage Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Pipeline by Stage</CardTitle>
              <CardDescription>Current deal distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.stageBreakdown.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="stage" type="category" width={100} tick={{ fontSize: 9 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Value"]}
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

        {/* Deal Count by Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Deal Activity: Rolling 12 Months</CardTitle>
            <CardDescription>Number of deals updated per month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={closedValueData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: number) => [value, "Deals"]}
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Bar dataKey="dealCount" fill="hsl(var(--chart-3))" name="Deal Activity" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Period over Period Analysis */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Closed Value: Period over Period</CardTitle>
              <CardDescription>Current month vs previous month</CardDescription>
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
                    <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name={format(subMonths(new Date(), 1), "MMM-yy")} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" fill="hsl(var(--primary))" name={format(new Date(), "MMM-yy")} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="variance" fill={valueVariance >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} name="Variance" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className={`text-sm mt-2 ${Number(valueChangePercent) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {Number(valueChangePercent) >= 0 ? '+' : ''}{valueChangePercent}% vs prior month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Fees Earned: Period over Period</CardTitle>
              <CardDescription>Current month vs previous month</CardDescription>
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
                    <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name={format(subMonths(new Date(), 1), "MMM-yy")} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" fill="hsl(var(--chart-2))" name={format(new Date(), "MMM-yy")} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="variance" fill={feesVariance >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} name="Variance" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className={`text-sm mt-2 ${Number(feesChangePercent) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {Number(feesChangePercent) >= 0 ? '+' : ''}{feesChangePercent}% vs prior month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* YTD Trend & QTD */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Closed Value: YTD Cumulative</CardTitle>
              <CardDescription>Year-to-date closed deal value (cumulative)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={metrics.ytdData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Cumulative Value"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="closedWonValue" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" name="YTD Value" />
                    <Line type="monotone" dataKey="closedWonValue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Closed Value: QTD</CardTitle>
              <CardDescription>Quarter-to-date performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.quarterlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Closed Value"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Bar dataKey="closedWonValue" fill="hsl(var(--primary))" name="Monthly Closed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Deal Type & Manager Performance */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Pipeline by Deal Type</CardTitle>
              <CardDescription>Value distribution by deal type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                {metrics.dealTypeBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.dealTypeBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="type"
                        label={({ type, percent }) => `${type} (${percent}%)`}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                      >
                        {metrics.dealTypeBreakdown.map((_, index) => (
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
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No deal type data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Manager Performance</CardTitle>
              <CardDescription>Closed-won value by manager</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                {metrics.managerPerformance.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.managerPerformance} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="manager" type="category" width={100} tick={{ fontSize: 9 }} />
                      <Tooltip 
                        formatter={(value: number, name: string, props: any) => [
                          `${formatCurrency(value)} (${props.payload.dealCount} deals)`,
                          "Closed Value"
                        ]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="closedWonValue" radius={[0, 4, 4, 0]}>
                        {metrics.managerPerformance.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No manager data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stage Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Pipeline Stage Breakdown</CardTitle>
            <CardDescription>Deal count and value by current stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metrics.stageBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="stage" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      name === "value" ? formatCurrency(value) : value,
                      name === "value" ? "Pipeline Value" : "Deal Count"
                    ]}
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="value" fill="hsl(var(--primary))" name="Pipeline Value" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" name="Deal Count" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
