import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Clock, AlertTriangle, Target, Plus, BarChart3, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NaitivePipelineKPIs } from '@/hooks/useNaitivePipelineMetrics';

interface NaitivePipelineKPIStripProps {
  kpis: NaitivePipelineKPIs & { stageConversionRate: number };
}

function KpiCard({ label, value, icon: Icon, color, subtext }: {
  label: string; value: string | number; icon: React.ElementType; color: string; subtext?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn("h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0", color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate leading-tight">{label}</p>
          <p className="text-xl font-bold text-foreground leading-tight tracking-tight mt-1">{value}</p>
          {subtext && <p className="text-[10px] text-muted-foreground mt-1 truncate">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function NaitivePipelineKPIStrip({ kpis }: NaitivePipelineKPIStripProps) {
  const formattedValue = kpis.weightedPipelineValue >= 1_000_000
    ? `$${(kpis.weightedPipelineValue / 1_000_000).toFixed(1)}M`
    : kpis.weightedPipelineValue >= 1_000
      ? `$${(kpis.weightedPipelineValue / 1_000).toFixed(0)}k`
      : `$${kpis.weightedPipelineValue.toLocaleString()}`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <KpiCard label="Total Deals" value={kpis.totalDeals} icon={BarChart3} color="bg-primary" />
      <KpiCard label="Weighted Value" value={formattedValue} icon={Target} color="bg-chart-2" />
      <KpiCard label="Added (30d)" value={kpis.dealsAddedLast30Days} icon={Plus} color="bg-chart-3" />
      <KpiCard label="Conversion" value={`${kpis.stageConversionRate}%`} icon={Percent} color="bg-chart-4" />
      <KpiCard label="Avg Days in Stage" value={`${kpis.avgDaysInCurrentStage}d`} icon={Clock} color="bg-chart-5" />
      <KpiCard label="At Risk" value={kpis.atRiskDeals} icon={AlertTriangle} color="bg-yellow-600" />
      <KpiCard label="Stalled" value={kpis.stalledDeals} icon={Clock} color="bg-orange-600" />
      <KpiCard
        label="Won Rate"
        value={`${kpis.closedWonRate}%`}
        icon={TrendingUp}
        color="bg-green-600"
        subtext={`${kpis.closedWonCount}W / ${kpis.closedLostCount}L`}
      />
    </div>
  );
}
