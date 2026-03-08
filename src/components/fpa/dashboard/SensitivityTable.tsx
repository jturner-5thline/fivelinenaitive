import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmtCurrency = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}MM`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const VARIABLES = [
  { key: 'revenueGrowth', label: 'Revenue Growth %' },
  { key: 'grossMargin', label: 'Gross Margin %' },
  { key: 'opexGrowth', label: 'OpEx Growth %' },
  { key: 'churnRate', label: 'Churn Rate %' },
];

const OUTPUTS = [
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'netIncome', label: 'Net Income' },
  { key: 'fcf', label: 'Free Cash Flow' },
  { key: 'revenue', label: 'Revenue' },
];

const BASE = { revenueGrowth: 10, grossMargin: 45, opexGrowth: 5, churnRate: 2 };

export function SensitivityTable() {
  const baseRevenue = 1200000;
  const [rowVar, setRowVar] = useState('revenueGrowth');
  const [colVar, setColVar] = useState('grossMargin');
  const [outputMetric, setOutputMetric] = useState('ebitda');

  const generateRange = (base: number, steps = 5) => {
    const step = Math.max(Math.abs(base * 0.2), 1);
    const half = Math.floor(steps / 2);
    return Array.from({ length: steps }, (_, i) => Math.round((base + (i - half) * step) * 10) / 10);
  };

  const rowValues = useMemo(() => generateRange(BASE[rowVar as keyof typeof BASE]), [rowVar]);
  const colValues = useMemo(() => generateRange(BASE[colVar as keyof typeof BASE]), [colVar]);

  const compute = (rv: number, cv: number) => {
    const vars = { ...BASE, [rowVar]: rv, [colVar]: cv };
    const rev = baseRevenue * (1 + vars.revenueGrowth / 100);
    const gp = rev * (vars.grossMargin / 100);
    const opex = (rev * 0.3) * (1 + vars.opexGrowth / 100);
    const ebitda = gp - opex;
    switch (outputMetric) {
      case 'ebitda': return ebitda;
      case 'netIncome': return ebitda * 0.75;
      case 'fcf': return ebitda * 0.65;
      case 'revenue': return rev;
      default: return ebitda;
    }
  };

  const baseOutput = compute(BASE[rowVar as keyof typeof BASE], BASE[colVar as keyof typeof BASE]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Grid3X3 className="h-4 w-4 text-primary" />
            Two-Variable Sensitivity
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Output:</Label>
            <Select value={outputMetric} onValueChange={setOutputMetric}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTPUTS.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Row Variable (↓)</Label>
            <Select value={rowVar} onValueChange={setRowVar}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VARIABLES.filter(v => v.key !== colVar).map(v => (
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
                {VARIABLES.filter(v => v.key !== rowVar).map(v => (
                  <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-2 text-left border border-border/50 bg-muted/50 font-medium">
                  <span className="text-muted-foreground text-[10px]">
                    {VARIABLES.find(v => v.key === rowVar)?.label} ↓ / {VARIABLES.find(v => v.key === colVar)?.label} →
                  </span>
                </th>
                {colValues.map(cv => (
                  <th key={cv} className={cn(
                    "p-2 text-center border border-border/50 font-mono",
                    cv === BASE[colVar as keyof typeof BASE] ? "bg-primary/10 font-bold" : "bg-muted/30"
                  )}>{cv}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowValues.map(rv => (
                <tr key={rv}>
                  <td className={cn(
                    "p-2 border border-border/50 font-mono font-medium",
                    rv === BASE[rowVar as keyof typeof BASE] ? "bg-primary/10 font-bold" : "bg-muted/30"
                  )}>{rv}</td>
                  {colValues.map(cv => {
                    const value = compute(rv, cv);
                    const diff = ((value - baseOutput) / Math.abs(baseOutput)) * 100;
                    const isBase = rv === BASE[rowVar as keyof typeof BASE] && cv === BASE[colVar as keyof typeof BASE];
                    return (
                      <td key={cv} className={cn(
                        "p-2 text-center border border-border/50 font-mono transition-colors",
                        isBase && "ring-2 ring-primary ring-inset font-bold",
                        !isBase && value > baseOutput * 1.1 && "bg-success/10 text-success",
                        !isBase && value < baseOutput * 0.9 && "bg-destructive/10 text-destructive",
                        !isBase && Math.abs(diff) <= 10 && "bg-muted/20",
                      )}>
                        {fmtCurrency(value)}
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
  );
}
