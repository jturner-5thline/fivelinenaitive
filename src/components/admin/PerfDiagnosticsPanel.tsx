import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, Mail, MemoryStick, Radio, Timer } from 'lucide-react';
import { getPerfSnapshot, type PerfSnapshot } from '@/lib/perfDiagnostics';
import { toast } from 'sonner';

/**
 * Admin → Observability → Performance.
 *
 * Surfaces live counters (Realtime channels, visibility-aware intervals,
 * recent long tasks), the JS heap trend, and per-route render timings
 * collected by `perfDiagnostics`. The Snapshot button copies a JSON dump
 * to the clipboard so users can paste it into a support ticket.
 */
export function PerfDiagnosticsPanel() {
  const [snap, setSnap] = useState<PerfSnapshot>(() => getPerfSnapshot());

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setSnap(getPerfSnapshot());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;
  const ms = (n: number) => `${n.toFixed(0)} ms`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Client Performance Diagnostics
          </CardTitle>
          <CardDescription>
            Live in-browser instrumentation. Counts realtime channels, polling intervals,
            long tasks, and memory growth in this session. Sampling is paused while the tab is hidden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {snap.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
              {snap.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile icon={<Radio className="h-4 w-4" />} label="Realtime channels" value={snap.counters.realtimeChannels} />
            <StatTile icon={<Timer className="h-4 w-4" />} label="Visibility intervals" value={snap.counters.visibilityAwareIntervals} />
            <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Long tasks (session)" value={snap.counters.longTasksTotal} />
            <StatTile
              icon={<MemoryStick className="h-4 w-4" />}
              label="JS heap"
              value={snap.memory.latest ? mb(snap.memory.latest.usedJSHeapSize) : 'n/a'}
              hint={snap.memory.samples.length > 1 ? `${snap.memory.growthMb >= 0 ? '+' : ''}${snap.memory.growthMb.toFixed(1)} MB since start` : undefined}
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(getPerfSnapshot(), null, 2));
                toast.success('Perf snapshot copied to clipboard');
              } catch {
                toast.error('Clipboard write failed');
              }
            }}
          >
            Copy snapshot JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Slowest routes (by max render)</CardTitle>
          <CardDescription>Routes visited this session, ordered by their slowest render.</CardDescription>
        </CardHeader>
        <CardContent>
          {snap.routes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No route timings recorded yet. Navigate around the app.</div>
          ) : (
            <div className="text-sm">
              <div className="grid grid-cols-12 gap-2 font-medium text-muted-foreground border-b pb-2">
                <div className="col-span-6">Route</div>
                <div className="col-span-2 text-right">Visits</div>
                <div className="col-span-2 text-right">Avg</div>
                <div className="col-span-2 text-right">Max</div>
              </div>
              {snap.routes.slice(0, 20).map((r) => (
                <div key={r.route} className="grid grid-cols-12 gap-2 py-1 border-b border-border/40">
                  <div className="col-span-6 truncate font-mono text-xs">{r.route}</div>
                  <div className="col-span-2 text-right">{r.visits}</div>
                  <div className="col-span-2 text-right">{ms(r.avgRenderMs)}</div>
                  <div className="col-span-2 text-right">
                    <Badge variant={r.maxRenderMs > 500 ? 'destructive' : r.maxRenderMs > 200 ? 'secondary' : 'outline'}>
                      {ms(r.maxRenderMs)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent long tasks (&gt;50ms)</CardTitle>
          <CardDescription>Main-thread blocks that can cause input lag.</CardDescription>
        </CardHeader>
        <CardContent>
          {snap.longTasks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No long tasks recorded — UI looks responsive.</div>
          ) : (
            <div className="space-y-1 text-sm max-h-72 overflow-auto">
              {snap.longTasks.slice(0, 25).map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
                  <span className="font-mono text-xs truncate">{t.route}</span>
                  <Badge variant={t.duration > 200 ? 'destructive' : 'secondary'}>{t.duration.toFixed(0)} ms</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Mail interaction latency
          </CardTitle>
          <CardDescription>
            User-perceived timings for the email popup hot path. Captured at
            optimistic-update / first-paint moments — lower is snappier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MailTile label="Popup open" stat={snap.mail.popupOpen} />
            <MailTile label="Thread open" stat={snap.mail.threadOpen} />
            <MailTile label="Move / archive" stat={snap.mail.move} />
            <MailTile label="Compose open" stat={snap.mail.composeOpen} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function MailTile({
  label, stat,
}: { label: string; stat: { count: number; lastMs: number; avgMs: number; maxMs: number } }) {
  const valColor =
    stat.lastMs > 300 ? 'text-destructive' :
    stat.lastMs > 120 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valColor}`}>
        {stat.count === 0 ? '—' : `${stat.lastMs} ms`}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {stat.count === 0
          ? 'No samples yet'
          : `${stat.count} samples · avg ${stat.avgMs} · max ${stat.maxMs}`}
      </div>
    </div>
  );
}