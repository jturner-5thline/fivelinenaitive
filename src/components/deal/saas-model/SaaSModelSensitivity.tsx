import { useState } from 'react';
import { SaaSModelData, SensitivityScenario } from './types';
import { fmtCurrency, isNegative } from './formatters';
import { calculateSensitivity } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { ScenarioComparison } from './ScenarioComparison';
import { EVSensitivityMatrix } from './EVSensitivityMatrix';

interface Props {
  model: SaaSModelData;
  scenarios: SensitivityScenario[];
  updateScenarios: (scenarios: SensitivityScenario[]) => void;
}

const SCENARIO_COLORS = ['hsl(var(--primary))', 'hsl(220, 80%, 60%)', 'hsl(45, 90%, 55%)', 'hsl(0, 70%, 60%)'];
const SCENARIO_LABELS = ['Scenario 1', 'Scenario 2', 'Scenario 3', 'Scenario 4'];

export function SaaSModelSensitivity({ model, scenarios, updateScenarios }: Props) {
  const [compareOpen, setCompareOpen] = useState(false);

  const handleInputChange = (scenarioIdx: number, field: keyof SensitivityScenario, value: string) => {
    const num = parseFloat(value) || 0;
    const updated = [...scenarios];
    updated[scenarioIdx] = { ...updated[scenarioIdx], [field]: num };
    updateScenarios(updated);
  };

  // Calculate all scenarios
  const scenarioResults = scenarios.map(s =>
    calculateSensitivity(model, s.revenuePct, s.opexReduction, s.cogsReduction, 18)
  );

  // Chart data
  const chartData = Array.from({ length: 18 }, (_, i) => {
    const entry: any = { name: model.months[i]?.label || `M${i + 1}` };
    scenarioResults.forEach((r, si) => {
      entry[`scenario${si}`] = r.operatingIncome[i] || 0;
    });
    return entry;
  });

  return (
    <div className="space-y-4">
      {/* Compare Scenarios Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={() => setCompareOpen(true)}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Compare Scenarios
        </Button>
      </div>

      <ScenarioComparison model={model} open={compareOpen} onClose={() => setCompareOpen(false)} />

      {/* Inputs */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-4">Scenario Parameters</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 px-3 text-muted-foreground min-w-[160px]">Parameter</th>
                  {scenarios.map((_, i) => (
                    <th key={i} className="text-center py-2 px-3 text-muted-foreground min-w-[120px]">{SCENARIO_LABELS[i]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/10">
                  <td className="py-2 px-3 font-medium">Revenue % of Plan</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="py-2 px-3">
                      <Input type="number" className="h-7 text-xs text-center font-mono" value={s.revenuePct}
                        onChange={e => handleInputChange(i, 'revenuePct', e.target.value)} />
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/10">
                  <td className="py-2 px-3 font-medium">OpEx Reduction %</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="py-2 px-3">
                      <Input type="number" className="h-7 text-xs text-center font-mono" value={s.opexReduction}
                        onChange={e => handleInputChange(i, 'opexReduction', e.target.value)} />
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/10">
                  <td className="py-2 px-3 font-medium">COGS Reduction %</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="py-2 px-3">
                      <Input type="number" className="h-7 text-xs text-center font-mono" value={s.cogsReduction}
                        onChange={e => handleInputChange(i, 'cogsReduction', e.target.value)} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Operating Income — Scenario Comparison</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCurrency(v, true)} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="5 5" label="Breakeven" />
                {scenarios.map((_, i) => (
                  <Line key={i} type="monotone" dataKey={`scenario${i}`} name={SCENARIO_LABELS[i]}
                    stroke={SCENARIO_COLORS[i]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detail tables */}
      {scenarioResults.map((result, si) => (
        <Card key={si} className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">{SCENARIO_LABELS[si]} — {scenarios[si].revenuePct}% Rev / {scenarios[si].opexReduction}% OpEx Cut / {scenarios[si].cogsReduction}% COGS Cut</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-1.5 px-3 text-muted-foreground sticky left-0 bg-card min-w-[140px]">Metric</th>
                    {Array.from({ length: 18 }, (_, i) => (
                      <th key={i} className="text-right py-1.5 px-2 text-muted-foreground min-w-[70px] whitespace-nowrap">{model.months[i]?.label || ''}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Revenue', values: result.revenue },
                    { label: 'COGS', values: result.cogs },
                    { label: 'Gross Profit', values: result.grossProfit, bold: true },
                    { label: 'OpEx', values: result.opex },
                    { label: 'Operating Income', values: result.operatingIncome, bold: true },
                  ].map(row => (
                    <tr key={row.label} className="border-b border-border/10">
                      <td className={cn("py-1.5 px-3 sticky left-0 bg-card", row.bold && "font-semibold")}>{row.label}</td>
                      {row.values.map((v, vi) => (
                        <td key={vi} className={cn(
                          "py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap",
                          row.bold && "font-semibold",
                          isNegative(v) && "text-destructive"
                        )}>{fmtCurrency(v, true)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* EV Sensitivity Matrix */}
      <EVSensitivityMatrix model={model} />
    </div>
  );
}
