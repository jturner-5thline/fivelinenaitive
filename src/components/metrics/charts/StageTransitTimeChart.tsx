import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell,
} from 'recharts';
import { useStageTransitMetrics, type StageTransitBucket } from '@/hooks/useStageTransitMetrics';

const PROPOSAL_ISSUED_VARIANTS = ['Proposal Issued', 'proposal-issued'];
const FINAL_CREDIT_ITEMS_VARIANTS = ['Final Credit Items', 'final-credit-items'];

// Matches the green accent on the Stage Movement chart above.
const BAR_COLOR = 'hsl(var(--success))';
const OPEN_BAR_COLOR = 'hsl(var(--muted-foreground))';

export function StageTransitTimeChart() {
  const { buckets, completedCount, openCount, isLoading, lastRefresh } = useStageTransitMetrics({
    fromVariants: PROPOSAL_ISSUED_VARIANTS,
    toVariants: FINAL_CREDIT_ITEMS_VARIANTS,
    windowMonths: 12,
  });

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="mt-1 h-3 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const refreshIso = (lastRefresh ?? new Date()).toISOString();

  // Hide zero-deal closed bars: passing null to Recharts skips rendering
  // (avoids the misleading "0.0 month" bar). Open bucket always renders.
  const chartData = buckets.map((b) => ({
    ...b,
    avgMonths: b.dealCount === 0 && !b.isOpen ? null : b.avgMonths,
  }));

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">
            TIME TO FINAL CREDIT ITEMS — PROPOSAL ISSUED → FINAL CREDIT ITEMS
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Months from Proposal Issued → Final Credit Items · Trailing 12 months · Includes all deals where either stage entry occurred in window
          </p>
        </div>
        <div className="text-right flex gap-4">
          <div>
            <p className="text-lg font-bold text-foreground">{completedCount}</p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </div>
          <div>
            <p className="text-lg font-bold text-muted-foreground">{openCount}</p>
            <p className="text-[10px] text-muted-foreground">Open</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => `${v.toFixed(1)}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const b = payload[0].payload as StageTransitBucket;
                  if (b.isOpen) {
                    return (
                      <div
                        style={{
                          backgroundColor: 'hsl(var(--popover) / 0.96)',
                          border: '1px solid hsl(0 0% 100% / 0.14)',
                          borderRadius: 8,
                          padding: '8px 10px',
                          fontSize: 12,
                          color: 'hsl(0 0% 100%)',
                          maxWidth: 280,
                          boxShadow: 'var(--shadow-xl)',
                          backdropFilter: 'blur(16px)',
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Open · still pre-FCI</div>
                        <div>Avg running: {b.avgMonths.toFixed(1)} months</div>
                        <div>Deals: {b.dealCount}</div>
                      </div>
                    );
                  }
                  if (b.dealCount === 0) {
                    return (
                      <div
                        style={{
                          backgroundColor: 'hsl(var(--popover) / 0.96)',
                          border: '1px solid hsl(0 0% 100% / 0.14)',
                          borderRadius: 8,
                          padding: '8px 10px',
                          fontSize: 12,
                          color: 'hsl(0 0% 100%)',
                          boxShadow: 'var(--shadow-xl)',
                          backdropFilter: 'blur(16px)',
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                        <div>No deals reached FCI in this month</div>
                      </div>
                    );
                  }
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: 'hsl(0 0% 100%)',
                        maxWidth: 280,
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                      <div>Avg: {b.avgMonths.toFixed(1)} months</div>
                      <div>Median: {b.medianMonths.toFixed(1)} months</div>
                      <div>Deals: {b.dealCount}</div>
                    </div>
                  );
                }}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Bar
                dataKey="avgMonths"
                name="Avg months"
                fill={BAR_COLOR}
                fillOpacity={0.9}
                radius={[3, 3, 0, 0]}
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={entry.isOpen ? OPEN_BAR_COLOR : BAR_COLOR}
                    fillOpacity={entry.isOpen ? 0.25 : 0.9}
                    stroke={entry.isOpen ? OPEN_BAR_COLOR : undefined}
                    strokeWidth={entry.isOpen ? 1.5 : 0}
                    strokeDasharray={entry.isOpen ? '4 3' : undefined}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="pt-2 text-[10px] text-muted-foreground/70 font-mono">
          data source: deal_stage_history · source: all · last refresh: {refreshIso}
        </div>
      </CardContent>
    </Card>
  );
}
