import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  FUNNEL_STAGE_ORDER,
  useQuarterlyTtmFunnel,
  type FunnelStageKey,
  type QuarterlyFunnelBucket,
} from '@/hooks/useQuarterlyTtmFunnel';

// Step-conversion tabs: each pair is a step between two consecutive funnel stages.
type StepKey = `${FunnelStageKey}__${FunnelStageKey}`;
type ViewKey = 'funnel' | StepKey;

const STEP_TABS: { key: StepKey; from: FunnelStageKey; to: FunnelStageKey; label: string; short: string }[] =
  FUNNEL_STAGE_ORDER.slice(0, -1).map((s, i) => {
    const next = FUNNEL_STAGE_ORDER[i + 1];
    return {
      key: `${s.key}__${next.key}` as StepKey,
      from: s.key as FunnelStageKey,
      to: next.key as FunnelStageKey,
      label: `${s.label} → ${next.label}`,
      short: `${s.label} → ${next.label}`,
    };
  });

export function QuarterlyConversionFunnelChart() {
  const { current, quarters, isLoading } = useQuarterlyTtmFunnel();
  const [view, setView] = useState<ViewKey>('funnel');

  const activeStep = view === 'funnel' ? null : STEP_TABS.find(t => t.key === view) ?? null;

  // Funnel view = current TTM across stages. Step view = one step's conversion % across past 4 quarters.
  const funnelData = useMemo(
    () =>
      FUNNEL_STAGE_ORDER.map((s, i, arr) => {
        const count = current.counts[s.key as FunnelStageKey];
        const first = current.counts[arr[0].key as FunnelStageKey];
        const prev = i > 0 ? current.counts[arr[i - 1].key as FunnelStageKey] : count;
        return {
          stage: s.label,
          count,
          pctOfTop: first > 0 ? (count / first) * 100 : null,
          pctOfPrev: i > 0 && prev > 0 ? (count / prev) * 100 : null,
        };
      }),
    [current],
  );

  // Quarters come newest first — reverse for chronological left→right reading.
  const stepData = useMemo(() => {
    if (!activeStep) return [];
    const chrono = [...quarters].reverse();
    return chrono.map(q => {
      const from = q.counts[activeStep.from];
      const to = q.counts[activeStep.to];
      const pct = from > 0 ? (to / from) * 100 : null;
      return {
        stage: q.label,
        count: pct == null ? 0 : Number(pct.toFixed(1)),
        pctOfTop: pct,
        pctOfPrev: null as number | null,
        fromCount: from,
        toCount: to,
      };
    });
  }, [activeStep, quarters]);

  const data = activeStep ? stepData : funnelData;

  const headerMetric = useMemo(() => {
    if (!activeStep) {
      const startCount = funnelData[0]?.count ?? 0;
      const endCount = funnelData[funnelData.length - 1]?.count ?? 0;
      const rate = startCount > 0 ? ((endCount / startCount) * 100).toFixed(1) + '%' : '—';
      return { label: `${current.label} · Proposal → Funded`, value: rate };
    }
    // Latest completed quarter conversion for this step
    const latest = stepData[stepData.length - 1];
    const val = latest?.pctOfTop == null ? '—' : `${latest.pctOfTop.toFixed(1)}%`;
    return { label: `${latest?.stage ?? ''} · ${activeStep.short}`, value: val };
  }, [activeStep, funnelData, stepData, current.label]);

  const tabs: { key: ViewKey; label: string }[] = [
    { key: 'funnel', label: 'Funnel' },
    ...STEP_TABS.map(s => ({ key: s.key as ViewKey, label: s.short })),
  ];

  const yDomain: [number | 'auto', number | 'auto'] = activeStep ? [0, 100] : ['auto', 'auto'];
  const yTickFormatter = activeStep ? (v: number) => `${v}%` : (v: number) => `${v}`;

  return (
    <div
      className="funnel-chart-dark flex h-full flex-col p-4 rounded-lg"
      style={{
        background:
          'linear-gradient(180deg, hsl(224, 45%, 10%) 0%, hsl(226, 55%, 6%) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {activeStep ? 'Step Conversion by Quarter' : 'Conversion Funnel'}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeStep
              ? `TTM conversion % · past 4 quarters · ${activeStep.short}`
              : 'Trailing 12 months · Proposal Issued → Funded / Invoiced'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {headerMetric.label}
          </div>
          <div className="text-lg font-semibold text-foreground">
            {isLoading ? '…' : headerMetric.value}
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
                  <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.95} />
                  <stop offset="45%" stopColor="hsl(222, 80%, 32%)" stopOpacity={0.75} />
                  <stop offset="100%" stopColor="hsl(226, 70%, 10%)" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" vertical={false} />
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.85)' }}
                stroke="rgba(255,255,255,0.35)"
                interval={0}
                angle={activeStep ? 0 : -18}
                textAnchor={activeStep ? 'middle' : 'end'}
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.85)' }}
                stroke="rgba(255,255,255,0.35)"
                width={44}
                domain={yDomain}
                tickFormatter={yTickFormatter as any}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.25, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
                  if (activeStep) {
                    const sp = p as any;
                    return (
                      <div
                        style={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          padding: '8px 10px',
                          fontSize: 12,
                          minWidth: 200,
                        }}
                      >
                        <div className="font-semibold text-foreground mb-1">{sp.stage}</div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>Conversion</span>
                          <span className="text-foreground font-medium">
                            {sp.pctOfTop == null ? '—' : `${sp.pctOfTop.toFixed(1)}%`}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{activeStep.short.split(' → ')[0]}</span>
                          <span className="text-foreground font-medium">{sp.fromCount}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>{activeStep.short.split(' → ')[1]}</span>
                          <span className="text-foreground font-medium">{sp.toCount}</span>
                        </div>
                        <div className="mt-1 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                          {sp.stage} · TTM
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        minWidth: 180,
                      }}
                    >
                      <div className="font-semibold text-foreground mb-1">{p.stage}</div>
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>Deals</span>
                        <span className="text-foreground font-medium">{p.count}</span>
                      </div>
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>% of Proposal Issued</span>
                        <span className="text-foreground font-medium">
                          {p.pctOfTop == null ? '—' : `${p.pctOfTop.toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>Step conversion</span>
                        <span className="text-foreground font-medium">
                          {p.pctOfPrev == null ? '—' : `${p.pctOfPrev.toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="mt-1 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                        {current.label} · TTM
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(217, 91%, 65%)"
                strokeWidth={2}
                fill="url(#funnelGradient)"
                dot={{ r: 3, fill: 'hsl(217, 91%, 65%)', stroke: 'hsl(var(--card))', strokeWidth: 1 }}
                activeDot={{ r: 5, fill: 'hsl(217, 91%, 70%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                isAnimationActive
              >
                <LabelList
                  dataKey="count"
                  position="top"
                  offset={10}
                  content={({ x, y, value, index }) => {
                    if (x == null || y == null || value == null || index == null) return null;
                    const p = data[index as number];
                    const primaryLabel = activeStep
                      ? (p?.pctOfTop == null ? '—' : `${p.pctOfTop.toFixed(1)}%`)
                      : `${value}`;
                    const secondaryLabel = activeStep
                      ? ''
                      : (p?.pctOfTop == null ? '' : `${p.pctOfTop.toFixed(0)}%`);
                    return (
                      <g>
                        <text
                          x={Number(x)}
                          y={Number(y) - 12}
                          textAnchor="middle"
                          fill="hsl(var(--foreground))"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {primaryLabel}
                        </text>
                        {secondaryLabel && (
                          <text
                            x={Number(x)}
                            y={Number(y) - 1}
                            textAnchor="middle"
                            fill="hsl(var(--muted-foreground))"
                            fontSize={9}
                          >
                            {secondaryLabel}
                          </text>
                        )}
                      </g>
                    );
                  }}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default QuarterlyConversionFunnelChart;