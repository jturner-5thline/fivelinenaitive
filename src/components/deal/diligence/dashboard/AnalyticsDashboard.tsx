import { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, Shield, DollarSign, PieChart, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Legend, AreaChart, Area,
  BarChart, Cell, PieChart as RePieChart, Pie
} from 'recharts';
import { DetectedStatement, FinancialMetric, DataIssue } from '../types';
import { useFinancialCalculations, explainMetric, CalculatedMetrics } from '../calculations/useFinancialCalculations';
import { KPICard } from './KPICard';
import { MetricExplainDialog } from './MetricExplainDialog';

interface AnalyticsDashboardProps {
  statements: DetectedStatement[];
  metrics: FinancialMetric[];
  issues: DataIssue[];
  auditMode: boolean;
  className?: string;
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(142, 76%, 56%)',   // emerald
  'hsl(262, 83%, 68%)',   // purple
  'hsl(38, 92%, 60%)',    // amber
  'hsl(189, 94%, 53%)',   // cyan
  'hsl(330, 81%, 60%)',   // pink
];

function buildTimeSeriesData(statements: DetectedStatement[]) {
  const periods = new Set<string>();
  const metricsByPeriod: Record<string, Record<string, number | null>> = {};

  for (const s of statements) {
    for (const li of s.lineItems) {
      for (const v of li.values) {
        periods.add(v.period);
        if (!metricsByPeriod[v.period]) metricsByPeriod[v.period] = {};
        metricsByPeriod[v.period][li.standardKey] = v.value;
      }
    }
  }

  const sortedPeriods = Array.from(periods).sort();
  return sortedPeriods.map(p => ({
    period: p,
    ...(metricsByPeriod[p] || {}),
  }));
}

function buildMarginData(tsData: Record<string, any>[]) {
  return tsData.map(d => {
    const rev = d.revenue as number | undefined;
    return {
      period: d.period,
      grossMargin: rev && d.gross_profit ? ((d.gross_profit as number) / rev * 100) : null,
      ebitdaMargin: rev && d.ebitda ? ((d.ebitda as number) / rev * 100) : null,
      netMargin: rev && d.net_income ? ((d.net_income as number) / rev * 100) : null,
    };
  }).filter(d => d.grossMargin != null || d.ebitdaMargin != null || d.netMargin != null);
}

export function AnalyticsDashboard({ statements, metrics, issues, auditMode, className }: AnalyticsDashboardProps) {
  const calculated = useFinancialCalculations(statements, metrics);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainKey, setExplainKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const tsData = useMemo(() => buildTimeSeriesData(statements), [statements]);
  const marginData = useMemo(() => buildMarginData(tsData), [tsData]);

  const handleExplain = (key: string) => {
    setExplainKey(key);
    setExplainOpen(true);
  };

  const currentExplanation = explainKey ? explainMetric(explainKey, statements, calculated) : null;
  const currentMetric = explainKey ? calculated.all.find(m => m.key === explainKey) : null;

  const hasData = statements.length > 0 || metrics.length > 0;

  if (!hasData) {
    return (
      <div className={cn("text-center py-20 text-muted-foreground", className)}>
        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No financial data available</p>
        <p className="text-xs mt-1">Upload and extract VDR files to populate the dashboard</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* KPI Cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Key Metrics</h3>
          {auditMode && <Badge variant="outline" className="text-[9px] h-4">Audit Mode</Badge>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {[...calculated.growth.slice(0, 2), ...calculated.margins.slice(0, 2), ...calculated.leverage.slice(0, 1), ...calculated.coverage.slice(0, 1)].map(m => (
            <KPICard key={m.key} metric={m} onClick={() => handleExplain(m.key)} />
          ))}
        </div>
      </div>

      {/* Charts */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="overview" className="text-xs gap-1">
            <BarChart3 className="h-3 w-3" /> Revenue & EBITDA
          </TabsTrigger>
          <TabsTrigger value="margins" className="text-xs gap-1">
            <TrendingUp className="h-3 w-3" /> Margins
          </TabsTrigger>
          <TabsTrigger value="leverage" className="text-xs gap-1">
            <Shield className="h-3 w-3" /> Leverage & Coverage
          </TabsTrigger>
          <TabsTrigger value="details" className="text-xs gap-1">
            <DollarSign className="h-3 w-3" /> Detailed Metrics
          </TabsTrigger>
        </TabsList>

        {/* Revenue & EBITDA Combo Chart */}
        <TabsContent value="overview" className="mt-4">
          <div className="rounded-xl border border-border/30 bg-card p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Revenue & EBITDA Trend</h4>
            {tsData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={tsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                    <ReTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} opacity={0.8} />
                    <Bar dataKey="ebitda" name="EBITDA" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} opacity={0.8} />
                    <Line type="monotone" dataKey="net_income" name="Net Income" stroke={CHART_COLORS[2]} strokeWidth={1} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-12">No time-series data available</p>
            )}
          </div>
        </TabsContent>

        {/* Margin Trends */}
        <TabsContent value="margins" className="mt-4">
          <div className="rounded-xl border border-border/30 bg-card p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Margin Trends (%)</h4>
            {marginData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={marginData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
                    <ReTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => `${v?.toFixed(1)}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="grossMargin" name="Gross Margin" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.1} strokeWidth={1} />
                    <Area type="monotone" dataKey="ebitdaMargin" name="EBITDA Margin" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.1} strokeWidth={1} />
                    <Area type="monotone" dataKey="netMargin" name="Net Margin" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.1} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-12">Margin data not available</p>
            )}
          </div>
        </TabsContent>

        {/* Leverage & Coverage */}
        <TabsContent value="leverage" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Leverage KPIs */}
            <div className="rounded-xl border border-border/30 bg-card p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Leverage</h4>
              <div className="space-y-3">
                {calculated.leverage.map(m => (
                  <div key={m.key} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                    <button
                      onClick={() => handleExplain(m.key)}
                      className="text-sm font-mono font-semibold hover:text-primary transition-colors"
                    >
                      {m.formatted}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* Coverage KPIs */}
            <div className="rounded-xl border border-border/30 bg-card p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Coverage</h4>
              <div className="space-y-3">
                {calculated.coverage.map(m => (
                  <div key={m.key} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                    <button
                      onClick={() => handleExplain(m.key)}
                      className="text-sm font-mono font-semibold hover:text-primary transition-colors"
                    >
                      {m.formatted}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Detailed Metrics Grid */}
        <TabsContent value="details" className="mt-4">
          <div className="space-y-4">
            {([
              { title: 'Growth', icon: TrendingUp, metrics: calculated.growth },
              { title: 'Margins', icon: PieChart, metrics: calculated.margins },
              { title: 'Cash Flow', icon: DollarSign, metrics: calculated.cashFlow },
              { title: 'Leverage', icon: Shield, metrics: calculated.leverage },
              { title: 'Coverage', icon: Shield, metrics: calculated.coverage },
            ] as const).map(group => (
              group.metrics.length > 0 && (
                <div key={group.title}>
                  <div className="flex items-center gap-2 mb-2">
                    <group.icon className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {group.metrics.map(m => (
                      <KPICard key={m.key} metric={m} onClick={() => handleExplain(m.key)} />
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Issues Summary */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">{issues.length} Data Quality Issue{issues.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1.5">
            {issues.slice(0, 5).map(issue => (
              <div key={issue.id} className="flex items-start gap-2 text-xs">
                <span className={cn(
                  "mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0",
                  issue.severity === 'error' ? "bg-red-400" : issue.severity === 'warning' ? "bg-amber-400" : "bg-blue-400"
                )} />
                <span className="text-muted-foreground">{issue.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explain Dialog */}
      <MetricExplainDialog
        open={explainOpen}
        onOpenChange={setExplainOpen}
        metricLabel={currentMetric?.label || ''}
        explanation={currentExplanation}
      />
    </div>
  );
}
