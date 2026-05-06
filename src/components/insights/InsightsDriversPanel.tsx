import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { useInsightsDrivers } from '@/hooks/useInsightsDrivers';
import { formatDeltaValue } from '@/hooks/useInsightsComparison';
import { cn } from '@/lib/utils';
import { DriverDrillDownDialog } from './DriverDrillDownDialog';

const METRIC_LABELS: Record<string, string> = {
  'qb-revenue': 'Revenue drivers (by customer)',
  'qb-expenses': 'Expense drivers (by category)',
  'qb-payments': 'Payment drivers (by customer)',
};

export function InsightsDriversPanel() {
  const { drivers, isLoading } = useInsightsDrivers();
  const entries = Object.values(drivers).filter(d => d.contributors.length > 0);
  const [drill, setDrill] = useState<{
    metricKey: 'qb-revenue' | 'qb-payments' | 'qb-expenses';
    name: string;
    delta: number;
    totalDelta: number;
  } | null>(null);

  if (isLoading) return null;
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Driver Attribution
          <Badge variant="outline" className="ml-1 text-[10px]">Top contributors to MoM change</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {entries.map(b => (
          <div key={b.metricKey} className="rounded-lg border border-border/50 p-3 bg-muted/20 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-2">{METRIC_LABELS[b.metricKey] ?? b.metricKey}</p>
            <p className="text-[10px] text-muted-foreground mb-2">
              Total Δ {formatDeltaValue(b.totalDelta, 'currency')}
            </p>
            <ul className="space-y-1.5">
              {b.contributors.map(c => {
                const positive = c.delta >= 0;
                return (
                  <li key={c.name}>
                    <button
                      type="button"
                      onClick={() =>
                        setDrill({
                          metricKey: b.metricKey as 'qb-revenue' | 'qb-payments' | 'qb-expenses',
                          name: c.name,
                          delta: c.delta,
                          totalDelta: b.totalDelta,
                        })
                      }
                      className="w-full flex items-center justify-between gap-2 text-xs min-w-0 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-accent/60 hover:text-accent-foreground transition-colors text-left"
                      title={`Drill into ${c.name}`}
                    >
                      <span className="truncate underline-offset-2 hover:underline">{c.name}</span>
                      <span className={cn('tabular-nums shrink-0', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                      {positive ? '+' : ''}{formatDeltaValue(c.delta, 'currency')}
                      <span className="ml-1 opacity-70">({c.pctOfDelta >= 0 ? '+' : ''}{c.pctOfDelta.toFixed(0)}%)</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
      <DriverDrillDownDialog
        open={!!drill}
        onOpenChange={open => !open && setDrill(null)}
        metricKey={drill?.metricKey ?? null}
        contributorName={drill?.name ?? null}
        contributorDelta={drill?.delta ?? 0}
        totalDelta={drill?.totalDelta ?? 0}
      />
    </Card>
  );
}
