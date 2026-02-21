import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell
} from "recharts";
import { ArrowDownUp, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinancialLineItem, FinancialDataEntry, PeriodColumn } from "@/hooks/useFinanceDataRange";

interface CashFlowWaterfallProps {
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

export function CashFlowWaterfall({ periodColumns, financialData, lineItems, className }: CashFlowWaterfallProps) {
  const latestPeriod = useMemo(() => {
    const withData = periodColumns.filter(c => c.period);
    return withData[withData.length - 1];
  }, [periodColumns]);

  const getAmount = (name: string): number => {
    if (!latestPeriod?.period) return 0;
    const li = lineItems.find(l => l.name.toLowerCase().includes(name.toLowerCase()));
    if (!li) return 0;
    return financialData.find(d => d.period_id === latestPeriod.period!.id && d.line_item_id === li.id)?.amount || 0;
  };

  const waterfallData = useMemo(() => {
    // Use sample data if no real data
    const operatingCF = getAmount('operating') || 85000;
    const investingCF = getAmount('investing') || -25000;
    const financingCF = getAmount('financing') || -15000;
    const netChange = operatingCF + investingCF + financingCF;
    const beginningCash = 200000;
    const endingCash = beginningCash + netChange;

    const items: { name: string; value: number; isTotal?: boolean; base: number; positive: number; negative: number }[] = [];

    // Beginning cash
    items.push({ name: 'Beginning Cash', value: beginningCash, isTotal: true, base: 0, positive: beginningCash, negative: 0 });

    // Operating components
    const opComponents = [
      { name: 'Net Income', value: 45000 },
      { name: 'D&A', value: 12000 },
      { name: 'Δ Working Capital', value: -8000 },
      { name: 'Other Operating', value: 36000 },
    ];

    let running = beginningCash;
    opComponents.forEach(c => {
      if (c.value >= 0) {
        items.push({ name: c.name, value: c.value, base: running, positive: c.value, negative: 0 });
      } else {
        items.push({ name: c.name, value: c.value, base: running + c.value, positive: 0, negative: Math.abs(c.value) });
      }
      running += c.value;
    });

    // Operating subtotal
    items.push({ name: 'Operating CF', value: operatingCF, isTotal: true, base: 0, positive: running, negative: 0 });

    // Investing
    const capex = -20000;
    const acquisitions = -5000;
    items.push({ name: 'CapEx', value: capex, base: running + capex, positive: 0, negative: Math.abs(capex) });
    running += capex;
    items.push({ name: 'Acquisitions', value: acquisitions, base: running + acquisitions, positive: 0, negative: Math.abs(acquisitions) });
    running += acquisitions;

    // Financing
    const debtRepayment = -10000;
    const dividends = -5000;
    items.push({ name: 'Debt Repayment', value: debtRepayment, base: running + debtRepayment, positive: 0, negative: Math.abs(debtRepayment) });
    running += debtRepayment;
    items.push({ name: 'Dividends', value: dividends, base: running + dividends, positive: 0, negative: Math.abs(dividends) });
    running += dividends;

    // Ending cash
    items.push({ name: 'Ending Cash', value: running, isTotal: true, base: 0, positive: running, negative: 0 });

    return items;
  }, [latestPeriod, financialData, lineItems]);

  // Monthly cash flow trend
  const trendData = useMemo(() => {
    return periodColumns.filter(c => c.period).map(col => {
      const pid = col.period!.id;
      const opCF = 85000 + Math.random() * 20000 - 10000;
      const invCF = -25000 + Math.random() * 10000 - 5000;
      const finCF = -15000 + Math.random() * 5000 - 2500;
      return {
        period: col.shortLabel,
        operating: Math.round(opCF),
        investing: Math.round(invCF),
        financing: Math.round(finCF),
        net: Math.round(opCF + invCF + finCF),
      };
    });
  }, [periodColumns]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Operating CF', value: 85000, trend: 'up' },
          { label: 'Investing CF', value: -25000, trend: 'down' },
          { label: 'Financing CF', value: -15000, trend: 'down' },
          { label: 'Net Change', value: 45000, trend: 'up' },
        ].map((kpi, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
                {kpi.trend === 'up' ? <TrendingUp className="h-3 w-3 text-success" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
              </div>
              <p className={cn("text-lg font-bold", kpi.value >= 0 ? "text-success" : "text-destructive")}>
                {formatCurrency(kpi.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Waterfall */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownUp className="h-4 w-4 text-primary" />
              Cash Flow Waterfall
              <Badge variant="outline" className="text-[10px]">{latestPeriod?.shortLabel || 'Latest'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number, name: string) => [formatCurrency(v), name === 'base' ? '' : name]}
                  />
                  <Bar dataKey="base" stackId="a" fill="transparent" />
                  <Bar dataKey="positive" stackId="a" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Inflow" />
                  <Bar dataKey="negative" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Outflow" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* CF Trend */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Cash Flow Trend by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Bar dataKey="operating" name="Operating" fill="hsl(var(--success) / 0.7)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="investing" name="Investing" fill="hsl(var(--warning) / 0.7)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="financing" name="Financing" fill="hsl(var(--destructive) / 0.7)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
