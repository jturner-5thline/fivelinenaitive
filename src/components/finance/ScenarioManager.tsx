import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  GitBranch, Plus, Trash2, Copy, Lock, TrendingUp, TrendingDown, 
  ArrowRight, Save, RotateCcw, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DriverInputs } from "./DriverInputsPanel";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Scenario {
  id: string;
  name: string;
  description: string;
  color: string;
  drivers: DriverInputs;
  isLocked: boolean;
}

const defaultDrivers: DriverInputs = {
  revenueGrowthRate: 10, priceInflation: 2, volumeGrowth: 8,
  grossMarginPct: 45, operatingMarginPct: 20, ebitdaMarginPct: 25,
  daysReceivable: 45, daysPayable: 30, daysInventory: 60,
  capexAsRevenuePercent: 5, maintenanceCapex: 50000, growthCapex: 100000,
  interestRate: 6, debtBalance: 500000, annualPrincipalPayment: 50000,
  taxRate: 25, depreciationYears: 5,
};

const defaultScenarios: Scenario[] = [
  {
    id: 'base', name: 'Base Case', description: 'Most likely outcome', color: 'hsl(var(--primary))',
    drivers: { ...defaultDrivers }, isLocked: false,
  },
  {
    id: 'bull', name: 'Bull Case', description: 'Optimistic scenario', color: 'hsl(var(--success))',
    drivers: { ...defaultDrivers, revenueGrowthRate: 20, grossMarginPct: 50, operatingMarginPct: 28 }, isLocked: false,
  },
  {
    id: 'bear', name: 'Bear Case', description: 'Conservative / downside', color: 'hsl(var(--destructive))',
    drivers: { ...defaultDrivers, revenueGrowthRate: 3, grossMarginPct: 38, operatingMarginPct: 12 }, isLocked: false,
  },
];

interface ScenarioManagerProps {
  baseRevenue?: number;
  className?: string;
}

function computeOutputs(drivers: DriverInputs, baseRevenue: number) {
  const months = 12;
  const projections: { month: number; revenue: number; grossProfit: number; ebitda: number; netIncome: number; fcf: number; cash: number }[] = [];
  let cumulativeCash = baseRevenue * 0.1;

  for (let m = 1; m <= months; m++) {
    const monthlyGrowth = (drivers.revenueGrowthRate / 100) / 12;
    const revenue = (baseRevenue / 12) * Math.pow(1 + monthlyGrowth, m);
    const grossProfit = revenue * (drivers.grossMarginPct / 100);
    const opex = revenue * (1 - drivers.operatingMarginPct / 100) - (revenue - grossProfit);
    const operatingIncome = grossProfit - opex;
    const depreciation = revenue * 0.03;
    const ebitda = operatingIncome + depreciation;
    const interest = (drivers.debtBalance * (drivers.interestRate / 100)) / 12;
    const ebt = operatingIncome - interest;
    const taxes = Math.max(ebt * (drivers.taxRate / 100), 0);
    const netIncome = ebt - taxes;
    const capex = revenue * (drivers.capexAsRevenuePercent / 100);
    const fcf = ebitda - taxes - capex;
    cumulativeCash += fcf;

    projections.push({ month: m, revenue, grossProfit, ebitda, netIncome, fcf, cash: cumulativeCash });
  }

  const lastMonth = projections[projections.length - 1];
  const annualRevenue = projections.reduce((s, p) => s + p.revenue, 0);
  const annualEBITDA = projections.reduce((s, p) => s + p.ebitda, 0);
  const annualNetIncome = projections.reduce((s, p) => s + p.netIncome, 0);
  const annualFCF = projections.reduce((s, p) => s + p.fcf, 0);

  return {
    projections,
    annualRevenue,
    annualEBITDA,
    annualNetIncome,
    annualFCF,
    endingCash: lastMonth.cash,
    ebitdaMargin: (annualEBITDA / annualRevenue) * 100,
    netMargin: (annualNetIncome / annualRevenue) * 100,
  };
}

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const driverLabels: Record<keyof DriverInputs, { label: string; suffix: string }> = {
  revenueGrowthRate: { label: 'Revenue Growth', suffix: '%' },
  priceInflation: { label: 'Price Inflation', suffix: '%' },
  volumeGrowth: { label: 'Volume Growth', suffix: '%' },
  grossMarginPct: { label: 'Gross Margin', suffix: '%' },
  operatingMarginPct: { label: 'Operating Margin', suffix: '%' },
  ebitdaMarginPct: { label: 'EBITDA Margin', suffix: '%' },
  daysReceivable: { label: 'DSO', suffix: ' days' },
  daysPayable: { label: 'DPO', suffix: ' days' },
  daysInventory: { label: 'DIO', suffix: ' days' },
  capexAsRevenuePercent: { label: 'CapEx % Rev', suffix: '%' },
  maintenanceCapex: { label: 'Maint. CapEx', suffix: '' },
  growthCapex: { label: 'Growth CapEx', suffix: '' },
  interestRate: { label: 'Interest Rate', suffix: '%' },
  debtBalance: { label: 'Debt Balance', suffix: '' },
  annualPrincipalPayment: { label: 'Annual Principal', suffix: '' },
  taxRate: { label: 'Tax Rate', suffix: '%' },
  depreciationYears: { label: 'Depr. Years', suffix: ' yrs' },
};

const keyDrivers: (keyof DriverInputs)[] = [
  'revenueGrowthRate', 'grossMarginPct', 'operatingMarginPct', 'capexAsRevenuePercent',
  'interestRate', 'taxRate', 'debtBalance', 'daysReceivable',
];

export function ScenarioManager({ baseRevenue = 1000000, className }: ScenarioManagerProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>(defaultScenarios);
  const [activeScenarioId, setActiveScenarioId] = useState('base');
  const [viewMode, setViewMode] = useState<'edit' | 'compare'>('compare');

  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

  const outputs = useMemo(() => {
    const result: Record<string, ReturnType<typeof computeOutputs>> = {};
    scenarios.forEach(s => { result[s.id] = computeOutputs(s.drivers, baseRevenue); });
    return result;
  }, [scenarios, baseRevenue]);

  const handleDriverChange = useCallback((scenarioId: string, key: keyof DriverInputs, value: number) => {
    setScenarios(prev => prev.map(s =>
      s.id === scenarioId && !s.isLocked ? { ...s, drivers: { ...s.drivers, [key]: value } } : s
    ));
  }, []);

  const addScenario = useCallback(() => {
    const id = `custom-${Date.now()}`;
    setScenarios(prev => [...prev, {
      id, name: `Scenario ${prev.length + 1}`, description: 'Custom scenario',
      color: 'hsl(var(--muted-foreground))', drivers: { ...defaultDrivers }, isLocked: false,
    }]);
    setActiveScenarioId(id);
    toast.success('New scenario added');
  }, []);

  const duplicateScenario = useCallback((id: string) => {
    const source = scenarios.find(s => s.id === id);
    if (!source) return;
    const newId = `copy-${Date.now()}`;
    setScenarios(prev => [...prev, {
      ...source, id: newId, name: `${source.name} (Copy)`, isLocked: false,
    }]);
    setActiveScenarioId(newId);
    toast.success(`Duplicated "${source.name}"`);
  }, [scenarios]);

  const deleteScenario = useCallback((id: string) => {
    if (scenarios.length <= 1) return;
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (activeScenarioId === id) setActiveScenarioId(scenarios[0].id);
    toast.success('Scenario deleted');
  }, [scenarios, activeScenarioId]);

  const toggleLock = useCallback((id: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s));
  }, []);

  const comparisonMetrics = [
    { label: 'Annual Revenue', key: 'annualRevenue', format: formatCurrency },
    { label: 'Annual EBITDA', key: 'annualEBITDA', format: formatCurrency },
    { label: 'EBITDA Margin', key: 'ebitdaMargin', format: (v: number) => `${v.toFixed(1)}%` },
    { label: 'Net Income', key: 'annualNetIncome', format: formatCurrency },
    { label: 'Net Margin', key: 'netMargin', format: (v: number) => `${v.toFixed(1)}%` },
    { label: 'Free Cash Flow', key: 'annualFCF', format: formatCurrency },
    { label: 'Ending Cash', key: 'endingCash', format: formatCurrency },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Scenario Tabs */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Scenario Manager
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'edit' ? 'compare' : 'edit')}>
                <Eye className="h-3.5 w-3.5 mr-1" />
                {viewMode === 'edit' ? 'Compare' : 'Edit'}
              </Button>
              <Button variant="outline" size="sm" onClick={addScenario}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Scenario
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Scenario chips */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {scenarios.map(s => (
              <Badge
                key={s.id}
                variant={s.id === activeScenarioId ? 'default' : 'outline'}
                className="cursor-pointer px-3 py-1.5 text-xs"
                onClick={() => setActiveScenarioId(s.id)}
              >
                <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                {s.name}
                {s.isLocked && <Lock className="h-3 w-3 ml-1" />}
              </Badge>
            ))}
          </div>

          {viewMode === 'compare' ? (
            /* Side-by-side comparison table */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Metric</TableHead>
                    {scenarios.map(s => (
                      <TableHead key={s.id} className="text-center min-w-[120px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Driver inputs */}
                  <TableRow>
                    <TableCell colSpan={scenarios.length + 1} className="bg-muted/30 font-medium text-xs text-muted-foreground">
                      DRIVER ASSUMPTIONS
                    </TableCell>
                  </TableRow>
                  {keyDrivers.map(dk => (
                    <TableRow key={dk}>
                      <TableCell className="text-xs text-muted-foreground">{driverLabels[dk].label}</TableCell>
                      {scenarios.map(s => (
                        <TableCell key={s.id} className="text-center text-sm font-mono">
                          {['debtBalance', 'maintenanceCapex', 'growthCapex', 'annualPrincipalPayment'].includes(dk)
                            ? formatCurrency(s.drivers[dk])
                            : `${s.drivers[dk]}${driverLabels[dk].suffix}`
                          }
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {/* Output metrics */}
                  <TableRow>
                    <TableCell colSpan={scenarios.length + 1} className="bg-muted/30 font-medium text-xs text-muted-foreground">
                      PROJECTED OUTPUTS
                    </TableCell>
                  </TableRow>
                  {comparisonMetrics.map(m => {
                    const baseVal = outputs['base']?.[m.key as keyof ReturnType<typeof computeOutputs>] as number;
                    return (
                      <TableRow key={m.key}>
                        <TableCell className="text-xs font-medium">{m.label}</TableCell>
                        {scenarios.map(s => {
                          const val = outputs[s.id]?.[m.key as keyof ReturnType<typeof computeOutputs>] as number;
                          const diff = baseVal ? ((val - baseVal) / Math.abs(baseVal)) * 100 : 0;
                          return (
                            <TableCell key={s.id} className="text-center">
                              <div className="text-sm font-semibold">{m.format(val)}</div>
                              {s.id !== 'base' && Math.abs(diff) > 0.5 && (
                                <div className={cn(
                                  "text-[10px]",
                                  diff > 0 ? "text-success" : "text-destructive"
                                )}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}% vs Base
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* Edit mode for active scenario */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  value={activeScenario.name}
                  onChange={e => setScenarios(prev => prev.map(s =>
                    s.id === activeScenarioId ? { ...s, name: e.target.value } : s
                  ))}
                  className="h-8 text-sm font-medium max-w-xs"
                />
                <Button variant="ghost" size="sm" onClick={() => toggleLock(activeScenarioId)}>
                  <Lock className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => duplicateScenario(activeScenarioId)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {scenarios.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => deleteScenario(activeScenarioId)} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(Object.keys(driverLabels) as (keyof DriverInputs)[]).map(dk => (
                  <div key={dk} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{driverLabels[dk].label}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={activeScenario.drivers[dk]}
                        onChange={e => handleDriverChange(activeScenarioId, dk, parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm pr-8"
                        disabled={activeScenario.isLocked}
                      />
                      {driverLabels[dk].suffix && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {driverLabels[dk].suffix}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Output summary cards */}
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {comparisonMetrics.slice(0, 4).map(m => {
                  const val = outputs[activeScenarioId]?.[m.key as keyof ReturnType<typeof computeOutputs>] as number;
                  return (
                    <div key={m.key} className="p-3 rounded-lg border border-border/50 bg-muted/30">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="text-lg font-semibold">{m.format(val)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
