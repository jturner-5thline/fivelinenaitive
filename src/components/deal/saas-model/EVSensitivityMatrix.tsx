import { useState, useMemo, useCallback } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency } from './formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  model: SaaSModelData;
}

interface SliderConfig {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
}

const SLIDERS: SliderConfig[] = [
  { key: 'revGrowth', label: 'Revenue Growth Override', min: -20, max: 20, step: 1, default: 0, unit: '%' },
  { key: 'ebitdaAdj', label: 'EBITDA Margin Adjustment', min: -10, max: 10, step: 0.5, default: 0, unit: 'pp' },
  { key: 'churnRate', label: 'Customer Churn Rate', min: 0, max: 30, step: 1, default: 10, unit: '%' },
  { key: 'wacc', label: 'Discount Rate (WACC)', min: 8, max: 18, step: 0.5, default: 12, unit: '%' },
  { key: 'termGrowth', label: 'Terminal Growth Rate', min: 1, max: 4, step: 0.1, default: 2.5, unit: '%' },
];

const MARGIN_ROWS = [20.0, 22.5, 25.0, 27.5, 30.0, 32.5, 35.0];
const GROWTH_COLS = [-5, 0, 5, 10, 15];

function getDefaults(): Record<string, number> {
  const d: Record<string, number> = {};
  SLIDERS.forEach(s => { d[s.key] = s.default; });
  return d;
}

export function EVSensitivityMatrix({ model }: Props) {
  const [inputs, setInputs] = useState<Record<string, number>>(getDefaults);

  const updateInput = useCallback((key: string, value: number) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  // Base revenue (annualized from latest month)
  const last = model.months.length - 1;
  const baseRevenue = model.totalRevenue[last] * 12;
  const baseMargin = model.latestGrossMargin; // as proxy for EBITDA margin if no direct

  // Calculate EV multiple from WACC and terminal growth: simplified Gordon Growth
  // Multiple ≈ (1 + g) / (WACC - g)
  const wacc = inputs.wacc / 100;
  const termG = inputs.termGrowth / 100;
  const impliedMultiple = wacc > termG ? (1 + termG) / (wacc - termG) : 10;

  // Base case EV for comparison
  const baseEV = useMemo(() => {
    const adjRevenue = baseRevenue * (1 + inputs.revGrowth / 100);
    const adjMargin = (25 + inputs.ebitdaAdj) / 100; // assume ~25% base EBITDA margin
    return adjRevenue * adjMargin * impliedMultiple;
  }, [baseRevenue, inputs.revGrowth, inputs.ebitdaAdj, impliedMultiple]);

  // Matrix calculation
  const matrix = useMemo(() => {
    return MARGIN_ROWS.map(margin => {
      return GROWTH_COLS.map(growth => {
        const adjRevenue = baseRevenue * (1 + (growth + inputs.revGrowth) / 100);
        const adjMargin = (margin + inputs.ebitdaAdj) / 100;
        const ev = adjRevenue * adjMargin * impliedMultiple;
        return ev;
      });
    });
  }, [baseRevenue, inputs.revGrowth, inputs.ebitdaAdj, impliedMultiple]);

  // Find base case cell (closest to 25% margin, 0% growth)
  const baseRowIdx = MARGIN_ROWS.indexOf(25.0);
  const baseColIdx = GROWTH_COLS.indexOf(0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Left: Slider Inputs */}
        <Card className="border-border/30">
          <CardContent className="p-4 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">EV Assumptions</h3>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setInputs(getDefaults())}
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            </div>

            {SLIDERS.map(slider => (
              <div key={slider.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground font-medium">{slider.label}</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="h-6 w-16 text-xs text-center font-mono px-1"
                      value={inputs[slider.key]}
                      step={slider.step}
                      min={slider.min}
                      max={slider.max}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) updateInput(slider.key, Math.min(slider.max, Math.max(slider.min, v)));
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground w-5">{slider.unit}</span>
                  </div>
                </div>
                <Slider
                  value={[inputs[slider.key]]}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  onValueChange={([v]) => updateInput(slider.key, v)}
                  className="w-full"
                />
              </div>
            ))}

            <div className="pt-2 border-t border-border/20 space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Implied Multiple</span>
                <span className="font-mono font-medium text-foreground">{impliedMultiple.toFixed(1)}x</span>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Base Revenue</span>
                <span className="font-mono font-medium text-foreground">{fmtCurrency(baseRevenue, true)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Heatmap Matrix */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Enterprise Value Sensitivity ($M)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th
                      className="py-2 px-3 text-left text-[10px] text-muted-foreground font-medium"
                      style={{ minWidth: 130 }}
                    >
                      EBITDA Margin ↓ / Rev Growth →
                    </th>
                    {GROWTH_COLS.map(g => (
                      <th key={g} className="py-2 px-3 text-center text-[10px] text-muted-foreground font-medium" style={{ minWidth: 80 }}>
                        {g >= 0 ? '+' : ''}{g}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MARGIN_ROWS.map((margin, ri) => (
                    <tr key={margin}>
                      <td className="py-2 px-3 font-medium font-mono tabular-nums text-muted-foreground">
                        {margin.toFixed(1)}%
                      </td>
                      {GROWTH_COLS.map((_, ci) => {
                        const ev = matrix[ri][ci];
                        const diff = ev - baseEV;
                        const diffPct = baseEV > 0 ? Math.abs(diff / baseEV) : 0;
                        const isBase = ri === baseRowIdx && ci === baseColIdx;
                        const isAbove = diff > 0;

                        // Intensity based on how far from base (capped at 35% opacity)
                        const intensity = Math.min(diffPct * 2, 0.35);
                        const bgColor = isBase
                          ? 'transparent'
                          : isAbove
                            ? `rgba(46,211,183,${0.15 + intensity * 0.6})`
                            : `rgba(249,115,115,${0.15 + intensity * 0.6})`;

                        return (
                          <td
                            key={ci}
                            className={cn(
                              "py-2 px-3 text-center font-mono tabular-nums transition-colors",
                              isBase && "font-bold"
                            )}
                            style={{
                              backgroundColor: bgColor,
                              borderWidth: isBase ? 1 : 0,
                              borderColor: isBase ? '#2ED3B7' : 'transparent',
                              borderStyle: 'solid',
                              borderRadius: isBase ? 4 : 0,
                            }}
                          >
                            {fmtCurrency(ev / 1_000_000, true)}
                            {isBase && (
                              <span className="ml-1 text-[8px] font-semibold" style={{ color: '#2ED3B7' }}>BASE</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3 font-mono">
              Base Case EV: <span className="text-foreground font-semibold">{fmtCurrency(baseEV / 1_000_000, true)}</span>
              {' '}— Implied {impliedMultiple.toFixed(1)}x multiple at {inputs.wacc}% WACC / {inputs.termGrowth}% terminal growth
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
