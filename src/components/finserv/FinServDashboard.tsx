import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Target, Plus, Percent, Clock, AlertTriangle, TrendingUp, Users, Lightbulb, Trophy, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { useFinServMetrics, FinServInsight } from '@/hooks/useFinServMetrics';

function KpiCard({ label, value, icon: Icon, color, subtext }: {
  label: string; value: string | number; icon: React.ElementType; color: string; subtext?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3 flex items-start gap-3">
        <div className={cn("h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0", color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
          {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatValue(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}

const insightIcon: Record<FinServInsight['type'], { icon: React.ElementType; color: string }> = {
  bottleneck: { icon: AlertTriangle, color: 'text-yellow-500' },
  strength: { icon: TrendingUp, color: 'text-green-500' },
  risk: { icon: AlertTriangle, color: 'text-red-500' },
  opportunity: { icon: Lightbulb, color: 'text-blue-500' },
};

export function FinServDashboard({ deals, stages }: { deals: Deal[]; stages: DealStageOption[] }) {
  const { kpis, stageMetrics, topClients, insights } = useFinServMetrics(deals, stages);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        <KpiCard label="Total Deals" value={kpis.totalDeals} icon={BarChart3} color="bg-primary" />
        <KpiCard label="Active" value={kpis.activeDeals} icon={Target} color="bg-chart-2" />
        <KpiCard label="Weighted Value" value={formatValue(kpis.weightedValue)} icon={Target} color="bg-chart-3" />
        <KpiCard label="Added (30d)" value={kpis.addedLast30} icon={Plus} color="bg-chart-4" />
        <KpiCard label="Win Rate" value={`${kpis.winRate}%`} icon={TrendingUp} color="bg-green-600" subtext={`${kpis.wonCount}W / ${kpis.lostCount}L`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline Stats + Conversion */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Pipeline Stats & Conversion</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium text-right">Deals</th>
                    <th className="px-4 py-2 font-medium text-right">Value</th>
                    <th className="px-4 py-2 font-medium text-right">Avg Days</th>
                    <th className="px-4 py-2 font-medium text-right">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {stageMetrics.map(s => (
                    <tr key={s.stageId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{s.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatValue(s.value)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.avgDays}d</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className={cn(
                          s.conversionRate >= 50 ? 'text-green-500' : s.conversionRate >= 25 ? 'text-yellow-500' : 'text-muted-foreground',
                        )}>{s.conversionRate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Timing Metrics */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Avg Days in Stage</span>
                <span className="text-sm font-semibold tabular-nums">{kpis.avgDaysInStage}d</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">At Risk</span>
                <span className="text-sm font-semibold tabular-nums text-yellow-500">{kpis.atRiskCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Stalled (14d+)</span>
                <span className="text-sm font-semibold tabular-nums text-orange-500">{kpis.stalledCount}</span>
              </div>
            </CardContent>
          </Card>

          {/* Top Active Clients (deals currently in the Active Client stage only) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Trophy className="h-4 w-4" /> Top Active Clients
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topClients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals in the Active Client stage yet.</p>
              ) : topClients.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.dealCount} deal{c.dealCount !== 1 ? 's' : ''} · {formatValue(c.totalValue)}</p>
                  </div>
                </div>
              ))}
              {topClients.length > 0 && topClients.length < 3 && (
                <p className="text-[10px] text-muted-foreground italic pt-1">
                  Showing all active clients. Add more Active Client deals to expand this list.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.map(insight => {
                const cfg = insightIcon[insight.type];
                return (
                  <div key={insight.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/30">
                    <cfg.icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", cfg.color)} />
                    <p className="text-sm">{insight.message}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
