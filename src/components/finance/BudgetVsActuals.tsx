import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { 
  Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  ArrowUpRight, ArrowDownRight, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, 
  ResponsiveContainer, Legend, ReferenceLine, ComposedChart, Line
} from "recharts";

interface BudgetLine {
  category: string;
  lineItem: string;
  budget: number;
  actual: number;
}

const sampleData: BudgetLine[] = [
  { category: 'Revenue', lineItem: 'Product Revenue', budget: 120000, actual: 115000 },
  { category: 'Revenue', lineItem: 'Services Revenue', budget: 30000, actual: 35000 },
  { category: 'Revenue', lineItem: 'Other Revenue', budget: 5000, actual: 4200 },
  { category: 'COGS', lineItem: 'Cost of Goods Sold', budget: 55000, actual: 58000 },
  { category: 'COGS', lineItem: 'Direct Labor', budget: 20000, actual: 19500 },
  { category: 'OpEx', lineItem: 'Salaries & Wages', budget: 45000, actual: 46200 },
  { category: 'OpEx', lineItem: 'Marketing & Ads', budget: 15000, actual: 18000 },
  { category: 'OpEx', lineItem: 'Rent & Utilities', budget: 8000, actual: 7800 },
  { category: 'OpEx', lineItem: 'Software & Tools', budget: 5000, actual: 6200 },
  { category: 'OpEx', lineItem: 'Travel & Entertainment', budget: 3000, actual: 4500 },
  { category: 'OpEx', lineItem: 'Professional Fees', budget: 4000, actual: 3800 },
  { category: 'Other', lineItem: 'Interest Expense', budget: 2500, actual: 2500 },
  { category: 'Other', lineItem: 'Depreciation', budget: 3000, actual: 3000 },
];

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export function BudgetVsActuals({ className }: { className?: string }) {
  const [period, setPeriod] = useState('current');
  const [threshold, setThreshold] = useState(10);

  const analysis = useMemo(() => {
    const lines = sampleData.map(line => {
      const variance = line.actual - line.budget;
      const variancePct = line.budget !== 0 ? (variance / Math.abs(line.budget)) * 100 : 0;
      const isRevenue = line.category === 'Revenue';
      const isFavorable = isRevenue ? variance >= 0 : variance <= 0;
      const isAlert = Math.abs(variancePct) > threshold;
      return { ...line, variance, variancePct, isFavorable, isAlert };
    });

    const totalBudget = lines.reduce((s, l) => s + (l.category === 'Revenue' ? l.budget : -l.budget), 0);
    const totalActual = lines.reduce((s, l) => s + (l.category === 'Revenue' ? l.actual : -l.actual), 0);
    const totalVariance = totalActual - totalBudget;
    const totalVariancePct = totalBudget !== 0 ? (totalVariance / Math.abs(totalBudget)) * 100 : 0;

    const alerts = lines.filter(l => l.isAlert);
    const favorable = lines.filter(l => l.isFavorable);
    const unfavorable = lines.filter(l => !l.isFavorable);

    return { lines, totalBudget, totalActual, totalVariance, totalVariancePct, alerts, favorable, unfavorable };
  }, [threshold]);

  const chartData = useMemo(() => {
    const categories = [...new Set(sampleData.map(d => d.category))];
    return categories.map(cat => {
      const items = sampleData.filter(d => d.category === cat);
      return {
        category: cat,
        budget: items.reduce((s, i) => s + i.budget, 0),
        actual: items.reduce((s, i) => s + i.actual, 0),
        variance: items.reduce((s, i) => s + (i.actual - i.budget), 0),
      };
    });
  }, []);

  const waterfallData = useMemo(() => {
    const data: { name: string; positive: number; negative: number; base: number }[] = [];
    let running = analysis.totalBudget;
    data.push({ name: 'Budget', positive: running, negative: 0, base: 0 });
    
    const grouped = [...new Set(analysis.lines.map(l => l.category))].map(cat => ({
      category: cat,
      variance: analysis.lines.filter(l => l.category === cat).reduce((s, l) => {
        const v = l.actual - l.budget;
        return s + (l.category === 'Revenue' ? v : -v);
      }, 0),
    }));

    grouped.forEach(g => {
      if (g.variance >= 0) {
        data.push({ name: g.category, positive: g.variance, negative: 0, base: running });
        running += g.variance;
      } else {
        data.push({ name: g.category, positive: 0, negative: Math.abs(g.variance), base: running + g.variance });
        running += g.variance;
      }
    });

    data.push({ name: 'Actual', positive: running, negative: 0, base: 0 });
    return data;
  }, [analysis]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Budget (Net)</p>
            <p className="text-lg font-bold">{formatCurrency(analysis.totalBudget)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Actual (Net)</p>
            <p className="text-lg font-bold">{formatCurrency(analysis.totalActual)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Variance</p>
              {analysis.totalVariance >= 0 
                ? <ArrowUpRight className="h-3 w-3 text-success" />
                : <ArrowDownRight className="h-3 w-3 text-destructive" />
              }
            </div>
            <p className={cn("text-lg font-bold", analysis.totalVariance >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(analysis.totalVariance)}
            </p>
            <p className={cn("text-xs", analysis.totalVariance >= 0 ? "text-success" : "text-destructive")}>
              {analysis.totalVariancePct > 0 ? '+' : ''}{analysis.totalVariancePct.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Alerts</p>
              <AlertTriangle className="h-3 w-3 text-warning" />
            </div>
            <p className="text-lg font-bold">{analysis.alerts.length}</p>
            <p className="text-xs text-muted-foreground">exceeding {threshold}% threshold</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Budget vs Actual by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11 }} />
                  <ReTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="budget" name="Budget" fill="hsl(var(--muted-foreground) / 0.4)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Variance Waterfall</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11 }} />
                  <ReTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="base" stackId="a" fill="transparent" />
                  <Bar dataKey="positive" stackId="a" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Favorable" />
                  <Bar dataKey="negative" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Unfavorable" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Line Item Variance Detail
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Alert threshold:</Label>
              <Select value={threshold.toString()} onValueChange={v => setThreshold(parseInt(v))}>
                <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  <SelectItem value="15">15%</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance $</TableHead>
                <TableHead className="text-right">Variance %</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.lines.map((line, i) => (
                <TableRow key={i} className={cn(line.isAlert && "bg-destructive/5")}>
                  <TableCell className="text-xs text-muted-foreground">{line.category}</TableCell>
                  <TableCell className="text-xs font-medium">{line.lineItem}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(line.budget)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(line.actual)}</TableCell>
                  <TableCell className={cn("text-right text-xs font-mono", line.isFavorable ? "text-success" : "text-destructive")}>
                    {line.variance > 0 ? '+' : ''}{formatCurrency(line.variance)}
                  </TableCell>
                  <TableCell className={cn("text-right text-xs font-mono", line.isFavorable ? "text-success" : "text-destructive")}>
                    {line.variancePct > 0 ? '+' : ''}{line.variancePct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    {line.isAlert ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" />
                    ) : line.isFavorable ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success mx-auto" />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">On Track</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
