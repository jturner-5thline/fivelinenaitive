import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStageTransitMetrics } from '@/hooks/useStageTransitMetrics';
import {
  ResponsiveContainer, AreaChart, Area, ComposedChart, Bar, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, LabelList,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Pipeline Velocity — trailing-12-month average number of days between
 * canonical Active Pipeline stage transitions. Mirrors the visual layout of
 * the Pipeline Conversion tiles (compact KPI cards, colored accent bar) so
 * the two sections read as one unit.
 */

interface VelocityTileDef {
  id: string;
  title: string;
  color: string;
  fromVariants: string[];
  toVariants: string[];
}

// Stage-label variants match the resolver in usePipelineStageMetrics
// (case-insensitive slug + Title Case).
const V = {
  proposalIssued: ['proposal-issued', 'Proposal Issued'],
  finalCreditItems: ['final-credit-items', 'Final Credit Items'],
  lendersInReview: ['lenders-in-review', 'Lenders in Review'],
  termsIssued: ['terms-issued', 'Terms Issued'],
  inDueDiligence: ['in-due-diligence', 'In Due Diligence'],
  fundedInvoiced: ['funded-invoiced', 'Funded/Invoiced', 'Funded / Invoiced', 'Closed & Funded'],
};

const TILES: VelocityTileDef[] = [
  {
    id: 'proposal-to-engagement',
    title: 'Proposal to Engagement',
    color: 'hsl(var(--primary))',
    fromVariants: V.proposalIssued,
    toVariants: V.finalCreditItems,
  },
  {
    id: 'submission-to-terms-issued',
    title: 'Submission to Terms Issued',
    color: 'hsl(var(--chart-2))',
    fromVariants: V.lendersInReview,
    toVariants: V.termsIssued,
  },
  {
    id: 'terms-issued-to-terms-signed',
    title: 'Terms Issued to Terms Signed',
    color: 'hsl(var(--chart-3))',
    fromVariants: V.termsIssued,
    toVariants: V.inDueDiligence,
  },
  {
    id: 'terms-signed-to-funded',
    title: 'Terms Signed to Funded / Invoiced',
    color: 'hsl(var(--chart-4))',
    fromVariants: V.inDueDiligence,
    toVariants: V.fundedInvoiced,
  },
  {
    id: 'signed-to-funded',
    title: 'Signed to Funded / Invoiced',
    color: 'hsl(var(--chart-5))',
    fromVariants: V.finalCreditItems,
    toVariants: V.fundedInvoiced,
  },
];

const DAYS_PER_MONTH = 30.4375;
const DAYS_PER_WEEK = 7;

type VelocityUnit = 'days' | 'weeks' | 'months';

const UNIT_LABEL: Record<VelocityUnit, string> = { days: 'Days', weeks: 'Weeks', months: 'Months' };
const UNIT_SUFFIX: Record<VelocityUnit, string> = { days: 'd', weeks: 'w', months: 'mo' };

/** Convert an average-months figure into the selected unit + a display string. */
function formatVelocity(avgMonths: number, unit: VelocityUnit): string {
  if (!(avgMonths > 0)) return '—';
  if (unit === 'days') {
    return `${Math.round(avgMonths * DAYS_PER_MONTH)}${UNIT_SUFFIX.days}`;
  }
  if (unit === 'weeks') {
    return `${((avgMonths * DAYS_PER_MONTH) / DAYS_PER_WEEK).toFixed(1)}${UNIT_SUFFIX.weeks}`;
  }
  return `${avgMonths.toFixed(1)}${UNIT_SUFFIX.months}`;
}

/** Numeric value only, used for chart axis / data points. */
function velocityValue(avgMonths: number, unit: VelocityUnit): number {
  if (!(avgMonths > 0)) return 0;
  if (unit === 'days') return Math.round(avgMonths * DAYS_PER_MONTH);
  if (unit === 'weeks') return Number(((avgMonths * DAYS_PER_MONTH) / DAYS_PER_WEEK).toFixed(1));
  return Number(avgMonths.toFixed(1));
}

function useVelocityAvgMonths(tile: VelocityTileDef) {
  const { buckets, isLoading } = useStageTransitMetrics({
    fromVariants: tile.fromVariants,
    toVariants: tile.toVariants,
    windowMonths: 12,
    logInverted: false,
  });
  const closed = buckets.filter((b) => !b.isOpen);
  const totalDeals = closed.reduce((s, b) => s + b.dealCount, 0);
  const avgMonths = totalDeals > 0
    ? closed.reduce((s, b) => s + b.avgMonths * b.dealCount, 0) / totalDeals
    : 0;
  return { avgMonths, totalDeals, isLoading };
}

function VelocityTile({ tile, unit }: { tile: VelocityTileDef; unit: VelocityUnit }) {
  const { avgMonths, totalDeals, isLoading } = useVelocityAvgMonths(tile);

  return (
    <Card
      className={cn(
        'relative group overflow-hidden transition-all duration-200',
        'glass-module',
        'hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${tile.color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-2 py-4 px-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate" title={tile.title}>
            {tile.title}
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                {totalDeals > 0 ? formatVelocity(avgMonths, unit) : '—'}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** End-of-last-completed-quarter date (UTC), used as the anchor so the
 *  monthly transit buckets align to the 4 most recently completed quarters
 *  — matching the X axis of "Step Conversion by Quarter". */
function anchorEndOfLastCompletedQuarter(now: Date): Date {
  const y = now.getUTCFullYear();
  const currentQuarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  // First day of current quarter, minus 1 ms → end of previous quarter.
  return new Date(Date.UTC(y, currentQuarterStartMonth, 1) - 1);
}

function pastFourQuarterLabels(anchor: Date): { key: string; label: string; year: number; q: number }[] {
  // anchor is end of last completed quarter.
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const q = Math.floor(m / 3) + 1;
  const out: { key: string; label: string; year: number; q: number }[] = [];
  let cy = y;
  let cq = q;
  for (let i = 0; i < 4; i++) {
    out.unshift({ key: `${cy}-Q${cq}`, label: `Q${cq} ${cy}`, year: cy, q: cq });
    cq -= 1;
    if (cq === 0) { cq = 4; cy -= 1; }
  }
  return out;
}

function VelocitySummaryChart({ unit }: { unit: VelocityUnit }) {
  const [tileId, setTileId] = useState<string>(TILES[0].id);
  const activeTile = TILES.find((t) => t.id === tileId) ?? TILES[0];

  // Anchor to the end of the last completed calendar quarter and pull 12
  // monthly buckets so we cover exactly the past 4 quarters.
  const anchor = useMemo(() => anchorEndOfLastCompletedQuarter(new Date()), []);
  const quarterAxis = useMemo(() => pastFourQuarterLabels(anchor), [anchor]);

  const { buckets, isLoading } = useStageTransitMetrics({
    fromVariants: activeTile.fromVariants,
    toVariants: activeTile.toVariants,
    windowMonths: 12,
    anchorDate: anchor,
    logInverted: false,
  });

  const data = useMemo(() => {
    // Group monthly buckets → calendar quarters, weighted by dealCount.
    const agg = new Map<string, { sumMonths: number; deals: number }>();
    for (const b of buckets) {
      if (b.isOpen) continue;
      const d = new Date(b.monthStart);
      const qy = d.getUTCFullYear();
      const qq = Math.floor(d.getUTCMonth() / 3) + 1;
      const key = `${qy}-Q${qq}`;
      const cur = agg.get(key) ?? { sumMonths: 0, deals: 0 };
      cur.sumMonths += b.avgMonths * b.dealCount;
      cur.deals += b.dealCount;
      agg.set(key, cur);
    }
    return quarterAxis.map((q) => {
      const cur = agg.get(q.key);
      const avgMonths = cur && cur.deals > 0 ? cur.sumMonths / cur.deals : 0;
      return {
        stage: q.label,
        value: velocityValue(avgMonths, unit),
        display: formatVelocity(avgMonths, unit),
        avgMonths,
        deals: cur?.deals ?? 0,
      };
    });
  }, [buckets, quarterAxis, unit]);

  const latest = data[data.length - 1];

  return (
    <div
      className="funnel-chart-dark flex h-full flex-col p-4 rounded-lg"
      style={{
        background: 'linear-gradient(180deg, hsl(224, 45%, 10%) 0%, hsl(226, 55%, 6%) 100%)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Avg {UNIT_LABEL[unit]} by Quarter</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTile.title} · past 4 quarters
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {latest?.stage ?? ''}
          </div>
          <div className="text-lg font-semibold text-foreground">
            {isLoading ? '…' : (latest && latest.deals > 0 ? latest.display : '—')}
          </div>
        </div>
      </div>

      <div
        className="mb-3 inline-flex flex-wrap gap-1 rounded-md p-1"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
        role="tablist"
        aria-label="Velocity transition"
      >
        {TILES.map((t) => {
          const active = tileId === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTileId(t.id)}
              className={cn(
                'h-7 px-2.5 rounded text-xs font-medium transition-colors',
                active
                  ? 'bg-primary/20 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              {t.title}
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
                <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
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
                height={40}
              />
              <YAxis
                allowDecimals={unit !== 'days'}
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.85)' }}
                stroke="rgba(255,255,255,0.35)"
                width={44}
                tickFormatter={(v: number) => `${v}${UNIT_SUFFIX[unit]}`}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.25, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
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
                        <span>Avg {UNIT_LABEL[unit].toLowerCase()}</span>
                        <span className="text-foreground font-medium">
                          {p.deals > 0 ? p.display : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>Deals</span>
                        <span className="text-foreground font-medium">{p.deals}</span>
                      </div>
                      <div className="mt-1 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                        {activeTile.title}
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(217, 91%, 65%)"
                strokeWidth={2}
                fill="url(#velocityGradient)"
                dot={{ r: 3, fill: 'hsl(217, 91%, 65%)', stroke: 'hsl(var(--card))', strokeWidth: 1 }}
                activeDot={{ r: 5, fill: 'hsl(217, 91%, 70%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                isAnimationActive
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  offset={10}
                  formatter={(v: number) => (v > 0 ? `${v}${UNIT_SUFFIX[unit]}` : '')}
                  style={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 600 }}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function PipelineVelocitySection() {
  const [unit, setUnit] = useState<VelocityUnit>('days');
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Pipeline Velocity
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Average {unit} between stages · trailing 12 months (Active Pipeline)
          </p>
        </div>
        <div
          className="inline-flex rounded-md p-1"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          role="tablist"
          aria-label="Velocity unit"
        >
          {(['days', 'weeks', 'months'] as const).map((u) => {
            const active = unit === u;
            return (
              <button
                key={u}
                role="tab"
                aria-selected={active}
                onClick={() => setUnit(u)}
                className={cn(
                  'h-7 px-3 rounded text-xs font-medium transition-colors capitalize',
                  active
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                )}
              >
                {u}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3">
        <div className="flex flex-col gap-2">
          {TILES.map((tile) => (
            <VelocityTile key={tile.id} tile={tile} unit={unit} />
          ))}
        </div>
        <VelocitySummaryChart unit={unit} />
      </div>
    </div>
  );
}