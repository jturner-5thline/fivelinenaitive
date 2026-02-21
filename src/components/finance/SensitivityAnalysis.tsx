import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Grid3X3, Target, Fuel, TrendingUp, DollarSign, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const variables = [
  { key: 'revenueGrowth', label: 'Revenue Growth %' },
  { key: 'grossMargin', label: 'Gross Margin %' },
  { key: 'opexGrowth', label: 'OpEx Growth %' },
  { key: 'churnRate', label: 'Churn Rate %' },
  { key: 'avgDealSize', label: 'Avg Deal Size' },
  { key: 'newCustomers', label: 'New Customers/mo' },
];

const outputs = [
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'netIncome', label: 'Net Income' },
  { key: 'fcf', label: 'Free Cash Flow' },
  { key: 'revenue', label: 'Revenue' },
];

interface SensitivityAnalysisProps {
  baseRevenue?: number;
  className?: string;
}

export function SensitivityAnalysis({ baseRevenue = 1200000, className }: SensitivityAnalysisProps) {
  const [rowVar, setRowVar] = useState('revenueGrowth');
  const [colVar, setColVar] = useState('grossMargin');
  const [outputMetric, setOutputMetric] = useState('ebitda');
  const [baseValues, setBaseValues] = useState({
    revenueGrowth: 10, grossMargin: 45, opexGrowth: 5, churnRate: 2, avgDealSize: 50000, newCustomers: 5,
  });

  // Generate range values around base
  const generateRange = (base: number, steps: number = 5) => {
    const step = Math.max(Math.abs(base * 0.2), 1);
    const half = Math.floor(steps / 2);
    return Array.from({ length: steps }, (_, i) => Math.round((base + (i - half) * step) * 10) / 10);
  };

  const rowValues = useMemo(() => generateRange(baseValues[rowVar as keyof typeof baseValues]), [rowVar, baseValues]);
  const colValues = useMemo(() => generateRange(baseValues[colVar as keyof typeof baseValues]), [colVar, baseValues]);

  // Compute output for given variable overrides
  const computeOutput = (rowVal: number, colVal: number): number => {
    const vars = { ...baseValues, [rowVar]: rowVal, [colVar]: colVal };
    const annualRevenue = baseRevenue * (1 + vars.revenueGrowth / 100);
    const grossProfit = annualRevenue * (vars.grossMargin / 100);
    const opex = (annualRevenue * 0.3) * (1 + vars.opexGrowth / 100);
    const ebitda = grossProfit - opex;
    const netIncome = ebitda * 0.75;
    const fcf = ebitda * 0.65;

    switch (outputMetric) {
      case 'ebitda': return ebitda;
      case 'netIncome': return netIncome;
      case 'fcf': return fcf;
      case 'revenue': return annualRevenue;
      default: return ebitda;
    }
  };

  const baseOutput = computeOutput(baseValues[rowVar as keyof typeof baseValues], baseValues[colVar as keyof typeof baseValues]);

  // Cash runway
  const cashOnHand = 500000;
  const monthlyBurn = useMemo(() => {
    const annualRev = baseRevenue * (1 + baseValues.revenueGrowth / 100);
    const expenses = annualRev * (1 - baseValues.grossMargin / 100) + annualRev * 0.3;
    const monthlyNetBurn = (expenses - annualRev) / 12;
    return monthlyNetBurn > 0 ? monthlyNetBurn : 0;
  }, [baseRevenue, baseValues]);

  const runway = monthlyBurn > 0 ? Math.round(cashOnHand / monthlyBurn) : Infinity;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Cash Runway */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Fuel className="h-4 w-4 text-primary" />
            Cash Runway Calculator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cash on Hand</Label>
              <div className="text-lg font-bold">{formatCurrency(cashOnHand)}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Monthly Burn Rate</Label>
              <div className="text-lg font-bold text-destructive">
                {monthlyBurn > 0 ? formatCurrency(monthlyBurn) : '$0 (Profitable)'}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Runway</Label>
              <div className={cn("text-lg font-bold", runway > 12 ? "text-success" : runway > 6 ? "text-warning" : "text-destructive")}>
                {runway === Infinity ? '∞ (Profitable)' : `${runway} months`}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2">
                {runway > 18 ? (
                  <Badge variant="outline" className="text-success border-success/30">Healthy</Badge>
                ) : runway > 6 ? (
                  <Badge variant="outline" className="text-warning border-warning/30">Monitor</Badge>
                ) : (
                  <Badge variant="outline" className="text-destructive border-destructive/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />Critical
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sensitivity Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-primary" />
              Two-Variable Sensitivity Analysis
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Output:</Label>
                <Select value={outputMetric} onValueChange={setOutputMetric}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {outputs.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Variable selectors */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Row Variable (↓)</Label>
              <Select value={rowVar} onValueChange={setRowVar}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {variables.filter(v => v.key !== colVar).map(v => (
                    <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Column Variable (→)</Label>
              <Select value={colVar} onValueChange={setColVar}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {variables.filter(v => v.key !== rowVar).map(v => (
                    <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left border border-border/50 bg-muted/50 font-medium">
                    <span className="text-muted-foreground">{variables.find(v => v.key === rowVar)?.label} ↓ / {variables.find(v => v.key === colVar)?.label} →</span>
                  </th>
                  {colValues.map(cv => (
                    <th key={cv} className={cn(
                      "p-2 text-center border border-border/50 font-mono",
                      cv === baseValues[colVar as keyof typeof baseValues] ? "bg-primary/10 font-bold" : "bg-muted/30"
                    )}>
                      {cv}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowValues.map(rv => (
                  <tr key={rv}>
                    <td className={cn(
                      "p-2 border border-border/50 font-mono font-medium",
                      rv === baseValues[rowVar as keyof typeof baseValues] ? "bg-primary/10 font-bold" : "bg-muted/30"
                    )}>
                      {rv}
                    </td>
                    {colValues.map(cv => {
                      const value = computeOutput(rv, cv);
                      const diff = ((value - baseOutput) / Math.abs(baseOutput)) * 100;
                      const isBase = rv === baseValues[rowVar as keyof typeof baseValues] && cv === baseValues[colVar as keyof typeof baseValues];
                      return (
                        <td
                          key={cv}
                          className={cn(
                            "p-2 text-center border border-border/50 font-mono transition-colors",
                            isBase && "ring-2 ring-primary ring-inset font-bold",
                            !isBase && value > baseOutput * 1.1 && "bg-success/10 text-success",
                            !isBase && value < baseOutput * 0.9 && "bg-destructive/10 text-destructive",
                            !isBase && Math.abs(diff) <= 10 && "bg-muted/20",
                          )}
                        >
                          {formatCurrency(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-success/10 border border-success/30" />
              &gt;10% above base
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-destructive/10 border border-destructive/30" />
              &gt;10% below base
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded ring-2 ring-primary" />
              Base case
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
