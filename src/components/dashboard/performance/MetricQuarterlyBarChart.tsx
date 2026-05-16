import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Cell,
  LabelList,
  Scatter,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Eye } from 'lucide-react';
import { formatUSD } from '@/lib/formatters/currency';
import { cn } from '@/lib/utils';
import {
  NIKI_QUARTERS,
  type MetricRow,
  type QuarterKey,
} from '@/hooks/useNikiPerformanceMetrics';
import { useNikiPerformancePlan } from '@/hooks/useNikiPerformancePlan';

function fmt(value: number, unit: 'count' | 'currency'): string {
  if (unit === 'currency') return formatUSD(value);
  return value.toLocaleString('en-US');
}

interface MetricQuarterlyBarChartProps {
  row: MetricRow;
  onBarClick?: (quarter: QuarterKey) => void;
  mode?: 'quarterly' | 'ytd';
  onToggleHide?: () => void;
}

/** Custom Scatter shape: horizontal dashed segment at the Plan value, spanning bar width. */
function PlanTick(props: any) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  const half = 22;
  return (
    <g pointerEvents="none">
      <line
        x1={cx - half}
        x2={cx + half}
        y1={cy}
        y2={cy}
        stroke="hsl(var(--foreground))"
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.85}
      />
    </g>
  );
}

const QUARTER_ORDER: QuarterKey[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export function MetricQuarterlyBarChart({ row, onBarClick, mode = 'quarterly', onToggleHide }: MetricQuarterlyBarChartProps) {
  const { plan } = useNikiPerformancePlan();
  const planTotals = plan[row.key];
  const data = useMemo(() => {
    let cumPlan = 0;
    let cumActual = 0;
    return NIKI_QUARTERS.map((q) => {
      const qPlan = planTotals[q.key];
      const qActual = row.byQuarter[q.key].value;
      cumPlan += qPlan;
      cumActual += qActual;
      const planVal = mode === 'ytd' ? cumPlan : qPlan;
      const actualVal = mode === 'ytd' ? cumActual : qActual;
      const diff = actualVal - planVal;
      const pct = planVal ? diff / planVal : null;
      return {
        quarter: q.key,
        actual: actualVal,
        plan: planVal,
        diff,
        pct,
        ahead: actualVal >= planVal,
      };
    });
  }, [row, planTotals, mode]);

  const ytdActual = row.yearTotal;
  const ytdPlan = planTotals.total;
  const ytdDiff = ytdActual - ytdPlan;
  const ytdPct = ytdPlan ? ytdDiff / ytdPlan : null;
  const ytdAhead = ytdActual >= ytdPlan;

  const yMax = Math.max(
    1,
    ...data.map((d) => Math.max(d.actual, d.plan)),
  );
  // Add 15% headroom for plan ticks/labels
  const yDomainMax = yMax * 1.15;

  const tickFormatter = (v: number) => {
    if (row.unit === 'currency') {
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}MM`;
      if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
      return `$${v}`;
    }
    return v.toLocaleString('en-US');
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              {row.label}
              {mode === 'ytd' && (
                <span className="ml-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">YTD</span>
              )}
            </CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              YTD <span className="text-foreground font-semibold">{fmt(ytdActual, row.unit)}</span>
              <span className="text-muted-foreground"> / {fmt(ytdPlan, row.unit)}</span>
              {ytdPct !== null && (
                <span className={cn('ml-1.5 font-medium', ytdAhead ? 'text-emerald-500' : 'text-destructive')}>
                  {ytdPct >= 0 ? '+' : ''}{(ytdPct * 100).toFixed(0)}%
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-shrink-0">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" />
              Actual
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-px border-t border-dashed border-foreground/80" />
              Plan
            </span>
            {onToggleHide && (
              <button
                type="button"
                onClick={onToggleHide}
                aria-label="Hide chart"
                title="Hide chart"
                className="ml-1 inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis dataKey="quarter" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickFormatter={tickFormatter}
                width={56}
                tickLine={false}
                axisLine={false}
                domain={[0, yDomainMax]}
              />
              <RTooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 11,
                  padding: 8,
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof data[number];
                  const ahead = d.actual >= d.plan;
                  return (
                    <div className="rounded-md border border-border bg-card px-2.5 py-2 text-[11px] shadow-sm">
                      <div className="font-semibold text-foreground mb-1">{d.quarter} 2026</div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
                        <span className="text-muted-foreground">Actual</span>
                        <span className="text-right text-foreground font-medium">{fmt(d.actual, row.unit)}</span>
                        <span className="text-muted-foreground">Plan</span>
                        <span className="text-right text-foreground/80">{fmt(d.plan, row.unit)}</span>
                        <span className="text-muted-foreground">Δ</span>
                        <span className={cn('text-right font-medium', ahead ? 'text-emerald-500' : 'text-destructive')}>
                          {d.diff >= 0 ? '+' : ''}{fmt(d.diff, row.unit)}
                        </span>
                        <span className="text-muted-foreground">Var %</span>
                        <span className={cn('text-right font-medium', ahead ? 'text-emerald-500' : 'text-destructive')}>
                          {d.pct === null ? '—' : `${d.pct >= 0 ? '+' : ''}${(d.pct * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="actual"
                radius={[4, 4, 0, 0]}
                maxBarSize={42}
                onClick={(d: any) => onBarClick?.(d.quarter as QuarterKey)}
                cursor={onBarClick ? 'pointer' : 'default'}
              >
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.ahead ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                    fillOpacity={d.actual === 0 ? 0.25 : 0.9}
                  />
                ))}
                <LabelList
                  dataKey="actual"
                  position="top"
                  formatter={(v: number) => (v === 0 ? '' : tickFormatter(v))}
                  style={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
                />
              </Bar>
              {/* Plan tick segments per quarter */}
              <Scatter
                dataKey="plan"
                shape={<PlanTick />}
                isAnimationActive={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
