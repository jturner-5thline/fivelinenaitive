import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  FUNNEL_STAGE_ORDER,
  useQuarterlyTtmFunnel,
  type FunnelStageKey,
  type QuarterlyFunnelBucket,
} from '@/hooks/useQuarterlyTtmFunnel';

type ViewKey = 'funnel' | string; // 'funnel' = current TTM, other = quarter label

export function QuarterlyConversionFunnelChart() {
  const { current, quarters, isLoading } = useQuarterlyTtmFunnel();
  const [view, setView] = useState<ViewKey>('funnel');

  const activeBucket: QuarterlyFunnelBucket = useMemo(() => {
    if (view === 'funnel') return current;
    return quarters.find(q => q.label === view) ?? current;
  }, [view, current, quarters]);

  const data = useMemo(
    () =>
      FUNNEL_STAGE_ORDER.map(s => ({
        stage: s.label,
        count: activeBucket.counts[s.key as FunnelStageKey],
      })),
    [activeBucket],
  );

  const startCount = data[0]?.count ?? 0;
  const endCount = data[data.length - 1]?.count ?? 0;
  const overallRate = startCount > 0 ? ((endCount / startCount) * 100).toFixed(1) : '—';

  const tabs: { key: ViewKey; label: string }[] = [
    { key: 'funnel', label: 'Funnel' },
    ...quarters.map(q => ({ key: q.label, label: q.label })),
  ];

  return (
    <div className="glass-module flex h-full flex-col p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Conversion Funnel</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trailing 12 months · Proposal Issued → Funded / Invoiced
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {activeBucket.label} · Proposal → Funded
          </div>
          <div className="text-lg font-semibold text-foreground">
            {isLoading ? '…' : `${overallRate}${overallRate === '—' ? '' : '%'}`}
          </div>
        </div>
      </div>

      <div
        className="mb-3 inline-flex flex-wrap gap-1 rounded-md p-1"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
        role="tablist"
        aria-label="Funnel view"
      >
        {tabs.map(t => {
          const active = view === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setView(t.key)}
              className={cn(
                'h-7 px-2.5 rounded text-xs font-medium transition-colors',
                active
                  ? 'bg-primary/20 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-[260px]">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 24 }}>
              <defs>
                <linearGradient id="funnelGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, _n, item: any) => {
                  const idx = data.findIndex(d => d.stage === item?.payload?.stage);
                  const first = data[0]?.count ?? 0;
                  const pct = first > 0 ? `${((v / first) * 100).toFixed(1)}%` : '—';
                  return [`${v} deals · ${pct} of Proposal Issued`, `Stage`];
                }}
                labelFormatter={(l) => `${l}`}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#funnelGradient)"
                dot={{ r: 3, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 1 }}
                activeDot={{ r: 5 }}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default QuarterlyConversionFunnelChart;