import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { DealLender } from '@/types/deal';

type BucketId = 'active' | 'on-deck' | 'on-hold' | 'passed';

const BUCKETS: { id: BucketId; label: string; color: string }[] = [
  { id: 'active', label: 'Active', color: 'hsl(152 60% 48%)' },
  { id: 'on-deck', label: 'On Deck', color: 'hsl(210 80% 58%)' },
  { id: 'on-hold', label: 'On Hold', color: 'hsl(42 92% 58%)' },
  { id: 'passed', label: 'Passed', color: 'hsl(0 72% 58%)' },
];

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[_-]+/g, ' ').trim();

export interface ConfiguredStage { id: string; label: string; group?: string }

/** Resolve a lender into one of the four reporting buckets (or null when excluded/unknown). */
export function resolveLenderBucket(
  lender: DealLender,
  configuredStages: ConfiguredStage[] = [],
): BucketId | null {
  const stage = configuredStages.find((s) => s.id === lender.stage);
  const group = norm(stage?.group);
  const label = norm(stage?.label || lender.stage);
  const ts = norm(lender.trackingStatus);

  if (ts === 'excluded' || group === 'excluded' || label === 'excluded') return null;
  if (ts === 'passed' || ts === 'pass' || ts === 'not a fit' || group === 'passed' || label === 'passed' || label.includes('not a fit')) return 'passed';
  if (ts === 'on hold' || group === 'on hold' || label.includes('on hold')) return 'on-hold';
  if (ts === 'on deck' || group === 'on deck' || label.includes('on deck')) return 'on-deck';
  if (ts === 'active' || group === 'active') return 'active';
  return null;
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  lenders: DealLender[];
  configuredStages?: ConfiguredStage[];
  className?: string;
  onSelectLender?: (lenderId: string) => void;
}

export function FundingSourceMixPie({ lenders, configuredStages = [], className, onSelectLender }: Props) {
  const [drilldown, setDrilldown] = useState<BucketId | null>(null);
  const [hovered, setHovered] = useState<BucketId | null>(null);

  const grouped = useMemo(() => {
    const map: Record<BucketId, DealLender[]> = { active: [], 'on-deck': [], 'on-hold': [], passed: [] };
    for (const l of lenders || []) {
      const b = resolveLenderBucket(l, configuredStages);
      if (b) map[b].push(l);
    }
    return map;
  }, [lenders, configuredStages]);

  const data = BUCKETS.map((b) => ({ ...b, value: grouped[b.id].length })).filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) return null;

  const active = drilldown ? BUCKETS.find((b) => b.id === drilldown)! : null;
  const rows = drilldown ? grouped[drilldown] : [];

  return (
    <div className={cn('rounded-xl border border-border/60 bg-card px-4 py-3', className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Funding source mix</p>
        <p className="text-[11px] text-muted-foreground">{total} sources · click a slice</p>
      </div>
      <div className="mt-2 h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              stroke="transparent"
              isAnimationActive={false}
              onMouseLeave={() => setHovered(null)}
              onClick={(entry: any) => setDrilldown((entry?.payload?.id ?? entry?.id) as BucketId)}
            >
              {data.map((d) => (
                <Cell
                  key={d.id}
                  fill={d.color}
                  className="cursor-pointer outline-none transition-opacity"
                  fillOpacity={hovered && hovered !== d.id ? 0.35 : hovered === d.id ? 1 : 0.82}
                  onMouseEnter={() => setHovered(d.id)}
                />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              wrapperStyle={{ outline: 'none', zIndex: 50 }}
              content={({ active: isActive, payload }: any) => {
                if (!isActive || !payload?.length) return null;
                const p = payload[0]?.payload;
                if (!p) return null;
                const pct = total > 0 ? (p.value / total) * 100 : 0;
                return (
                  <div className="rounded-lg border border-border/70 bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                      <span className="text-xs font-semibold text-foreground">{p.label}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground">{p.value}</span>
                      {` ${p.value === 1 ? 'source' : 'sources'} · `}
                      <span className="font-semibold tabular-nums text-foreground">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                      {` of ${total}`}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="circle"
              formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <Dialog open={!!drilldown} onOpenChange={(o) => !o && setDrilldown(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: active?.color }} />
              {active?.label} funding sources
            </DialogTitle>
            <DialogDescription>
              {rows.length} of {total} sources ({Math.round((rows.length / total) * 100)}%)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-[1.4fr_1fr_auto] gap-2 border-b border-border/60 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Name</span><span>Stage</span><span className="text-right">Last change</span>
            </div>
            {rows.map((l) => {
              const stageLabel = configuredStages.find((s) => s.id === l.stage)?.label || l.stage || '—';
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => { onSelectLender?.(l.id); setDrilldown(null); }}
                  className="grid w-full grid-cols-[1.4fr_1fr_auto] items-center gap-2 border-b border-border/30 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="truncate font-medium text-foreground" title={l.name}>{l.name}</span>
                  <span className="truncate text-xs text-muted-foreground" title={String(stageLabel)}>{stageLabel}</span>
                  <span className="text-right text-xs text-muted-foreground">{fmtDate(l.lastStatusChangeAt || l.updatedAt)}</span>
                </button>
              );
            })}
            {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No funding sources in this bucket.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FundingSourceMixPie;
