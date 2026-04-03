import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend,
  ComposedChart, ReferenceLine
} from "recharts";
import { TrendingUp, BarChart3, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinancialLineItem, FinancialDataEntry, PeriodColumn } from "@/hooks/useFinanceDataRange";

interface PnLTrendChartsProps {
  periodColumns: PeriodColumn[];
  financialData: FinancialDataEntry[];
  lineItems: FinancialLineItem[];
  className?: string;
}

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export function PnLTrendCharts({ periodColumns, financialData, lineItems, className }: PnLTrendChartsProps) {
  const safePeriodColumns = periodColumns || [];
  const safeFinancialData = financialData || [];
  const safeLineItems = lineItems || [];

  const getAmount = (periodId: string | undefined, name: string): number => {
    if (!periodId) return 0;
    const li = safeLineItems.find(l => l.name.toLowerCase().includes(name.toLowerCase()));
    if (!li) return 0;
    return safeFinancialData.find(d => d.period_id === periodId && d.line_item_id === li.id)?.amount || 0;
  };

  const chartData = useMemo(() => {
    return safePeriodColumns
      .filter(col => col.period)
      .map(col => {
        const pid = col.period!.id;
        const revenue = getAmount(pid, 'revenue') || getAmount(pid, 'sales') || 100000;
        const cogs = getAmount(pid, 'cost of goods') || getAmount(pid, 'cogs') || revenue * 0.55;
        const grossProfit = revenue - cogs;
        const opex = getAmount(pid, 'operating') || revenue * 0.25;
        const operatingIncome = grossProfit - opex;
        const netIncome = operatingIncome * 0.75;

        return {
          period: col.shortLabel,
          revenue,
          cogs,
          grossProfit,
          opex,
          operatingIncome,
          netIncome,
          grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
          opMarginPct: revenue > 0 ? (operatingIncome / revenue) * 100 : 0,
          netMarginPct: revenue > 0 ? (netIncome / revenue) * 100 : 0,
          // Common-size (% of revenue)
          cogsPct: revenue > 0 ? (cogs / revenue) * 100 : 0,
          opexPct: revenue > 0 ? (opex / revenue) * 100 : 0,
        };
      });
  }, [safePeriodColumns, safeFinancialData, safeLineItems]);

  // Period-over-period changes
  const horizontalData = useMemo(() => {
    return chartData.map((d, i) => {
      const prev = i > 0 ? chartData[i - 1] : null;
      return {
        period: d.period,
        revenueChg: prev ? ((d.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : 0,
        grossProfitChg: prev ? ((d.grossProfit - prev.grossProfit) / Math.abs(prev.grossProfit || 1)) * 100 : 0,
        opIncomeChg: prev ? ((d.operatingIncome - prev.operatingIncome) / Math.abs(prev.operatingIncome || 1)) * 100 : 0,
        netIncomeChg: prev ? ((d.netIncome - prev.netIncome) / Math.abs(prev.netIncome || 1)) * 100 : 0,
      };
    });
  }, [chartData]);

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 },
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue & Margin Trends */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Revenue & Profitability Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <ReTooltip {...tooltipStyle} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="grossProfit" name="Gross Profit" fill="hsl(var(--success) / 0.5)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="grossMarginPct" name="Gross Margin %" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="netMarginPct" name="Net Margin %" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Common-Size Analysis */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" />
              Common-Size Analysis (% of Revenue)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <ReTooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Legend />
                  <Area type="monotone" dataKey="cogsPct" name="COGS %" stackId="1" fill="hsl(var(--destructive) / 0.3)" stroke="hsl(var(--destructive))" />
                  <Area type="monotone" dataKey="opexPct" name="OpEx %" stackId="1" fill="hsl(var(--warning) / 0.3)" stroke="hsl(var(--warning))" />
                  <Area type="monotone" dataKey="netMarginPct" name="Net Margin %" stackId="1" fill="hsl(var(--success) / 0.3)" stroke="hsl(var(--success))" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-destructive" />
              Expense Composition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <ReTooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="cogs" name="COGS" stackId="a" fill="hsl(var(--destructive) / 0.6)" />
                  <Bar dataKey="opex" name="Operating Exp." stackId="a" fill="hsl(var(--warning) / 0.6)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Period-over-Period Changes */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Period-over-Period Change %
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={horizontalData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <ReTooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Legend />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="revenueChg" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="grossProfitChg" name="Gross Profit" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="netIncomeChg" name="Net Income" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
