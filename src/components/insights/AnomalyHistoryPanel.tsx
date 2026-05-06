import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, BellOff, CheckCircle2, History, RotateCcw, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAnomalyHistory, useUpdateAnomaly, type AnomalyHistoryRow } from '@/hooks/useAnomalyHistory';
import { cn } from '@/lib/utils';

function status(a: AnomalyHistoryRow): 'active' | 'snoozed' | 'dismissed' | 'resolved' {
  if (a.resolved_at) return 'resolved';
  if (a.dismissed_at) return 'dismissed';
  if (a.snoozed_until && new Date(a.snoozed_until) > new Date()) return 'snoozed';
  return 'active';
}

export function AnomalyHistoryPanel() {
  const { data: rows, isLoading } = useAnomalyHistory();
  const update = useUpdateAnomaly();
  const [tab, setTab] = useState<'active' | 'recurring' | 'history'>('active');

  const grouped = useMemo(() => {
    const all = rows ?? [];
    const active = all.filter(r => status(r) === 'active');
    const recurring = all.filter(r => r.occurrence_count >= 2 && status(r) !== 'resolved');
    return { active, recurring, history: all };
  }, [rows]);

  if (isLoading) return null;
  if (!rows || rows.length === 0) return null;

  const list = grouped[tab];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Anomaly History
            <Badge variant="outline" className="ml-1 text-[10px]">{grouped.active.length} active · {grouped.recurring.length} recurring</Badge>
          </CardTitle>
          <Tabs value={tab} onValueChange={v => setTab(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="active" className="text-xs h-6">Active</TabsTrigger>
              <TabsTrigger value="recurring" className="text-xs h-6">Recurring</TabsTrigger>
              <TabsTrigger value="history" className="text-xs h-6">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No anomalies in this view.</p>
        ) : (
          <ul className="space-y-2">
            {list.map(a => {
              const s = status(a);
              const Icon = a.level === 'positive' ? TrendingUp : AlertTriangle;
              const tone =
                a.level === 'critical' ? 'border-destructive/40 bg-destructive/10'
                : a.level === 'warning' ? 'border-yellow-500/40 bg-yellow-500/10'
                : 'border-success/40 bg-success/10';
              return (
                <li key={a.id} className={cn('rounded-lg border p-3 flex items-start gap-3', tone, s !== 'active' && 'opacity-70')}>
                  <Icon className={cn('h-4 w-4 mt-0.5 shrink-0',
                    a.level === 'critical' ? 'text-destructive'
                    : a.level === 'warning' ? 'text-yellow-600'
                    : 'text-success')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-medium truncate">{a.metric_label}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">{s}</Badge>
                      {a.occurrence_count > 1 && (
                        <Badge variant="secondary" className="text-[10px]">×{a.occurrence_count}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{a.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      First seen {formatDistanceToNow(new Date(a.first_seen_at), { addSuffix: true })} · last seen {formatDistanceToNow(new Date(a.last_seen_at), { addSuffix: true })} · {a.period_label}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {s === 'active' && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => update.mutate({ id: a.id, action: 'snooze', snoozeDays: 7 })}>
                          <BellOff className="h-3 w-3 mr-1" /> Snooze 7d
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => update.mutate({ id: a.id, action: 'resolve' })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                        </Button>
                      </>
                    )}
                    {s !== 'active' && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => update.mutate({ id: a.id, action: 'reopen' })}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Reopen
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
