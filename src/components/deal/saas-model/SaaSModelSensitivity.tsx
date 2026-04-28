import { useState, useMemo } from 'react';
import { SaaSModelData, SensitivityScenario } from './types';
import { fmtCurrency, fmtPct, isNegative } from './formatters';
import { calculateSensitivity } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle2 } from 'lucide-react';
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

const SCENARIO_COLORS = ['#4C6FFF', '#2ED3B7', '#FFB547', '#F97373'];
const SCENARIO_LABELS = ['Scenario 1', 'Scenario 2', 'Scenario 3', 'Scenario 4'];

// ── Tornado Chart (SVG) ─────────────────────────────────
interface TornadoFactor {
  name: string;
  baseValue: number;
  lowValue: number;
  highValue: number;
  lowParam: string;
  highParam: string;
}

function buildTornadoFactors(model: SaaSModelData): TornadoFactor[] {
  const base = calculateSensitivity(model, 100, 0, 0, 18);
  const baseOI = base.operatingIncome.reduce((s, v) => s + v, 0);

  const factors: { name: string; lowPct: number; highPct: number; field: 'revenuePct' | 'opexReduction' | 'cogsReduction' }[] = [
    { name: 'Revenue', lowPct: 80, highPct: 120, field: 'revenuePct' },
    { name: 'OpEx', lowPct: 0, highPct: 25, field: 'opexReduction' },
    { name: 'COGS', lowPct: 0, highPct: 20, field: 'cogsReduction' },
  ];

  return factors.map(f => {
    const lowResult = calculateSensitivity(
      model,
      f.field === 'revenuePct' ? f.lowPct : 100,
      f.field === 'opexReduction' ? f.lowPct : 0,
      f.field === 'cogsReduction' ? f.lowPct : 0,
      18
    );
    const highResult = calculateSensitivity(
      model,
      f.field === 'revenuePct' ? f.highPct : 100,
      f.field === 'opexReduction' ? f.highPct : 0,
      f.field === 'cogsReduction' ? f.highPct : 0,
      18
    );
    const lowOI = lowResult.operatingIncome.reduce((s, v) => s + v, 0);
    const highOI = highResult.operatingIncome.reduce((s, v) => s + v, 0);

    return {
      name: f.name,
      baseValue: baseOI,
      lowValue: Math.min(lowOI, highOI),
      highValue: Math.max(lowOI, highOI),
      lowParam: f.field === 'revenuePct' ? `${f.lowPct}%` : `${f.lowPct}% cut`,
      highParam: f.field === 'revenuePct' ? `${f.highPct}%` : `${f.highPct}% cut`,
    };
  }).sort((a, b) => (b.highValue - b.lowValue) - (a.highValue - a.lowValue));
}

function TornadoChart({ factors }: { factors: TornadoFactor[] }) {
  if (factors.length === 0) return null;

  const w = 600, h = factors.length * 60 + 40;
  const leftMargin = 80, rightMargin = 80, topMargin = 20;
  const barHeight = 28;
  const rowHeight = 60;

  const allVals = factors.flatMap(f => [f.lowValue, f.highValue, f.baseValue]);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;
  const toX = (v: number) => leftMargin + ((v - minVal) / range) * (w - leftMargin - rightMargin);
  const baseX = toX(factors[0]?.baseValue || 0);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[600px]">
      {/* Base line */}
      <line x1={baseX} y1={topMargin - 5} x2={baseX} y2={h - 10} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4,3" />
      <text x={baseX} y={topMargin - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>Base</text>

      {factors.map((f, i) => {
        const y = topMargin + i * rowHeight + (rowHeight - barHeight) / 2;
        const x1 = toX(f.lowValue);
        const x2 = toX(f.highValue);

        return (
          <g key={f.name}>
            {/* Label */}
            <text x={leftMargin - 8} y={y + barHeight / 2 + 4} textAnchor="end" className="fill-foreground" style={{ fontSize: 11, fontWeight: 500 }}>
              {f.name}
            </text>
            {/* Low bar (red side) */}
            <rect x={x1} y={y} width={Math.max(baseX - x1, 0)} height={barHeight} rx={3} fill="#F97373" opacity={0.7} />
            {/* High bar (green side) */}
            <rect x={baseX} y={y} width={Math.max(x2 - baseX, 0)} height={barHeight} rx={3} fill="#2ED3B7" opacity={0.7} />
            {/* Value labels */}
            <text x={x1 - 4} y={y + barHeight / 2 + 4} textAnchor="end" style={{ fontSize: 9, fill: '#F97373', fontFamily: 'ui-monospace, monospace' }}>
              {fmtCurrency(f.lowValue, true)}
            </text>
            <text x={x2 + 4} y={y + barHeight / 2 + 4} textAnchor="start" style={{ fontSize: 9, fill: '#2ED3B7', fontFamily: 'ui-monospace, monospace' }}>
              {fmtCurrency(f.highValue, true)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Scenario Impact Cards ────────────────────────────────
function ScenarioImpactCard({ label, scenario, result, model, color }: {
  label: string;
  scenario: SensitivityScenario;
  result: ReturnType<typeof calculateSensitivity>;
  model: SaaSModelData;
  color: string;
}) {
  const totalOI = result.operatingIncome.reduce((s, v) => s + v, 0);
  const totalRev = result.revenue.reduce((s, v) => s + v, 0);
  const margin = totalRev > 0 ? (totalOI / totalRev) * 100 : 0;
  const baseOI = model.totalRevenue.slice(0, 18).reduce((s, v) => s + v, 0) -
    model.totalCOGS.slice(0, 18).reduce((s, v) => s + v, 0) -
    model.totalOpEx.slice(0, 18).reduce((s, v) => s + v, 0);
  const delta = baseOI !== 0 ? ((totalOI - baseOI) / Math.abs(baseOI)) * 100 : 0;

  // Breakeven month (first month where cumulative OI > 0)
  let cumOI = 0;
  let breakevenMonth: number | null = null;
  for (let i = 0; i < result.operatingIncome.length; i++) {
    cumOI += result.operatingIncome[i];
    if (cumOI > 0 && breakevenMonth === null) {
      breakevenMonth = i + 1;
    }
  }

  const isPositive = totalOI >= 0;

  return (
    <Card className="border-border/30">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-semibold">{label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {scenario.revenuePct}% Rev · {scenario.opexReduction}% OpEx Cut · {scenario.cogsReduction}% COGS Cut
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">Cum. Op Inc</p>
            <p className={cn("text-sm font-bold font-mono tabular-nums", !isPositive && "text-destructive")}>{fmtCurrency(totalOI, true)}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">Margin</p>
            <p className="text-sm font-bold font-mono tabular-nums">{margin.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">vs Base</p>
            <span className="inline-flex items-center gap-0.5 text-sm font-bold font-mono" style={{ color: delta >= 0 ? '#2ED3B7' : '#F97373' }}>
              {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/20">
          {breakevenMonth ? (
            <><CheckCircle2 className="h-3 w-3" style={{ color: '#2ED3B7' }} /><span className="text-[10px] text-muted-foreground">Breakeven at month {breakevenMonth}</span></>
          ) : (
            <><AlertTriangle className="h-3 w-3" style={{ color: '#F97373' }} /><span className="text-[10px] text-muted-foreground">No breakeven in 18mo</span></>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SaaSModelSensitivity({ model, scenarios, updateScenarios }: Props) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeView, setActiveView] = useState<'scenarios' | 'tornado' | 'ev-matrix'>('scenarios');

  const handleInputChange = (scenarioIdx: number, field: keyof SensitivityScenario, value: string) => {
    const num = parseFloat(value) || 0;
    const updated = [...scenarios];
    updated[scenarioIdx] = { ...updated[scenarioIdx], [field]: num };
    updateScenarios(updated);
  };

  const scenarioResults = scenarios.map(s =>
    calculateSensitivity(model, s.revenuePct, s.opexReduction, s.cogsReduction, 18)
  );

  const tornadoFactors = useMemo(() => buildTornadoFactors(model), [model]);

  const chartData = Array.from({ length: 18 }, (_, i) => {
    const entry: any = { name: model.months[i]?.label || `M${i + 1}` };
    scenarioResults.forEach((r, si) => {
      entry[`scenario${si}`] = r.operatingIncome[i] || 0;
    });
    return entry;
  });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <Tabs value={activeView} onValueChange={v => setActiveView(v as any)}>
          <TabsList className="h-8 bg-muted/30 rounded-sm">
            <TabsTrigger value="scenarios" className="text-xs rounded-sm h-7">Scenarios</TabsTrigger>
            <TabsTrigger value="tornado" className="text-xs rounded-sm h-7">Tornado</TabsTrigger>
            <TabsTrigger value="ev-matrix" className="text-xs rounded-sm h-7">EV Matrix</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setCompareOpen(true)}>
          <BarChart3 className="h-3.5 w-3.5" /> Compare Scenarios
        </Button>
      </div>

      <ScenarioComparison model={model} open={compareOpen} onClose={() => setCompareOpen(false)} />

      {/* ── SCENARIOS VIEW ── */}
      {activeView === 'scenarios' && (
        <>
          {/* Impact summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {scenarios.map((s, i) => (
              <ScenarioImpactCard
                key={i}
                label={SCENARIO_LABELS[i]}
                scenario={s}
                result={scenarioResults[i]}
                model={model}
                color={SCENARIO_COLORS[i]}
              />
            ))}
          </div>

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
                        <th key={i} className="text-center py-2 px-3 min-w-[120px]">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SCENARIO_COLORS[i] }} />
                            <span className="text-muted-foreground">{SCENARIO_LABELS[i]}</span>
                          </div>
                        </th>
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
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="5 5" />
                    {scenarios.map((_, i) => (
                      <Line key={i} type="monotone" dataKey={`scenario${i}`} name={SCENARIO_LABELS[i]}
                        stroke={SCENARIO_COLORS[i]} strokeWidth={1} dot={false} />
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
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SCENARIO_COLORS[si] }} />
                  <h3 className="text-sm font-semibold">{SCENARIO_LABELS[si]}</h3>
                  <span className="text-[10px] text-muted-foreground">
                    {scenarios[si].revenuePct}% Rev / {scenarios[si].opexReduction}% OpEx Cut / {scenarios[si].cogsReduction}% COGS Cut
                  </span>
                </div>
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
        </>
      )}

      {/* ── TORNADO VIEW ── */}
      {activeView === 'tornado' && (
        <div className="space-y-4">
          <Card className="border-border/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-1">Sensitivity Tornado Chart</h3>
              <p className="text-[10px] text-muted-foreground mb-4">
                Shows impact of each factor on cumulative 18-month operating income. Factors sorted by total swing.
              </p>
              <div className="flex justify-center">
                <TornadoChart factors={tornadoFactors} />
              </div>

              {/* Factor summary table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Factor</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Downside</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Base</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Upside</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Total Swing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tornadoFactors.map(f => {
                      const swing = f.highValue - f.lowValue;
                      return (
                        <tr key={f.name} className="border-b border-border/10">
                          <td className="py-2 px-3 font-medium">{f.name}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums" style={{ color: '#F97373' }}>{fmtCurrency(f.lowValue, true)}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtCurrency(f.baseValue, true)}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums" style={{ color: '#2ED3B7' }}>{fmtCurrency(f.highValue, true)}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">{fmtCurrency(swing, true)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── EV MATRIX VIEW ── */}
      {activeView === 'ev-matrix' && (
        <EVSensitivityMatrix model={model} />
      )}
    </div>
  );
}
