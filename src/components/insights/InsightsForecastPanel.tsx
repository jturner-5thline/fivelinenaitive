import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { TrendingUp, Target, Pencil } from 'lucide-react';
import { useInsightsForecast } from '@/hooks/useInsightsForecast';
import { useInsightsTargets, useUpsertMetricTarget } from '@/hooks/useInsightsTargets';
import { formatDeltaValue } from '@/hooks/useInsightsComparison';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function InsightsForecastPanel() {
  const { forecasts, isLoading } = useInsightsForecast();
  const { data: targets } = useInsightsTargets();
  const upsert = useUpsertMetricTarget();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>('');

  const targetMap = useMemo(() => {
    const m = new Map<string, number>();
    const monthKey = format(new Date(), 'yyyy-MM');
    (targets ?? []).forEach(t => {
      const exact = t.period_month === monthKey;
      const def = !t.period_month;
      const cur = m.get(t.metric_key);
      if (exact || (def && cur === undefined)) m.set(t.metric_key, Number(t.target_value));
    });
    return m;
  }, [targets]);

  if (isLoading) return null;
  if (!forecasts.length) return null;

  const editing = forecasts.find(f => f.metricKey === editingKey);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Forecast & Plan Variance
          <Badge variant="outline" className="ml-1 text-[10px]">Linear projection · trailing 6mo</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {forecasts.map(f => {
            const target = targetMap.get(f.metricKey);
            const variance = target != null ? f.current - target : null;
            const variancePct = target != null && target !== 0 ? ((f.current - target) / Math.abs(target)) * 100 : null;
            const goodVariance =
              variance == null
                ? 'neutral'
                : f.goodWhen === 'up'
                ? variance >= 0
                  ? 'good'
                  : 'bad'
                : variance <= 0
                ? 'good'
                : 'bad';
            const projDir =
              f.nextProjection > f.current
                ? f.goodWhen === 'up' ? 'good' : 'bad'
                : f.nextProjection < f.current
                ? f.goodWhen === 'up' ? 'bad' : 'good'
                : 'neutral';

            return (
              <div key={f.metricKey} className="rounded-lg border border-border/50 bg-muted/20 p-3 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground truncate">{f.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => {
                      setEditingKey(f.metricKey);
                      setDraftValue(target != null ? String(target) : '');
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    {target != null ? 'Target' : 'Set target'}
                  </Button>
                </div>
                <div className="text-base font-semibold tabular-nums truncate">
                  {formatDeltaValue(f.current, f.format)}
                </div>
                <div className={cn(
                  'text-[11px] tabular-nums',
                  projDir === 'good' && 'text-emerald-600 dark:text-emerald-400',
                  projDir === 'bad' && 'text-destructive',
                  projDir === 'neutral' && 'text-muted-foreground',
                )}>
                  Next period proj: {formatDeltaValue(f.nextProjection, f.format)}
                  <span className="opacity-70"> ± {formatDeltaValue(f.band, f.format)}</span>
                </div>
                {target != null ? (
                  <div className={cn(
                    'text-[11px] tabular-nums flex items-center gap-1',
                    goodVariance === 'good' && 'text-emerald-600 dark:text-emerald-400',
                    goodVariance === 'bad' && 'text-destructive',
                  )}>
                    <Target className="h-3 w-3" />
                    Plan {formatDeltaValue(target, f.format)} ·
                    {variance != null && (
                      <> Δ {variance >= 0 ? '+' : ''}{formatDeltaValue(variance, f.format)}{variancePct != null && <> ({variancePct >= 0 ? '+' : ''}{variancePct.toFixed(0)}%)</>}</>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">No plan target set</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
      <Dialog open={!!editing} onOpenChange={open => !open && setEditingKey(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set target — {editing?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Default plan target. Saved at the company level for the current month.</p>
            <Input
              type="number"
              value={draftValue}
              onChange={e => setDraftValue(e.target.value)}
              placeholder="e.g. 250000"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!editing) return;
                const value = Number(draftValue);
                if (!Number.isFinite(value)) return;
                await upsert.mutateAsync({
                  metricKey: editing.metricKey,
                  metricLabel: editing.label,
                  periodMonth: format(new Date(), 'yyyy-MM'),
                  targetValue: value,
                });
                setEditingKey(null);
              }}
              disabled={upsert.isPending}
            >Save target</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
