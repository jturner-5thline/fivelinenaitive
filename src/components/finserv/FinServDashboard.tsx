import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Target, Plus, Clock, AlertTriangle, TrendingUp, Lightbulb, Trophy } from 'lucide-react';
import { differenceInDays, subDays, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { useFinServMetrics, FinServInsight } from '@/hooks/useFinServMetrics';
import { useNavigate } from 'react-router-dom';
import { FinServDrillDownSheet, FinServDrillDownConfig } from './FinServDrillDownSheet';

// Canonical stage IDs — keep in sync with useFinServMetrics + FINSERV_STAGES.
const ACTIVE_CLIENT_STAGE = 'fs-closed-won';
const WON_STAGES = ['fs-closed-won'];
const LOST_STAGES = ['fs-churned', 'fs-closed-lost'];
const EXCLUDED_FROM_AGGREGATES = ['fs-in-development', 'fs-churned', 'fs-closed-lost'];
const TERMINAL_STAGES = [...WON_STAGES, ...LOST_STAGES];

function KpiCard({ label, value, icon: Icon, color, subtext, onClick }: {
  label: string; value: string | number; icon: React.ElementType; color: string; subtext?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        'bg-card border-border transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/30 hover:border-primary/40',
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
    >
      <CardContent className="p-3 flex items-start gap-3">
        <div className={cn('h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0', color)}>
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

/** Compact currency for MRR rows — "$5.00K", "$1.50K", "$1.25MM". */
function formatMrr(v: number) {
  if (!v) return '$0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  return `$${(v / 1_000).toFixed(2)}K`;
}

const insightIcon: Record<FinServInsight['type'], { icon: React.ElementType; color: string }> = {
  bottleneck: { icon: AlertTriangle, color: 'text-yellow-500' },
  strength: { icon: TrendingUp, color: 'text-green-500' },
  risk: { icon: AlertTriangle, color: 'text-red-500' },
  opportunity: { icon: Lightbulb, color: 'text-blue-500' },
};

export function FinServDashboard({ deals, stages }: { deals: Deal[]; stages: DealStageOption[] }) {
  const { kpis, stageMetrics, topClients, insights } = useFinServMetrics(deals, stages, 5);
  const navigate = useNavigate();
  const [drill, setDrill] = useState<FinServDrillDownConfig | null>(null);
  const open = (config: FinServDrillDownConfig) => setDrill(config);

  // Deal sets that mirror the metric formulas. Recomputed from the same
  // `deals` array the hook consumes so dashboard filters (owner, etc.)
  // propagate consistently and Churned/Lost stay excluded from aggregates.
  const { aggregateDeals, activeDeals, wonDeals, lostDeals, addedLast30Deals, stalledDeals } = useMemo(() => {
    const now = new Date();
    const thirty = subDays(now, 30);
    const agg = deals.filter(d => !EXCLUDED_FROM_AGGREGATES.includes(d.stage));
    const active = agg.filter(d => !TERMINAL_STAGES.includes(d.stage));
    const won = agg.filter(d => WON_STAGES.includes(d.stage));
    const lost = deals.filter(d => LOST_STAGES.includes(d.stage));
    const added = agg.filter(d => isAfter(new Date(d.createdAt), thirty));
    const stalled = active.filter(d => differenceInDays(now, new Date(d.updatedAt)) >= 14);
    return { aggregateDeals: agg, activeDeals: active, wonDeals: won, lostDeals: lost, addedLast30Deals: added, stalledDeals: stalled };
  }, [deals]);

  const atRiskDeals = useMemo(() => aggregateDeals.filter(d => d.status === 'at-risk'), [aggregateDeals]);
  const stageOrder = useMemo(() => stages.filter(s => !EXCLUDED_FROM_AGGREGATES.includes(s.id)).map(s => s.id), [stages]);

  return (
    <div className="space-y-6">
      {/* KPI Strip — every card drills into its underlying deals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        <KpiCard
          label="Total Deals" value={kpis.totalDeals} icon={BarChart3} color="bg-primary"
          onClick={() => open({
            title: 'Total Deals',
            formula: 'All FinServ deals excluding Churned and Lost stages.',
            deals: aggregateDeals,
          })}
        />
        <KpiCard
          label="Active" value={kpis.activeDeals} icon={Target} color="bg-chart-2"
          onClick={() => open({
            title: 'Active Deals',
            formula: 'Deals not in a terminal stage (excludes Active Client wins, Churned, and Lost).',
            deals: activeDeals,
          })}
        />
        <KpiCard
          label="Weighted Value" value={formatValue(kpis.weightedValue)} icon={Target} color="bg-chart-3"
          onClick={() => open({
            title: 'Weighted Pipeline Value',
            formula: 'Σ (deal value × stage probability) across active, non-Churned/Lost deals.',
            deals: activeDeals,
          })}
        />
        <KpiCard
          label="Added (30d)" value={kpis.addedLast30} icon={Plus} color="bg-chart-4"
          onClick={() => open({
            title: 'Deals Added in the Last 30 Days',
            formula: 'Deals with createdAt within the last 30 days (excludes Churned/Lost).',
            deals: addedLast30Deals,
          })}
        />
        <KpiCard
          label="Win Rate" value={`${kpis.winRate}%`} icon={TrendingUp} color="bg-green-600"
          subtext={`${kpis.wonCount}W / ${kpis.lostCount}L`}
          onClick={() => open({
            title: 'Win Rate — Closed Deals',
            formula: 'Win Rate = Won / (Won + Lost). Shows every closed deal in either denominator side.',
            deals: [...wonDeals, ...lostDeals],
          })}
        />
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
                  {stageMetrics.map((s, idx) => {
                    const stageDeals = aggregateDeals.filter(d => d.stage === s.stageId);
                    const pastDeals = aggregateDeals.filter(d => {
                      const di = stageOrder.indexOf(d.stage);
                      return di > idx;
                    });
                    const drillStage = () => open({
                      title: `${s.label} — Deals`,
                      formula: `All deals currently in the "${s.label}" stage.`,
                      deals: stageDeals,
                    });
                    const drillConv = () => open({
                      title: `${s.label} — Conversion`,
                      formula: 'Conversion % = (deals past this stage) / (deals in this stage + past this stage). Drill-down lists both sets.',
                      deals: [...stageDeals, ...pastDeals],
                    });
                    return (
                      <tr key={s.stageId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">
                          <button type="button" onClick={drillStage} className="text-left hover:text-primary transition-colors">{s.label}</button>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <button type="button" onClick={drillStage} className="hover:text-primary transition-colors">{s.count}</button>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <button type="button" onClick={drillStage} className="hover:text-primary transition-colors">{formatValue(s.value)}</button>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <button type="button" onClick={drillStage} className="hover:text-primary transition-colors">{s.avgDays}d</button>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <button
                            type="button"
                            onClick={drillConv}
                            className={cn(
                              'hover:underline transition-colors',
                              s.conversionRate >= 50 ? 'text-green-500' : s.conversionRate >= 25 ? 'text-yellow-500' : 'text-muted-foreground',
                            )}
                          >{s.conversionRate}%</button>
                        </td>
                      </tr>
                    );
                  })}
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
            <CardContent className="space-y-1">
              <button
                type="button"
                onClick={() => open({
                  title: 'Avg Days in Stage — Active Deals',
                  formula: 'Average of (now − last updated) across active deals. Drill-down lists every active deal feeding this average.',
                  deals: activeDeals,
                })}
                className="w-full flex justify-between items-center px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm text-muted-foreground">Avg Days in Stage</span>
                <span className="text-sm font-semibold tabular-nums">{kpis.avgDaysInStage}d</span>
              </button>
              <button
                type="button"
                onClick={() => open({
                  title: 'At-Risk Deals',
                  formula: 'Deals with status = "at-risk" (excludes Churned/Lost).',
                  deals: atRiskDeals,
                })}
                className="w-full flex justify-between items-center px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm text-muted-foreground">At Risk</span>
                <span className="text-sm font-semibold tabular-nums text-yellow-500">{kpis.atRiskCount}</span>
              </button>
              <button
                type="button"
                onClick={() => open({
                  title: 'Stalled Deals (14d+)',
                  formula: 'Active deals with no update in 14+ days.',
                  deals: stalledDeals,
                })}
                className="w-full flex justify-between items-center px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm text-muted-foreground">Stalled (14d+)</span>
                <span className="text-sm font-semibold tabular-nums text-orange-500">{kpis.stalledCount}</span>
              </button>
            </CardContent>
          </Card>

          {/* Top Active Clients (deals currently in the Active Client stage only) */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Trophy className="h-4 w-4" /> Top Active Clients
              </CardTitle>
              <button
                type="button"
                className="text-[10px] uppercase tracking-wider text-primary hover:underline"
                onClick={() => open({
                  title: 'Active Clients — Ranked by MRR',
                  formula: 'All deals currently in the Active Client stage, sorted by MRR.',
                  deals: deals.filter(d => d.stage === ACTIVE_CLIENT_STAGE),
                })}
              >
                View all
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {topClients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals in the Active Client stage yet.</p>
              ) : topClients.map((c, i) => (
                <button
                  type="button"
                  key={c.dealId}
                  onClick={() => navigate(`/finserv?deal=${c.dealId}`)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-md text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                  <p className="text-sm font-medium truncate flex-1 min-w-0">{c.name}</p>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{formatMrr(c.mrr)}</span>
                </button>
              ))}
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

      <FinServDrillDownSheet config={drill} stages={stages} onOpenChange={(o) => !o && setDrill(null)} />
    </div>
  );
}
