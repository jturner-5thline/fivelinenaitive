import { useState, useMemo, useCallback } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Dice5, Play, BarChart3, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  model: SaaSModelData;
}

interface SimConfig {
  iterations: number;
  revenueVolatility: number; // % std dev
  cogsVolatility: number;
  opexVolatility: number;
  horizonMonths: number;
}

interface SimResult {
  metric: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeStats(arr: number[]): { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number } {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    p10: percentile(sorted, 10), p25: percentile(sorted, 25),
    p50: percentile(sorted, 50), p75: percentile(sorted, 75),
    p90: percentile(sorted, 90), mean,
  };
}

function normalRandom(): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function runSimulation(model: SaaSModelData, config: SimConfig): SimResult[] {
  const last = model.months.length - 1;
  const baseRevenue = model.totalRevenue[last] || 1;
  const baseCOGS = model.totalCOGS[last] || 0;
  const baseOpEx = model.totalOpEx[last] || 0;
  const baseEBITDA = model.ebitda[last] || 0;

  const revenueResults: number[] = [];
  const ebitdaResults: number[] = [];
  const grossMarginResults: number[] = [];
  const cashResults: number[] = [];

  for (let i = 0; i < config.iterations; i++) {
    // Project forward with random shocks
    let cumRevenue = 0;
    let cumCOGS = 0;
    let cumOpEx = 0;

    for (let m = 0; m < config.horizonMonths; m++) {
      const revShock = 1 + (config.revenueVolatility / 100) * normalRandom();
      const cogsShock = 1 + (config.cogsVolatility / 100) * normalRandom();
      const opexShock = 1 + (config.opexVolatility / 100) * normalRandom();

      cumRevenue += baseRevenue * Math.max(0.1, revShock);
      cumCOGS += baseCOGS * Math.max(0.1, cogsShock);
      cumOpEx += baseOpEx * Math.max(0.1, opexShock);
    }

    const annualizedRev = (cumRevenue / config.horizonMonths) * 12;
    const grossProfit = cumRevenue - cumCOGS;
    const gm = cumRevenue > 0 ? (grossProfit / cumRevenue) * 100 : 0;
    const ebitda = grossProfit - cumOpEx;
    const cash = (model.balanceSheet.cash[last] || 0) + ebitda;

    revenueResults.push(annualizedRev);
    ebitdaResults.push((ebitda / config.horizonMonths) * 12);
    grossMarginResults.push(gm);
    cashResults.push(cash);
  }

  return [
    {
      metric: 'Annualized Revenue',
      p10: percentile(revenueResults, 10), p25: percentile(revenueResults, 25),
      p50: percentile(revenueResults, 50), p75: percentile(revenueResults, 75),
      p90: percentile(revenueResults, 90), mean: revenueResults.reduce((s, v) => s + v, 0) / config.iterations,
    },
    {
      metric: 'Annualized EBITDA',
      p10: percentile(ebitdaResults, 10), p25: percentile(ebitdaResults, 25),
      p50: percentile(ebitdaResults, 50), p75: percentile(ebitdaResults, 75),
      p90: percentile(ebitdaResults, 90), mean: ebitdaResults.reduce((s, v) => s + v, 0) / config.iterations,
    },
    {
      metric: 'Gross Margin',
      p10: percentile(grossMarginResults, 10), p25: percentile(grossMarginResults, 25),
      p50: percentile(grossMarginResults, 50), p75: percentile(grossMarginResults, 75),
      p90: percentile(grossMarginResults, 90), mean: grossMarginResults.reduce((s, v) => s + v, 0) / config.iterations,
    },
    {
      metric: 'Ending Cash',
      p10: percentile(cashResults, 10), p25: percentile(cashResults, 25),
      p50: percentile(cashResults, 50), p75: percentile(cashResults, 75),
      p90: percentile(cashResults, 90), mean: cashResults.reduce((s, v) => s + v, 0) / config.iterations,
    },
  ];
}

export function MonteCarloSimulation({ model }: Props) {
  const [config, setConfig] = useState<SimConfig>({
    iterations: 5000,
    revenueVolatility: 15,
    cogsVolatility: 10,
    opexVolatility: 8,
    horizonMonths: 12,
  });
  const [results, setResults] = useState<SimResult[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = useCallback(() => {
    setIsRunning(true);
    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      const r = runSimulation(model, config);
      setResults(r);
      setIsRunning(false);
    }, 50);
  }, [model, config]);

  const fmt = (metric: string, v: number) => {
    if (metric === 'Gross Margin') return `${v.toFixed(1)}%`;
    return fmtCurrency(v, true);
  };

  return (
    <div className="space-y-4">
      {/* Config */}
      <Card className="border-border/30">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Dice5 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Monte Carlo Simulation</h3>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {config.iterations.toLocaleString()} iterations
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Simulate probability distributions of financial outcomes by varying revenue, COGS, and OpEx with random shocks.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Revenue Volatility</Label>
              <Slider value={[config.revenueVolatility]} min={1} max={40} step={1}
                onValueChange={([v]) => setConfig(c => ({ ...c, revenueVolatility: v }))} />
              <span className="text-[10px] text-muted-foreground">{config.revenueVolatility}% σ</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">COGS Volatility</Label>
              <Slider value={[config.cogsVolatility]} min={1} max={30} step={1}
                onValueChange={([v]) => setConfig(c => ({ ...c, cogsVolatility: v }))} />
              <span className="text-[10px] text-muted-foreground">{config.cogsVolatility}% σ</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">OpEx Volatility</Label>
              <Slider value={[config.opexVolatility]} min={1} max={25} step={1}
                onValueChange={([v]) => setConfig(c => ({ ...c, opexVolatility: v }))} />
              <span className="text-[10px] text-muted-foreground">{config.opexVolatility}% σ</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Horizon (months)</Label>
              <Slider value={[config.horizonMonths]} min={3} max={36} step={3}
                onValueChange={([v]) => setConfig(c => ({ ...c, horizonMonths: v }))} />
              <span className="text-[10px] text-muted-foreground">{config.horizonMonths} months</span>
            </div>
          </div>

          <Button size="sm" onClick={handleRun} disabled={isRunning} className="gap-1.5">
            {isRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {isRunning ? 'Running…' : 'Run Simulation'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card className="border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Probability Distribution</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Metric</th>
                    <th className="text-right py-2 px-2 font-medium text-destructive/70">P10 (Bear)</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">P25</th>
                    <th className="text-right py-2 px-2 font-medium font-semibold">P50 (Base)</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">P75</th>
                    <th className="text-right py-2 px-2 font-medium text-emerald-500/70">P90 (Bull)</th>
                    <th className="text-right py-2 px-2 font-medium text-primary">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.metric} className="border-b border-border/10 hover:bg-muted/20">
                      <td className="py-2 px-2 font-medium">{r.metric}</td>
                      <td className="text-right py-2 px-2 font-mono text-destructive/70">{fmt(r.metric, r.p10)}</td>
                      <td className="text-right py-2 px-2 font-mono text-muted-foreground">{fmt(r.metric, r.p25)}</td>
                      <td className="text-right py-2 px-2 font-mono font-semibold">{fmt(r.metric, r.p50)}</td>
                      <td className="text-right py-2 px-2 font-mono text-muted-foreground">{fmt(r.metric, r.p75)}</td>
                      <td className="text-right py-2 px-2 font-mono text-emerald-500/70">{fmt(r.metric, r.p90)}</td>
                      <td className="text-right py-2 px-2 font-mono text-primary">{fmt(r.metric, r.mean)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Visual distribution bars */}
            <div className="mt-4 space-y-3">
              {results.map(r => {
                const min = r.p10;
                const max = r.p90;
                const range = max - min || 1;
                const p25Pct = ((r.p25 - min) / range) * 100;
                const p50Pct = ((r.p50 - min) / range) * 100;
                const p75Pct = ((r.p75 - min) / range) * 100;

                return (
                  <div key={r.metric} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium">{r.metric}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {fmt(r.metric, r.p10)} — {fmt(r.metric, r.p90)}
                      </span>
                    </div>
                    <div className="relative h-4 bg-muted/20 rounded-full overflow-hidden">
                      {/* IQR band */}
                      <div className="absolute h-full bg-primary/20 rounded-full"
                        style={{ left: `${p25Pct}%`, width: `${p75Pct - p25Pct}%` }} />
                      {/* Median line */}
                      <div className="absolute top-0 h-full w-0.5 bg-primary"
                        style={{ left: `${p50Pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Risk summary */}
            <div className="mt-4 p-3 rounded-md bg-muted/10 border border-border/20">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold">Risk Summary</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Probability of negative EBITDA: </span>
                  <span className="font-mono font-semibold">
                    {results[1].p10 < 0 ? (results[1].p25 < 0 ? '>25%' : '10-25%') : '<10%'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Revenue downside (P10): </span>
                  <span className="font-mono font-semibold">{fmt('Annualized Revenue', results[0].p10)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cash at risk (P10): </span>
                  <span className={cn("font-mono font-semibold", results[3].p10 < 0 && "text-destructive")}>
                    {fmt('Ending Cash', results[3].p10)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Margin compression (P10): </span>
                  <span className="font-mono font-semibold">{fmt('Gross Margin', results[2].p10)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
