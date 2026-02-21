import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Target, Search, ArrowRight, CheckCircle, AlertTriangle, Zap,
  TrendingDown, TrendingUp, Shield, Fuel
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

// ===== GOAL SEEK =====
interface GoalSeekProps {
  className?: string;
}

const goalMetrics = [
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'netIncome', label: 'Net Income' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'fcf', label: 'Free Cash Flow' },
  { key: 'grossMargin', label: 'Gross Margin %' },
];

const goalVariables = [
  { key: 'revenueGrowth', label: 'Revenue Growth Rate %', current: 10 },
  { key: 'grossMargin', label: 'Gross Margin %', current: 45 },
  { key: 'opexReduction', label: 'OpEx Reduction %', current: 0 },
  { key: 'priceIncrease', label: 'Price Increase %', current: 0 },
  { key: 'headcountChange', label: 'Headcount Change', current: 0 },
  { key: 'churnReduction', label: 'Churn Reduction %', current: 0 },
];

export function GoalSeek({ className }: GoalSeekProps) {
  const [targetMetric, setTargetMetric] = useState('ebitda');
  const [targetValue, setTargetValue] = useState(200000);
  const [solveVariable, setSolveVariable] = useState('revenueGrowth');
  const [baseRevenue] = useState(1200000);
  const [solved, setSolved] = useState(false);

  const result = useMemo(() => {
    // Binary search to find the variable value that hits the target
    const compute = (varValue: number): number => {
      let rev = baseRevenue;
      let gm = 45;
      let opexMult = 1;

      if (solveVariable === 'revenueGrowth') rev = baseRevenue * (1 + varValue / 100);
      else if (solveVariable === 'grossMargin') gm = varValue;
      else if (solveVariable === 'opexReduction') opexMult = 1 - varValue / 100;
      else if (solveVariable === 'priceIncrease') rev = baseRevenue * (1 + varValue / 100);

      const grossProfit = rev * (gm / 100);
      const opex = rev * 0.3 * opexMult;
      const ebitda = grossProfit - opex;
      const netIncome = ebitda * 0.75;
      const fcf = ebitda * 0.65;

      switch (targetMetric) {
        case 'ebitda': return ebitda;
        case 'netIncome': return netIncome;
        case 'revenue': return rev;
        case 'fcf': return fcf;
        case 'grossMargin': return (grossProfit / rev) * 100;
        default: return ebitda;
      }
    };

    let lo = -50, hi = 200;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const val = compute(mid);
      if (val < targetValue) lo = mid;
      else hi = mid;
    }

    const solvedValue = (lo + hi) / 2;
    const currentVar = goalVariables.find(v => v.key === solveVariable)?.current || 0;
    const currentOutput = compute(currentVar);
    const gap = targetValue - currentOutput;

    return { solvedValue: Math.round(solvedValue * 100) / 100, currentOutput, gap, currentVar };
  }, [targetMetric, targetValue, solveVariable, baseRevenue]);

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Goal Seek
          <Badge variant="outline" className="text-[10px]">What-If Solver</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">I want to achieve...</Label>
            <Select value={targetMetric} onValueChange={setTargetMetric}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {goalMetrics.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Target value</Label>
            <Input
              type="number" value={targetValue}
              onChange={e => setTargetValue(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">By changing...</Label>
            <Select value={solveVariable} onValueChange={setSolveVariable}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {goalVariables.map(v => <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Current {goalVariables.find(v => v.key === solveVariable)?.label}</p>
            <p className="text-lg font-bold">{result.currentVar}</p>
          </div>
          <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 flex flex-col items-center justify-center">
            <ArrowRight className="h-5 w-5 text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Change to</p>
          </div>
          <div className="p-3 rounded-lg border border-success/30 bg-success/5">
            <p className="text-xs text-muted-foreground mb-1">Required Value</p>
            <p className="text-lg font-bold text-success">{result.solvedValue}</p>
            <p className="text-[10px] text-muted-foreground">
              Gap: {formatCurrency(Math.abs(result.gap))} {result.gap > 0 ? 'short' : 'surplus'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== CASH FLOW STRESS TESTS =====
interface StressTestScenario {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  shocks: { label: string; impact: number; type: 'revenue' | 'expense' | 'timing' }[];
}

const stressScenarios: StressTestScenario[] = [
  {
    id: 'revenue-drop', name: 'Revenue Shock', description: '30% revenue decline over 3 months',
    icon: <TrendingDown className="h-4 w-4 text-destructive" />,
    shocks: [
      { label: 'Revenue decline', impact: -30, type: 'revenue' },
      { label: 'Customer churn spike', impact: -10, type: 'revenue' },
    ],
  },
  {
    id: 'dso-spike', name: 'Collections Crisis', description: 'DSO increases to 90 days',
    icon: <Fuel className="h-4 w-4 text-warning" />,
    shocks: [
      { label: 'DSO increase to 90 days', impact: -45, type: 'timing' },
      { label: 'Bad debt write-off', impact: -5, type: 'revenue' },
    ],
  },
  {
    id: 'key-customer', name: 'Key Customer Loss', description: 'Top 3 customers leave',
    icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
    shocks: [
      { label: 'Top customer loss (20% rev)', impact: -20, type: 'revenue' },
      { label: 'Second customer loss (12%)', impact: -12, type: 'revenue' },
      { label: 'Third customer loss (8%)', impact: -8, type: 'revenue' },
    ],
  },
  {
    id: 'cost-surge', name: 'Cost Surge', description: 'Labor +20%, materials +15%',
    icon: <TrendingUp className="h-4 w-4 text-warning" />,
    shocks: [
      { label: 'Labor cost increase', impact: 20, type: 'expense' },
      { label: 'Materials cost increase', impact: 15, type: 'expense' },
    ],
  },
];

export function CashFlowStressTests({ className }: { className?: string }) {
  const [selectedScenario, setSelectedScenario] = useState<string>('revenue-drop');
  const baseMonthlyRevenue = 100000;
  const baseMonthlyExpenses = 85000;
  const baseCash = 500000;

  const results = useMemo(() => {
    const scenario = stressScenarios.find(s => s.id === selectedScenario)!;
    let revImpact = 0, expImpact = 0, timingImpact = 0;
    scenario.shocks.forEach(s => {
      if (s.type === 'revenue') revImpact += s.impact;
      if (s.type === 'expense') expImpact += s.impact;
      if (s.type === 'timing') timingImpact += s.impact;
    });

    const monthlyData: { month: number; revenue: number; expenses: number; netCF: number; cash: number; baselineCash: number }[] = [];
    let cash = baseCash;
    let baselineCash = baseCash;

    for (let m = 1; m <= 12; m++) {
      const stressedRev = baseMonthlyRevenue * (1 + revImpact / 100);
      const stressedExp = baseMonthlyExpenses * (1 + expImpact / 100);
      const timingDrain = m <= 3 ? baseCash * (timingImpact / 100) / 3 : 0;
      const netCF = stressedRev - stressedExp + timingDrain;
      cash += netCF;
      baselineCash += (baseMonthlyRevenue - baseMonthlyExpenses);
      monthlyData.push({ month: m, revenue: stressedRev, expenses: stressedExp, netCF, cash: Math.max(cash, 0), baselineCash });
    }

    const breakEvenMonth = monthlyData.findIndex(m => m.cash <= 0);
    const runway = breakEvenMonth === -1 ? Infinity : breakEvenMonth + 1;
    const maxDrawdown = Math.min(...monthlyData.map(m => m.cash)) - baseCash;
    const recoveryMonth = monthlyData.findIndex((m, i) => i > 0 && m.cash > baseCash);

    return { monthlyData, runway, maxDrawdown, recoveryMonth: recoveryMonth === -1 ? null : recoveryMonth + 1 };
  }, [selectedScenario]);

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-warning" />
          Cash Flow Stress Tests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scenario selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stressScenarios.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedScenario(s.id)}
              className={cn(
                "p-3 rounded-lg border text-left transition-all",
                s.id === selectedScenario
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border"
              )}
            >
              <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs font-medium">{s.name}</span></div>
              <p className="text-[10px] text-muted-foreground">{s.description}</p>
            </button>
          ))}
        </div>

        {/* Impact summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
            <p className="text-xs text-muted-foreground">Runway Under Stress</p>
            <p className={cn("text-lg font-bold", results.runway > 12 ? "text-success" : results.runway > 6 ? "text-warning" : "text-destructive")}>
              {results.runway === Infinity ? '∞' : `${results.runway} mo`}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
            <p className="text-xs text-muted-foreground">Max Cash Drawdown</p>
            <p className="text-lg font-bold text-destructive">{formatCurrency(results.maxDrawdown)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
            <p className="text-xs text-muted-foreground">Recovery Month</p>
            <p className="text-lg font-bold">{results.recoveryMonth ? `M${results.recoveryMonth}` : 'N/A'}</p>
          </div>
        </div>

        {/* Monthly projection under stress */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net CF</TableHead>
                <TableHead className="text-right">Cash (Stressed)</TableHead>
                <TableHead className="text-right">Cash (Baseline)</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.monthlyData.map(m => (
                <TableRow key={m.month} className={cn(m.cash <= 0 && "bg-destructive/10")}>
                  <TableCell className="text-xs font-medium">M{m.month}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(m.revenue)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(m.expenses)}</TableCell>
                  <TableCell className={cn("text-right text-xs font-mono", m.netCF >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(m.netCF)}
                  </TableCell>
                  <TableCell className={cn("text-right text-xs font-mono font-semibold", m.cash <= 50000 ? "text-destructive" : "")}>
                    {formatCurrency(m.cash)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-muted-foreground">{formatCurrency(m.baselineCash)}</TableCell>
                  <TableCell className="text-center">
                    {m.cash <= 0 ? (
                      <Badge variant="destructive" className="text-[10px]">Insolvent</Badge>
                    ) : m.cash <= 50000 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 text-success mx-auto" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== COVENANT COMPLIANCE =====
interface Covenant {
  id: string;
  name: string;
  description: string;
  metric: string;
  threshold: number;
  direction: 'min' | 'max';
  currentValue: number;
  unit: string;
}

const sampleCovenants: Covenant[] = [
  { id: 'dscr', name: 'Debt Service Coverage', description: 'EBITDA / Total Debt Service', metric: 'DSCR', threshold: 1.25, direction: 'min', currentValue: 1.8, unit: 'x' },
  { id: 'leverage', name: 'Leverage Ratio', description: 'Total Debt / EBITDA', metric: 'Leverage', threshold: 3.5, direction: 'max', currentValue: 2.1, unit: 'x' },
  { id: 'min-cash', name: 'Minimum Cash', description: 'Unrestricted cash balance', metric: 'Cash', threshold: 200000, direction: 'min', currentValue: 500000, unit: '$' },
  { id: 'current-ratio', name: 'Current Ratio', description: 'Current Assets / Current Liabilities', metric: 'Current Ratio', threshold: 1.1, direction: 'min', currentValue: 1.6, unit: 'x' },
  { id: 'capex', name: 'CapEx Limit', description: 'Annual capital expenditures', metric: 'CapEx', threshold: 150000, direction: 'max', currentValue: 95000, unit: '$' },
  { id: 'fixed-charge', name: 'Fixed Charge Coverage', description: 'EBITDA / (Interest + Rent + Scheduled Principal)', metric: 'FCCR', threshold: 1.15, direction: 'min', currentValue: 1.45, unit: 'x' },
];

export function CovenantCompliance({ className }: { className?: string }) {
  const covenantStatus = useMemo(() => {
    return sampleCovenants.map(c => {
      const isCompliant = c.direction === 'min' ? c.currentValue >= c.threshold : c.currentValue <= c.threshold;
      const headroom = c.direction === 'min'
        ? ((c.currentValue - c.threshold) / c.threshold) * 100
        : ((c.threshold - c.currentValue) / c.threshold) * 100;
      const isWarning = headroom < 15 && headroom >= 0;
      const progressPct = c.direction === 'min'
        ? Math.min((c.currentValue / (c.threshold * 2)) * 100, 100)
        : Math.min(((c.threshold * 2 - c.currentValue) / (c.threshold * 2)) * 100, 100);
      return { ...c, isCompliant, headroom, isWarning, progressPct };
    });
  }, []);

  const compliant = covenantStatus.filter(c => c.isCompliant && !c.isWarning).length;
  const warnings = covenantStatus.filter(c => c.isWarning).length;
  const breaches = covenantStatus.filter(c => !c.isCompliant).length;

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Covenant Compliance Monitor
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-success text-[10px]">{compliant} Pass</Badge>
            {warnings > 0 && <Badge variant="outline" className="text-warning text-[10px]">{warnings} Warning</Badge>}
            {breaches > 0 && <Badge variant="destructive" className="text-[10px]">{breaches} Breach</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {covenantStatus.map(c => (
            <div key={c.id} className={cn(
              "p-3 rounded-lg border transition-colors",
              !c.isCompliant ? "border-destructive/50 bg-destructive/5" :
              c.isWarning ? "border-warning/50 bg-warning/5" :
              "border-border/50 bg-muted/20"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {!c.isCompliant ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
                   c.isWarning ? <AlertTriangle className="h-3.5 w-3.5 text-warning" /> :
                   <CheckCircle className="h-3.5 w-3.5 text-success" />}
                  <div>
                    <span className="text-xs font-medium">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{c.description}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{c.direction === 'min' ? 'Min' : 'Max'}: {c.unit === '$' ? formatCurrency(c.threshold) : `${c.threshold}${c.unit}`}</p>
                    <p className={cn("text-sm font-bold", c.isCompliant ? "text-success" : "text-destructive")}>
                      {c.unit === '$' ? formatCurrency(c.currentValue) : `${c.currentValue}${c.unit}`}
                    </p>
                  </div>
                  <Badge variant={c.isCompliant ? 'outline' : 'destructive'} className="text-[10px] w-20 justify-center">
                    {c.headroom > 0 ? `+${c.headroom.toFixed(0)}%` : `${c.headroom.toFixed(0)}%`}
                  </Badge>
                </div>
              </div>
              <Progress
                value={c.progressPct}
                className={cn(
                  "h-1.5",
                  !c.isCompliant ? "[&>div]:bg-destructive" :
                  c.isWarning ? "[&>div]:bg-warning" :
                  "[&>div]:bg-success"
                )}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
