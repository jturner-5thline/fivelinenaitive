import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { 
  TrendingUp, TrendingDown, Minus, Zap, Target, AlertTriangle, 
  ArrowUpRight, ArrowDownRight, ShieldAlert
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────────
type Scenario = 'base' | 'bull' | 'bear';

interface ScenarioAssumptions {
  revenueGrowth: number;
  grossMargin: number;
  opexGrowth: number;
  churnRate: number;
  newCustomers: number;
  avgDealSize: number;
}

const SCENARIO_PRESETS: Record<Scenario, { label: string; icon: React.ElementType; assumptions: ScenarioAssumptions; color: string }> = {
  base: {
    label: 'Base Case',
    icon: Minus,
    color: 'text-primary',
    assumptions: { revenueGrowth: 10, grossMargin: 45, opexGrowth: 5, churnRate: 2, newCustomers: 5, avgDealSize: 50000 },
  },
  bull: {
    label: 'Bull Case',
    icon: TrendingUp,
    color: 'text-success',
    assumptions: { revenueGrowth: 25, grossMargin: 55, opexGrowth: 8, churnRate: 1, newCustomers: 10, avgDealSize: 65000 },
  },
  bear: {
    label: 'Bear Case',
    icon: TrendingDown,
    color: 'text-destructive',
    assumptions: { revenueGrowth: -5, grossMargin: 35, opexGrowth: 3, churnRate: 5, newCustomers: 2, avgDealSize: 35000 },
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const computeFinancials = (a: ScenarioAssumptions, baseRevenue: number) => {
  const annualRevenue = baseRevenue * (1 + a.revenueGrowth / 100);
  const grossProfit = annualRevenue * (a.grossMargin / 100);
  const opex = (annualRevenue * 0.3) * (1 + a.opexGrowth / 100);
  const ebitda = grossProfit - opex;
  const netIncome = ebitda * 0.75;
  const fcf = ebitda * 0.65;
  const monthlyBurn = Math.max(0, (annualRevenue * (1 - a.grossMargin / 100) + opex - annualRevenue) / 12);
  const runway = monthlyBurn > 0 ? Math.round(500000 / monthlyBurn) : Infinity;
  return { annualRevenue, grossProfit, ebitda, netIncome, fcf, monthlyBurn, runway };
};

// ── Main Component ─────────────────────────────────────────────────────────────
export function ScenarioModeling() {
  const baseRevenue = 1200000;
  const [activeScenario, setActiveScenario] = useState<Scenario>('base');
  const [customAssumptions, setCustomAssumptions] = useState<ScenarioAssumptions>(
    SCENARIO_PRESETS.base.assumptions
  );

  const handleScenarioChange = (val: string) => {
    if (!val) return;
    const s = val as Scenario;
    setActiveScenario(s);
    setCustomAssumptions(SCENARIO_PRESETS[s].assumptions);
  };

  const handleSlider = (key: keyof ScenarioAssumptions, value: number[]) => {
    setCustomAssumptions(prev => ({ ...prev, [key]: value[0] }));
  };

  // Compute for all three + custom
  const results = useMemo(() => {
    const r: Record<string, ReturnType<typeof computeFinancials>> = {};
    for (const [k, v] of Object.entries(SCENARIO_PRESETS)) {
      r[k] = computeFinancials(v.assumptions, baseRevenue);
    }
    r.custom = computeFinancials(customAssumptions, baseRevenue);
    return r;
  }, [customAssumptions, baseRevenue]);

  // Chart data for comparison
  const chartData = useMemo(() => {
    const metrics = ['Revenue', 'Gross Profit', 'EBITDA', 'Net Income', 'FCF'] as const;
    const keys: (keyof ReturnType<typeof computeFinancials>)[] = ['annualRevenue', 'grossProfit', 'ebitda', 'netIncome', 'fcf'];
    return metrics.map((label, i) => ({
      metric: label,
      Bear: results.bear[keys[i]] as number,
      Base: results.base[keys[i]] as number,
      Bull: results.bull[keys[i]] as number,
    }));
  }, [results]);

  const current = results.custom;
  const preset = SCENARIO_PRESETS[activeScenario];
  const PresetIcon = preset.icon;

  const sliders: { key: keyof ScenarioAssumptions; label: string; min: number; max: number; step: number; suffix: string }[] = [
    { key: 'revenueGrowth', label: 'Revenue Growth', min: -20, max: 50, step: 1, suffix: '%' },
    { key: 'grossMargin', label: 'Gross Margin', min: 10, max: 80, step: 1, suffix: '%' },
    { key: 'opexGrowth', label: 'OpEx Growth', min: 0, max: 30, step: 1, suffix: '%' },
    { key: 'churnRate', label: 'Churn Rate', min: 0, max: 15, step: 0.5, suffix: '%' },
    { key: 'newCustomers', label: 'New Customers/mo', min: 0, max: 20, step: 1, suffix: '' },
    { key: 'avgDealSize', label: 'Avg Deal Size', min: 10000, max: 100000, step: 5000, suffix: '' },
  ];

  return (
    <div className="space-y-4">
      {/* Scenario Selector */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Scenario Comparison
            </CardTitle>
            <Badge variant="outline" className="text-[9px]">
              <PresetIcon className={cn("h-3 w-3 mr-1", preset.color)} />
              {preset.label} Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ToggleGroup type="single" value={activeScenario} onValueChange={handleScenarioChange} className="mb-4">
            {(Object.entries(SCENARIO_PRESETS) as [Scenario, typeof SCENARIO_PRESETS.base][]).map(([key, s]) => {
              const Icon = s.icon;
              return (
                <ToggleGroupItem key={key} value={key} className="gap-1.5 text-xs px-4">
                  <Icon className={cn("h-3.5 w-3.5", s.color)} />
                  {s.label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>

          {/* Scenario Comparison Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="metric" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Bear" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} opacity={0.7} />
                <Bar dataKey="Base" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Bull" fill="hsl(var(--success, 142 76% 36%))" radius={[2, 2, 0, 0]} opacity={0.7} />
                <ReferenceLine y={0} className="stroke-border" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Assumption Sliders */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Assumptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sliders.map(s => (
              <div key={s.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{s.label}</Label>
                  <span className="text-xs font-mono font-medium">
                    {s.key === 'avgDealSize' ? fmtCurrency(customAssumptions[s.key]) : `${customAssumptions[s.key]}${s.suffix}`}
                  </span>
                </div>
                <Slider
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={[customAssumptions[s.key]]}
                  onValueChange={(v) => handleSlider(s.key, v)}
                  className="h-1.5"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Projected Outputs */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Projected Outputs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Revenue', value: current.annualRevenue, base: results.base.annualRevenue },
                { label: 'Gross Profit', value: current.grossProfit, base: results.base.grossProfit },
                { label: 'EBITDA', value: current.ebitda, base: results.base.ebitda },
                { label: 'Net Income', value: current.netIncome, base: results.base.netIncome },
                { label: 'Free Cash Flow', value: current.fcf, base: results.base.fcf },
              ].map(row => {
                const diff = ((row.value - row.base) / Math.abs(row.base)) * 100;
                const isPositive = diff > 0;
                return (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-semibold">{fmtCurrency(row.value)}</span>
                      {diff !== 0 && (
                        <Badge variant="outline" className={cn(
                          "text-[9px] gap-0.5",
                          isPositive ? "text-success border-success/30" : "text-destructive border-destructive/30"
                        )}>
                          {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                          {Math.abs(diff).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              <Separator />

              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Monthly Burn</span>
                <span className={cn("text-sm font-mono font-semibold", current.monthlyBurn > 0 ? "text-destructive" : "text-success")}>
                  {current.monthlyBurn > 0 ? fmtCurrency(current.monthlyBurn) : 'Profitable'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Runway</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-mono font-semibold",
                    current.runway === Infinity ? "text-success" : current.runway > 12 ? "text-success" : current.runway > 6 ? "text-warning" : "text-destructive"
                  )}>
                    {current.runway === Infinity ? '∞' : `${current.runway}mo`}
                  </span>
                  {current.runway !== Infinity && current.runway <= 6 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
