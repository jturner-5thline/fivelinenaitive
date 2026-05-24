import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, LogIn, MousePointerClick, Heart, MessageSquare, PhoneCall, Rocket, CheckCircle2 } from 'lucide-react';
import { usePilotKpiFlag } from '@/hooks/analytics/usePilotKpiFlag';

type EventType =
  | 'deal_created' | 'initial_login' | 'session_heartbeat' | 'visit'
  | 'feedback_given' | 'feedback_call_attended' | 'demo_converted' | 'pilot_converted';

const TILES: { id: EventType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'deal_created',           label: 'Deals Created',          icon: Rocket },
  { id: 'initial_login',          label: 'Initial Logins',         icon: LogIn },
  { id: 'session_heartbeat',      label: 'Active Sessions (30s)',  icon: Heart },
  { id: 'visit',                  label: 'Page Visits',            icon: MousePointerClick },
  { id: 'feedback_given',         label: 'Feedback Submitted',     icon: MessageSquare },
  { id: 'feedback_call_attended', label: 'Feedback Calls Held',    icon: PhoneCall },
  { id: 'demo_converted',         label: 'Demo Conversions',       icon: Activity },
  { id: 'pilot_converted',        label: 'Pilot Conversions',      icon: CheckCircle2 },
];

export function PilotKpiOverview() {
  const { enabled, isLoading: flagLoading } = usePilotKpiFlag();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error: qErr } = await supabase
          .from('pilot_kpi_events')
          .select('event_type')
          .gte('occurred_at', since)
          .limit(50000);
        if (qErr) throw qErr;
        const next: Record<string, number> = {};
        for (const row of (data ?? []) as { event_type: string }[]) {
          next[row.event_type] = (next[row.event_type] ?? 0) + 1;
        }
        if (!cancelled) setCounts(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load KPIs');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Pilot KPIs <span className="text-xs font-normal text-muted-foreground">(last 14 days)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!enabled && !flagLoading && (
            <p className="text-sm text-muted-foreground">
              Pilot KPI tracking is currently disabled. Enable the
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">ff_pilot_kpi_tracking</code>
              feature flag (set status to "staging" or "deployed") to start collecting events.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {TILES.map((t) => {
              const Icon = t.icon;
              const value = counts[t.id] ?? 0;
              return (
                <div
                  key={t.id}
                  className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</span>
                    <Icon className="h-4 w-4 text-primary/70" />
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">
                    {isLoading ? '—' : value.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PilotKpiOverview;