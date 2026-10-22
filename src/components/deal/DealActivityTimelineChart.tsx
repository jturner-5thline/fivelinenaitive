import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealActivityTimeline } from '@/hooks/useDealActivityTimeline';
import { ACTIVITY_KIND_LABELS, ActivityKind, bucketActivity, Granularity } from '@/lib/dealActivityTimeline';

const KINDS = Object.keys(ACTIVITY_KIND_LABELS) as ActivityKind[];

function ActivityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
      <div className="mb-1 font-semibold">{b.label} · {b.total} activit{b.total === 1 ? 'y' : 'ies'}</div>
      {KINDS.map((k) => (
        <div key={k} className="flex justify-between gap-4 text-foreground/80">
          <span>{ACTIVITY_KIND_LABELS[k]}</span><span className="font-mono">{b.counts[k]}</span>
        </div>
      ))}
    </div>
  );
}

export function DealActivityTimelineChart({ dealId }: { dealId: string }) {
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const { data, isLoading, error } = useDealActivityTimeline(dealId);
  const buckets = useMemo(() => bucketActivity(data?.events || [], granularity), [data, granularity]);
  const total = buckets.reduce((s, b) => s + b.total, 0);

  return (
    <section className="mb-4 rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Deal Activity</h3>
          <p className="text-xs text-foreground/60">{total} activities · last {granularity === 'daily' ? '30 days' : '12 weeks'}</p>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(['daily', 'weekly'] as Granularity[]).map((g) => (
            <button key={g} type="button" onClick={() => setGranularity(g)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${granularity === g ? 'bg-primary/20 text-primary' : 'text-foreground/70 hover:text-foreground'}`}>
              {g}
            </button>
          ))}
        </div>
      </div>
      {data?.warning && <p role="status" className="mb-2 text-xs text-muted-foreground">{data.warning}</p>}
      {error && !data ? <p role="alert" className="py-8 text-sm text-destructive">Activity could not be loaded. {error.message}</p> : isLoading && !data ? <Skeleton className="h-[200px] w-full" /> : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="dealActivityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ActivityTooltip />} cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.4 }} />
              <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#dealActivityFill)"
                baseValue="dataMin" activeDot={{ r: 5 }} dot={false} animationDuration={500} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
