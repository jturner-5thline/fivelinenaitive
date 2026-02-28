import { useState, useMemo } from 'react';
import { TrendingDown, TrendingUp, Minus, Plus, RotateCcw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ScenarioConfig, ScenarioAssumption, FinancialMetric, CovenantConfig } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from 'recharts';

interface ScenarioAnalysisProps {
  metrics: FinancialMetric[];
  covenants: CovenantConfig[];
  className?: string;
}

const DEFAULT_SCENARIOS: ScenarioConfig[] = [
  {
    name: 'Base Case',
    type: 'base',
    assumptions: [
      { metric: 'revenue_growth', adjustment: 0, label: 'Revenue Growth' },
      { metric: 'ebitda_margin', adjustment: 0, label: 'EBITDA Margin' },
      { metric: 'interest_rate', adjustment: 0, label: 'Interest Rate' },
      { metric: 'capex', adjustment: 0, label: 'CapEx' },
    ],
  },
  {
    name: 'Downside',
    type: 'downside',
    assumptions: [
      { metric: 'revenue_growth', adjustment: -15, label: 'Revenue Growth' },
      { metric: 'ebitda_margin', adjustment: -200, label: 'EBITDA Margin (bps)' },
      { metric: 'interest_rate', adjustment: 100, label: 'Interest Rate (bps)' },
      { metric: 'capex', adjustment: 10, label: 'CapEx' },
    ],
  },
  {
    name: 'Severe Downside',
    type: 'severe_downside',
    assumptions: [
      { metric: 'revenue_growth', adjustment: -30, label: 'Revenue Growth' },
      { metric: 'ebitda_margin', adjustment: -500, label: 'EBITDA Margin (bps)' },
      { metric: 'interest_rate', adjustment: 200, label: 'Interest Rate (bps)' },
      { metric: 'capex', adjustment: 20, label: 'CapEx' },
    ],
  },
];

const SCENARIO_COLORS: Record<string, string> = {
  base: 'hsl(var(--primary))',
  downside: 'hsl(45, 93%, 47%)',
  severe_downside: 'hsl(0, 72%, 51%)',
  custom: 'hsl(270, 60%, 55%)',
};

function applyScenarioToMetric(baseValue: number, adjustment: number, metricKey: string): number {
  if (metricKey === 'ebitda_margin' || metricKey === 'interest_rate') {
    return baseValue + adjustment / 100; // bps conversion
  }
  return baseValue * (1 + adjustment / 100);
}

export function ScenarioAnalysis({ metrics, covenants, className }: ScenarioAnalysisProps) {
  const [scenarios, setScenarios] = useState<ScenarioConfig[]>(DEFAULT_SCENARIOS);
  const [activeScenario, setActiveScenario] = useState<number>(0);
  const [showCustom, setShowCustom] = useState(false);

  const updateAssumption = (scenarioIdx: number, assumptionIdx: number, value: number) => {
    const updated = [...scenarios];
    updated[scenarioIdx] = {
      ...updated[scenarioIdx],
      assumptions: updated[scenarioIdx].assumptions.map((a, i) =>
        i === assumptionIdx ? { ...a, adjustment: value } : a
      ),
    };
    setScenarios(updated);
  };

  // Build comparison data
  const baseRevenue = metrics.find(m => m.key === 'revenue')?.value || 100000000;
  const baseEbitda = metrics.find(m => m.key === 'ebitda')?.value || 25000000;
  const baseLeverage = metrics.find(m => m.key === 'total_leverage')?.value || 3.5;
  const baseCoverage = metrics.find(m => m.key === 'interest_coverage')?.value || 2.5;

  const comparisonData = useMemo(() => {
    return scenarios.map(s => {
      const revAdj = s.assumptions.find(a => a.metric === 'revenue_growth')?.adjustment || 0;
      const marginAdj = s.assumptions.find(a => a.metric === 'ebitda_margin')?.adjustment || 0;
      const rateAdj = s.assumptions.find(a => a.metric === 'interest_rate')?.adjustment || 0;

      const adjRevenue = baseRevenue * (1 + revAdj / 100);
      const adjMargin = (baseEbitda / baseRevenue) + marginAdj / 10000;
      const adjEbitda = adjRevenue * adjMargin;
      const adjLeverage = baseLeverage * (baseEbitda / Math.max(adjEbitda, 1));
      const adjCoverage = baseCoverage * (adjEbitda / baseEbitda) * (1 / (1 + rateAdj / 10000));

      return {
        name: s.name,
        type: s.type,
        revenue: adjRevenue / 1000000,
        ebitda: adjEbitda / 1000000,
        leverage: adjLeverage,
        coverage: adjCoverage,
        margin: adjMargin * 100,
      };
    });
  }, [scenarios, baseRevenue, baseEbitda, baseLeverage, baseCoverage]);

  const waterfall = comparisonData.map(d => ({
    name: d.name,
    EBITDA: d.ebitda,
    fill: SCENARIO_COLORS[d.type] || SCENARIO_COLORS.custom,
  }));

  // Check covenant breaches per scenario
  const covenantImpact = useMemo(() => {
    return scenarios.map((s, si) => {
      const d = comparisonData[si];
      return covenants.map(cov => {
        let testValue = cov.currentValue;
        if (cov.type === 'leverage') testValue = d.leverage;
        if (cov.type === 'coverage') testValue = d.coverage;
        if (!testValue) return 'compliant';

        if (cov.operator === 'lte' && testValue > cov.threshold) return 'breach';
        if (cov.operator === 'gte' && testValue < cov.threshold) return 'breach';

        const diff = cov.operator === 'lte' || cov.operator === 'lt'
          ? cov.threshold - testValue
          : testValue - cov.threshold;
        if (Math.abs(diff / cov.threshold) < 0.1) return 'warning';
        return 'compliant';
      });
    });
  }, [scenarios, comparisonData, covenants]);

  return (
    <div className={cn("rounded-xl border border-border/30 bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Scenario Analysis</h3>
          <Badge variant="secondary" className="text-[10px] h-5">{scenarios.length} scenarios</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setScenarios(DEFAULT_SCENARIOS)}>
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      {/* Scenario tabs */}
      <div className="flex border-b border-border/20">
        {scenarios.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveScenario(i)}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-medium transition-all border-b-2",
              activeScenario === i
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
            )}
          >
            <span className="flex items-center justify-center gap-1.5">
              {s.type === 'base' && <Minus className="h-3 w-3" />}
              {s.type === 'downside' && <TrendingDown className="h-3 w-3 text-amber-500" />}
              {s.type === 'severe_downside' && <TrendingDown className="h-3 w-3 text-destructive" />}
              {s.name}
            </span>
          </button>
        ))}
      </div>

      {/* Active scenario assumptions */}
      <div className="px-4 py-3 border-b border-border/20 bg-muted/10">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
          Assumptions — {scenarios[activeScenario]?.name}
        </p>
        <div className="space-y-3">
          {scenarios[activeScenario]?.assumptions.map((a, ai) => (
            <div key={ai} className="flex items-center gap-3">
              <span className="text-xs w-36 text-muted-foreground">{a.label}</span>
              <Slider
                value={[a.adjustment]}
                onValueChange={([v]) => updateAssumption(activeScenario, ai, v)}
                min={-50}
                max={50}
                step={1}
                className="flex-1"
              />
              <div className="flex items-center gap-1 w-20">
                <Input
                  className="h-6 text-xs text-right w-14"
                  type="number"
                  value={a.adjustment}
                  onChange={e => updateAssumption(activeScenario, ai, parseFloat(e.target.value) || 0)}
                />
                <span className="text-[10px] text-muted-foreground">
                  {a.metric === 'ebitda_margin' || a.metric === 'interest_rate' ? 'bps' : '%'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison chart */}
      <div className="px-4 py-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">
          EBITDA Impact ($MM)
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfall} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border)/0.3)' }}
                formatter={(v: number) => [`$${v.toFixed(1)}MM`, 'EBITDA']}
              />
              <Bar dataKey="EBITDA" radius={[4, 4, 0, 0]}>
                {waterfall.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Separator />

      {/* Comparison table */}
      <div className="px-4 py-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
          Key Metrics Across Scenarios
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/20">
                <th className="text-left py-1.5 text-muted-foreground font-medium">Metric</th>
                {scenarios.map((s, i) => (
                  <th key={i} className="text-right py-1.5 text-muted-foreground font-medium px-2">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/10">
                <td className="py-1.5">Revenue ($MM)</td>
                {comparisonData.map((d, i) => (
                  <td key={i} className={cn("text-right py-1.5 px-2 font-mono", i > 0 && d.revenue < comparisonData[0].revenue && 'text-destructive')}>
                    ${d.revenue.toFixed(1)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/10">
                <td className="py-1.5">EBITDA ($MM)</td>
                {comparisonData.map((d, i) => (
                  <td key={i} className={cn("text-right py-1.5 px-2 font-mono", i > 0 && d.ebitda < comparisonData[0].ebitda && 'text-destructive')}>
                    ${d.ebitda.toFixed(1)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/10">
                <td className="py-1.5">EBITDA Margin</td>
                {comparisonData.map((d, i) => (
                  <td key={i} className={cn("text-right py-1.5 px-2 font-mono", i > 0 && d.margin < comparisonData[0].margin && 'text-destructive')}>
                    {d.margin.toFixed(1)}%
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/10">
                <td className="py-1.5">Total Leverage</td>
                {comparisonData.map((d, i) => (
                  <td key={i} className={cn("text-right py-1.5 px-2 font-mono", d.leverage > 5 && 'text-destructive', d.leverage > 4 && d.leverage <= 5 && 'text-amber-500')}>
                    {d.leverage.toFixed(2)}x
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-1.5">Interest Coverage</td>
                {comparisonData.map((d, i) => (
                  <td key={i} className={cn("text-right py-1.5 px-2 font-mono", d.coverage < 1.25 && 'text-destructive', d.coverage >= 1.25 && d.coverage < 1.5 && 'text-amber-500')}>
                    {d.coverage.toFixed(2)}x
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Covenant impact matrix */}
      {covenants.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
              Covenant Impact
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left py-1.5 text-muted-foreground font-medium">Covenant</th>
                    {scenarios.map((s, i) => (
                      <th key={i} className="text-center py-1.5 text-muted-foreground font-medium px-2">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {covenants.map((cov, ci) => (
                    <tr key={ci} className="border-b border-border/10">
                      <td className="py-1.5">{cov.name}</td>
                      {scenarios.map((_, si) => {
                        const status = covenantImpact[si]?.[ci] || 'compliant';
                        return (
                          <td key={si} className="text-center py-1.5 px-2">
                            <span className={cn(
                              "inline-block h-3 w-3 rounded-full",
                              status === 'compliant' && 'bg-emerald-500',
                              status === 'warning' && 'bg-amber-500',
                              status === 'breach' && 'bg-destructive',
                            )} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
