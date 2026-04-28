import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ShieldAlert, Zap, AlertTriangle, CheckCircle, XCircle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart
} from 'recharts';

// ── Stress Scenarios ────────────────────────────────────────────────────────────
interface StressScenario {
  id: string;
  name: string;
  description: string;
  severity: 'moderate' | 'severe' | 'extreme';
  revenueShock: number;  // % change
  costShock: number;     // % change
  churnSpike: number;    // multiplier
  collectionDelay: number; // days
}

const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'rev_decline',
    name: 'Revenue Shock',
    description: 'Key customer churn + pipeline stalls',
    severity: 'severe',
    revenueShock: -25,
    costShock: 0,
    churnSpike: 2.5,
    collectionDelay: 0,
  },
  {
    id: 'collections_crisis',
    name: 'Collections Crisis',
    description: 'DSO spikes, AR backlog builds',
    severity: 'moderate',
    revenueShock: -5,
    costShock: 5,
    churnSpike: 1.2,
    collectionDelay: 45,
  },
  {
    id: 'cost_explosion',
    name: 'Cost Explosion',
    description: 'Infra + headcount costs surge',
    severity: 'severe',
    revenueShock: 0,
    costShock: 30,
    churnSpike: 1.0,
    collectionDelay: 0,
  },
  {
    id: 'black_swan',
    name: 'Black Swan',
    description: 'Simultaneous revenue + cost shock',
    severity: 'extreme',
    revenueShock: -40,
    costShock: 20,
    churnSpike: 3.0,
    collectionDelay: 60,
  },
];

const fmtCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export function StressTesting() {
  const baseRevenue = 1200000;
  const baseCash = 500000;
  const baseMargin = 0.45;
  const baseOpexRatio = 0.3;

  const [selectedScenario, setSelectedScenario] = useState<string>('rev_decline');
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const scenario = STRESS_SCENARIOS.find(s => s.id === selectedScenario)!;

  const runStressTest = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
    }, 800);
  };

  // Project 12-month cash position under stress
  const projections = useMemo(() => {
    const months: { month: string; baseline: number; stressed: number }[] = [];
    let baseCashPos = baseCash;
    let stressCashPos = baseCash;
    const monthlyRev = baseRevenue / 12;
    const monthlyOpex = baseRevenue * baseOpexRatio / 12;
    const monthlyCogs = monthlyRev * (1 - baseMargin);

    for (let i = 0; i < 12; i++) {
      const label = `M${i + 1}`;
      
      // Baseline
      const baseNet = monthlyRev - monthlyCogs - monthlyOpex;
      baseCashPos += baseNet;

      // Stressed
      const stressedRev = monthlyRev * (1 + scenario.revenueShock / 100);
      const stressedCogs = stressedRev * (1 - baseMargin * (1 - scenario.churnSpike * 0.02));
      const stressedOpex = monthlyOpex * (1 + scenario.costShock / 100);
      const collectionHit = scenario.collectionDelay > 0 ? stressedRev * (scenario.collectionDelay / 90) * 0.3 : 0;
      const stressNet = stressedRev - stressedCogs - stressedOpex - collectionHit;
      stressCashPos += stressNet;

      months.push({ month: label, baseline: Math.round(baseCashPos), stressed: Math.round(stressCashPos) });
    }
    return months;
  }, [scenario, baseRevenue, baseCash]);

  const insolvencyMonth = projections.findIndex(p => p.stressed <= 0);
  const minCash = Math.min(...projections.map(p => p.stressed));
  const survivalScore = insolvencyMonth === -1 ? 100 : Math.round((insolvencyMonth / 12) * 100);

  const severityColor: Record<string, string> = {
    moderate: 'text-warning border-warning/30',
    severe: 'text-destructive border-destructive/30',
    extreme: 'text-destructive border-destructive/30',
  };

  return (
    <div className="space-y-4">
      {/* Scenario Picker */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STRESS_SCENARIOS.map(s => (
          <Card
            key={s.id}
            className={cn(
              "cursor-pointer transition-all border-border/50 hover:border-primary/50",
              selectedScenario === s.id && "border-primary ring-1 ring-primary/20"
            )}
            onClick={() => { setSelectedScenario(s.id); setHasRun(false); }}
          >
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{s.name}</span>
                <Badge variant="outline" className={cn("text-[8px]", severityColor[s.severity])}>
                  {s.severity}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">{s.description}</p>
              <div className="flex gap-2 text-[9px] text-muted-foreground">
                {s.revenueShock !== 0 && <span>Rev: {s.revenueShock > 0 ? '+' : ''}{s.revenueShock}%</span>}
                {s.costShock !== 0 && <span>Cost: +{s.costShock}%</span>}
                {s.churnSpike > 1 && <span>Churn: {s.churnSpike}×</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Run Button + Results */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Stress Test: {scenario.name}
            </CardTitle>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={runStressTest} disabled={isRunning}>
              {isRunning ? <Zap className="h-3 w-3 animate-pulse" /> : <Play className="h-3 w-3" />}
              {isRunning ? 'Running…' : 'Run Test'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!hasRun ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Select a scenario and click "Run Test"
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Survival Score</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-lg font-bold",
                      survivalScore >= 80 ? "text-success" : survivalScore >= 50 ? "text-warning" : "text-destructive"
                    )}>
                      {survivalScore}%
                    </span>
                    {survivalScore >= 80 ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  </div>
                  <Progress value={survivalScore} className="h-1.5" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Insolvency Risk</span>
                  <span className={cn(
                    "text-lg font-bold block",
                    insolvencyMonth === -1 ? "text-success" : "text-destructive"
                  )}>
                    {insolvencyMonth === -1 ? 'None' : `Month ${insolvencyMonth + 1}`}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Min Cash Position</span>
                  <span className={cn(
                    "text-lg font-bold block",
                    minCash > 100000 ? "text-success" : minCash > 0 ? "text-warning" : "text-destructive"
                  )}>
                    {fmtCurrency(minCash)}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">12-Mo End Cash</span>
                  <span className={cn(
                    "text-lg font-bold block",
                    projections[11].stressed > 0 ? "text-success" : "text-destructive"
                  )}>
                    {fmtCurrency(projections[11].stressed)}
                  </span>
                </div>
              </div>

              {/* Cash Position Chart */}
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projections}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: 'Insolvency', fontSize: 9, fill: 'hsl(var(--destructive))' }} />
                    <Area type="monotone" dataKey="baseline" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={1} name="Baseline" />
                    <Area type="monotone" dataKey="stressed" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.1} strokeWidth={1} strokeDasharray="5 3" name="Stressed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Risk Alerts */}
              {insolvencyMonth !== -1 && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-destructive">Insolvency Warning</p>
                    <p className="text-muted-foreground">
                      Under the <strong>{scenario.name}</strong> scenario, cash position reaches zero by <strong>Month {insolvencyMonth + 1}</strong>. 
                      Consider securing bridge financing or reducing burn by {fmtCurrency(Math.abs(projections[insolvencyMonth]?.stressed || 0))} to survive.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
