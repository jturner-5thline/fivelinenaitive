import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { useStageTransitMetrics, type StageTransitBucket } from '@/hooks/useStageTransitMetrics';

const PROPOSAL_ISSUED_VARIANTS = ['Proposal Issued', 'proposal-issued'];
const FINAL_CREDIT_ITEMS_VARIANTS = ['Final Credit Items', 'final-credit-items'];

// Matches the green accent on the Stage Movement chart above.
const BAR_COLOR = 'hsl(var(--success))';

export function StageTransitTimeChart() {
  const { buckets, totalDeals, isLoading, lastRefresh } = useStageTransitMetrics({
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

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">
            TIME TO FINAL CREDIT ITEMS — PROPOSAL ISSUED → FINAL CREDIT ITEMS
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Months from Proposal Issued → Final Credit Items · Trailing 12 months · All deals with both stage entries in window
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{totalDeals}</p>
          <p className="text-[10px] text-muted-foreground">TTM Deals</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
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
                      <div>Avg time: {b.avgMonths.toFixed(1)} months</div>
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
              />
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
