import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useExecutiveTopRowKpis,
  type ExecKpiDrilldownDeal,
  type ExecRevenueLineItem,
  type ExecKpiWindow,
} from '@/hooks/useExecutiveTopRowKpis';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startOfWeek, endOfWeek, addWeeks, format as fmtDateFn, isSameWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Line, ComposedChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { GlassCard, GlassCardHeader, GlassCardBody, GLASS_TOKENS } from '@/components/metrics/GlassCard';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { LatestShareReportDialog } from './LatestShareReportDialog';

// ── Shared chart primitives (axis/grid/tooltip) ──────────────────────────────
// Mirrors the Liquid Glass treatment used by Profit by Entity / Revenue
// Overview so every Executive Dashboard chart sits inside the same visual
// language as the rest of Weekly Rundown.
// Contrast-tuned for the dark Liquid Glass surfaces used across Weekly Rundown.
// Tick / legend opacities meet a comfortable contrast threshold on the
// translucent card background while preserving the muted aesthetic.
const AXIS_TICK = { fontSize: 10, fill: 'rgba(200, 220, 250, 0.78)' } as const;
const AXIS_LINE = { stroke: 'rgba(160, 200, 255, 0.20)' } as const;
const GRID_STROKE = 'rgba(160, 200, 255, 0.14)';
const AXIS_LABEL = { fontSize: 10, fill: 'rgba(200, 220, 250, 0.85)', fontWeight: 500 } as const;
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover) / 0.96)',
  border: '1px solid hsl(0 0% 100% / 0.14)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(0 0% 100%)',
  boxShadow: 'var(--shadow-xl)',
  backdropFilter: 'blur(16px)',
};
const LEGEND_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(200, 220, 250, 0.88)',
  paddingTop: 4,
};

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  `$${Math.round(value).toLocaleString()}`;

// ── Deals by Status (fee-weighted) ───────────────────────────────────────────
// Mirrors the Outstanding A/R pie chart styling exactly. Allocation is based
// on the share of Total Fee per status bucket. Deals with a missing/blank
// Total Fee are excluded from both numerator and denominator.
//
// Status colors are pinned to the same semantic tags shown on the Deals page:
//   On Track  → green-500
//   At Risk   → yellow-500
//   Off Track → red-500
const STATUS_BUCKETS = [
  { key: 'on-track' as const,  label: 'On Track',  color: 'hsl(142 71% 45%)' }, // tailwind green-500
  { key: 'at-risk' as const,   label: 'At Risk',   color: 'hsl(48 96% 53%)' },  // tailwind yellow-500
  { key: 'off-track' as const, label: 'Off Track', color: 'hsl(0 84% 60%)' },   // tailwind red-500
];
const STATUS_COLORS = STATUS_BUCKETS.map(b => b.color);

function useDealsByStatusFee(_window?: { start: Date; end: Date }) {
  return useQuery({
    queryKey: [
      'executive-dashboard',
      'deals-by-status-fee',
      'active-pipeline',
    ],
    queryFn: async () => {
      // Resolve the 5th Line "Active Pipeline" (default pipeline for this
      // workspace). Executive Dashboard is 5th Line-only, so scope directly
      // to the default pipeline for that company.
      const FIFTH_LINE_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';
      const { data: pipelines, error: pipeErr } = await supabase
        .from('deal_pipelines')
        .select('id')
        .eq('company_id', FIFTH_LINE_COMPANY_ID)
        .eq('is_default', true)
        .limit(1);
      if (pipeErr) throw pipeErr;
      const activePipelineId = pipelines?.[0]?.id;
      if (!activePipelineId) {
        return { totals: { 'on-track': 0, 'at-risk': 0, 'off-track': 0 }, total: 0 };
      }

      const { data, error } = await supabase
        .from('deals')
        .select('company, status, total_fee, pipeline_id')
        .eq('pipeline_id', activePipelineId)
        .in('status', ['on-track', 'at-risk', 'off-track']);
      if (error) throw error;

      // Apply the global test-deal exclusion (Test-Niki's Store, Example Deal,
      // anything starting with "test ") — matched against the deal NAME, not
      // the associated company. Deals without a total fee still count toward
      // status distribution as zero-value; drop them from the sum but keep
      // pie slices meaningful.
      const excluded = new Set(["Test-Niki's Store", 'Example Deal']);
      const rows = (data ?? []).filter(d => {
        const name = (d.company ?? '').trim();
        if (!name) return false;
        if (excluded.has(name)) return false;
        if (name.toLowerCase().startsWith('test ')) return false;
        return true;
      });

      const totals = { 'on-track': 0, 'at-risk': 0, 'off-track': 0 } as Record<
        'on-track' | 'at-risk' | 'off-track',
        number
      >;
      const counts = { 'on-track': 0, 'at-risk': 0, 'off-track': 0 } as Record<
        'on-track' | 'at-risk' | 'off-track',
        number
      >;
      for (const r of rows) {
        const s = r.status as keyof typeof totals;
        if (s in totals) {
          counts[s] += 1;
          const fee = Number(r.total_fee);
          if (Number.isFinite(fee) && fee > 0) totals[s] += fee;
        }
      }
      const total = totals['on-track'] + totals['at-risk'] + totals['off-track'];
      const totalCount = counts['on-track'] + counts['at-risk'] + counts['off-track'];
      return { totals, counts, total, totalCount };
    },
    staleTime: 60_000,
  });
}

function DealsByStatusPieChart({ window }: { window?: { start: Date; end: Date } }) {
  const { data, isLoading } = useDealsByStatusFee(window);
  const [reportOpen, setReportOpen] = useState(false);

  if (isLoading) {
    return (
      <GlassCard>
        <GlassCardHeader>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-48 mt-2" />
        </GlassCardHeader>
        <GlassCardBody><Skeleton className="h-[220px] w-full" /></GlassCardBody>
      </GlassCard>
    );
  }

  const total = data?.total ?? 0;
  const totals = data?.totals ?? { 'on-track': 0, 'at-risk': 0, 'off-track': 0 };
  const counts = data?.counts ?? { 'on-track': 0, 'at-risk': 0, 'off-track': 0 };
  const totalCount = data?.totalCount ?? 0;

  const segments = STATUS_BUCKETS.map(b => {
    const fee = totals[b.key];
    const count = counts[b.key];
    const pct = total > 0 ? (fee / total) * 100 : 0;
    return { key: b.key, label: b.label, color: b.color, fee, count, pct };
  });

  return (
    <>
    <GlassCard
      interactive
      className="h-full flex flex-col cursor-pointer"
      onClick={() => setReportOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setReportOpen(true);
        }
      }}
      aria-label="Open latest shared pipeline report"
    >
      <GlassCardHeader
        title="Deals by Status"
        subtitle="By total fee · current pipeline"
        right={
          <div className="text-right">
            <p
              className="text-xl font-semibold tabular-nums leading-none tracking-tight"
              style={{ color: GLASS_TOKENS.valueColor }}
            >
              {formatCurrency(total)}
            </p>
            <p
              className="text-[10px] mt-1.5 uppercase tracking-wider"
              style={{ color: GLASS_TOKENS.metaColor }}
            >
              {totalCount} deals · Total Fee
            </p>
          </div>
        }
      />
      <GlassCardBody className="flex-1 min-h-0 flex flex-col">
        {/* Single horizontal stacked bar — each segment sized by share of
            total fee (revenue / closing fees). */}
        <div className="mt-2">
          <div
            className="flex w-full rounded-md overflow-hidden"
            style={{
              minHeight: 88,
              border: '1px solid rgba(160, 200, 255, 0.18)',
              background: 'rgba(20, 30, 50, 0.35)',
            }}
            role="img"
            aria-label="Deals by status stacked bar"
          >
            {total > 0 ? (
              segments.map((s) => {
                if (s.pct <= 0) return null;
                const wide = s.pct >= 18;
                return (
                  <div
                    key={s.key}
                    title={`${s.label} · ${s.count} deals · ${formatCurrencyFull(s.fee)} (${s.pct.toFixed(1)}%)`}
                    className="flex flex-col items-center justify-center px-2 py-2 gap-0.5 text-center"
                    style={{
                      width: `${s.pct}%`,
                      background: s.color,
                      color: 'rgba(15, 20, 30, 0.92)',
                      opacity: 0.95,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    {wide && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider leading-none opacity-90">
                        {s.label}
                      </span>
                    )}
                    <span className="text-[13px] font-bold tabular-nums leading-tight">
                      {formatCurrency(s.fee)}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums leading-none opacity-85">
                      {s.count} {s.count === 1 ? 'deal' : 'deals'} · {s.pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex-1 flex items-center justify-center text-[11px]"
                style={{ color: 'rgba(200, 220, 250, 0.6)' }}>
                No fee-weighted deals in current pipeline
              </div>
            )}
          </div>
        </div>

        {/* Legend rows — count · $ volume · % of revenue per status */}
        <ul className="mt-3 space-y-1.5" aria-label="Deals by status legend">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: s.color, opacity: 0.95 }}
                aria-hidden="true"
              />
              <span
                className="truncate flex-1"
                style={{ color: 'rgba(210, 225, 250, 0.88)' }}
                title={s.label}
              >
                {s.label}
              </span>
              <span
                className="tabular-nums flex-shrink-0 text-[10px]"
                style={{ color: 'rgba(200, 220, 250, 0.72)' }}
                title="Deal count"
              >
                {s.count} {s.count === 1 ? 'deal' : 'deals'}
              </span>
              <span
                className="tabular-nums flex-shrink-0 text-[10px]"
                style={{ color: 'rgba(200, 220, 250, 0.65)' }}
                title="Share of closing fees"
              >
                {s.pct.toFixed(1)}%
              </span>
              <span
                className="font-medium tabular-nums flex-shrink-0 min-w-[56px] text-right"
                style={{ color: GLASS_TOKENS.valueColor }}
                title="Total fee"
              >
                {formatCurrency(s.fee)}
              </span>
            </li>
          ))}
        </ul>
      </GlassCardBody>
    </GlassCard>
    <LatestShareReportDialog open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}

/**
 * Executive KPI tile — uses the exact GlassCard header / value / meta
 * typography hierarchy as Weekly Rundown:
 *   • Header: uppercase tracked title + muted subtitle (in header slot, not body)
 *   • Body  : dominant numeric value (GLASS_TOKENS.valueClass / valueColor)
 *   • Meta  : small pill-style trend badge (matches KPISummaryCard.TrendBadge)
 */
function StatCard({
  title,
  value,
  subtitle,
  loading,
  onClick,
  tooltip,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  loading?: boolean;
  onClick?: () => void;
  tooltip?: React.ReactNode;
}) {
  const info = tooltip ? (
    <UITooltipProvider delayDuration={150}>
      <UITooltip>
        <UITooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="How this is calculated"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </UITooltipTrigger>
        <UITooltipContent side="bottom" align="end" className="max-w-xs text-xs leading-relaxed">
          {tooltip}
        </UITooltipContent>
      </UITooltip>
    </UITooltipProvider>
  ) : undefined;

  return (
    <GlassCard
      interactive
    >
      <GlassCardHeader title={title} subtitle={subtitle} right={info} />
      <GlassCardBody className="pt-0 pb-5 space-y-2">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : onClick ? (
          <button
            type="button"
            onClick={onClick}
            className={`drilldown-value ${GLASS_TOKENS.valueClass} text-left`}
            style={{ color: GLASS_TOKENS.valueColor }}
          >
            {value}
          </button>
        ) : (
          <p
            className={GLASS_TOKENS.valueClass}
            style={{ color: GLASS_TOKENS.valueColor }}
          >
            {value}
          </p>
        )}
      </GlassCardBody>
    </GlassCard>
  );
}

function NoDataCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <GlassCard>
      <GlassCardHeader title={title} subtitle={subtitle} />
      <GlassCardBody className="flex flex-col items-center justify-center py-10">
        <Lock className="h-8 w-8 mb-2" style={{ color: 'rgba(160, 200, 255, 0.30)' }} />
        <p
          className="text-[11px] uppercase tracking-wider"
          style={{ color: GLASS_TOKENS.metaColor }}
        >
          No Data Available
        </p>
      </GlassCardBody>
    </GlassCard>
  );
}

/** Shared header bundle for chart cards — matches Profit by Entity / Revenue Overview. */
function ChartCardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <GlassCardHeader title={title} subtitle={subtitle} />;
}

// ── Drilldown modal ───────────────────────────────────────────────
// Powers click-through from each top-row KPI tile. Renders either a
// deal-level table (cards #1, #2, #4) or a QBO Income line-item table
// (card #3). Currency totals are computed from the rendered rows so the
// modal stays internally consistent with what the user sees.

type ExecKpiDrilldownKind =
  | { kind: 'deals'; rows: ExecKpiDrilldownDeal[]; subtitle?: string }
  | { kind: 'revenue'; rows: ExecRevenueLineItem[]; subtitle?: string };

type ExecKpiDrilldown = ExecKpiDrilldownKind & { title: string };

function fmtFullMoney(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function ExecKpiDrilldownModal({
  drilldown,
  onClose,
}: {
  drilldown: ExecKpiDrilldown | null;
  onClose: () => void;
}) {
  const open = !!drilldown;
  const total =
    drilldown?.kind === 'deals'
      ? drilldown.rows.reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0)
      : drilldown?.kind === 'revenue'
        ? drilldown.rows.reduce((s, r) => s + r.amount, 0)
        : 0;
  const count = drilldown?.rows.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{drilldown?.title ?? ''}</DialogTitle>
          {drilldown?.subtitle && (
            <DialogDescription>{drilldown.subtitle}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-xs">
            {count} {drilldown?.kind === 'revenue' ? 'line item' : 'deal'}
            {count === 1 ? '' : 's'}
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono">
            {fmtFullMoney(total)}
          </Badge>
        </div>

        {count === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No underlying records for this metric.
          </p>
        ) : drilldown?.kind === 'deals' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Stage</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Value</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {drilldown.rows.map(d => (
                  <tr key={`${d.deal_id}-${d.occurred_at ?? ''}`} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{d.company}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.stage_label ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{fmtFullMoney(d.value)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {d.occurred_at
                        ? new Date(d.occurred_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <Link
                        to={`/deals/${d.deal_id}`}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        title="Open deal"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Income Account</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {drilldown.rows.map((r, i) => (
                  <tr key={`${r.account}-${i}`} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">{r.account}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{fmtFullMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ExecutiveDashboard() {
  // ── Week stepper state (Mon → Sun) ─────────────────────────────
  // Anchor is the Monday of the selected week. Persisted per-user via
  // localStorage so a user who returns to the page sees the same week
  // they were last reviewing.
  const STORAGE_KEY = 'executiveDashboard.weekAnchor';
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return startOfWeek(d, { weekStartsOn: 1 });
      }
    } catch { /* ignore */ }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, weekAnchor.toISOString());
    } catch { /* ignore */ }
  }, [weekAnchor]);

  const selectedWindow: ExecKpiWindow = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 1 });
    const end = endOfWeek(weekAnchor, { weekStartsOn: 1 });
    return {
      start,
      end,
      label: `${fmtDateFn(start, 'MMM d')} → ${fmtDateFn(end, 'MMM d, yyyy')}`,
    };
  }, [weekAnchor]);

  const isCurrentWeek = useMemo(
    () => isSameWeek(weekAnchor, new Date(), { weekStartsOn: 1 }),
    [weekAnchor],
  );

  const goPrev = useCallback(() => setWeekAnchor(d => addWeeks(d, -1)), []);
  const goNext = useCallback(() => setWeekAnchor(d => addWeeks(d, 1)), []);
  const goCurrent = useCallback(() => setWeekAnchor(startOfWeek(new Date(), { weekStartsOn: 1 })), []);

  const kpis = useExecutiveTopRowKpis(selectedWindow);
  const [drilldown, setDrilldown] = useState<ExecKpiDrilldown | null>(null);

  // Date windows surfaced in tooltips so users can see the exact period
  const fmtMoney = (v: number | null) =>
    v === null || !Number.isFinite(v) ? '—' : formatCurrency(v);
  const fmtCount = (v: number | null) =>
    v === null || !Number.isFinite(v) ? '—' : v.toLocaleString();

  return (
    <div className="space-y-6">
      {/* Week stepper — drives the time-bound metrics on this page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            aria-label="Previous week"
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center px-3 py-1.5 rounded-md bg-white/5 border border-white/10">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Week of
            </p>
            <p className="text-xs font-medium tabular-nums">{selectedWindow.label}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={isCurrentWeek}
            aria-label="Next week"
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goCurrent}
              className="h-8 text-xs"
            >
              Current week
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Mon → Sun · Total Active Deal Volume is always live
        </p>
      </div>

      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Total Active Deal Volume"
          value={fmtMoney(kpis.totalActiveDealVolume.value)}
          subtitle="Final Credit Items → In Due Diligence"
          loading={kpis.totalActiveDealVolume.loading}
          tooltip={
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">Total Active Deal Volume</p>
              <p>SUM of <span className="font-mono">deal value</span> for every open deal whose current stage falls in the inclusive range <em>Final Credit Items → In Due Diligence</em>.</p>
              <p className="text-muted-foreground">Pipeline: active (default). Window: live snapshot.</p>
            </div>
          }
          onClick={() =>
            setDrilldown({
              kind: 'deals',
              title: 'Total Active Deal Volume',
              subtitle: 'Open deals · Final Credit Items → In Due Diligence (active pipeline)',
              rows: kpis.totalActiveDealVolume.deals,
            })
          }
        />
        <StatCard
          title="Deals Closed"
          value={fmtCount(kpis.dealsClosedQTD.value)}
          subtitle={`Entered Funded / Invoiced · ${selectedWindow.label}`}
          loading={kpis.dealsClosedQTD.loading}
          tooltip={
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">Deals Closed</p>
              <p>COUNT of distinct deals that <em>entered</em> the <em>Funded / Invoiced</em> stage during the selected window (stage-entry events, not current snapshots).</p>
              <p className="text-muted-foreground">Window: {selectedWindow.label}.</p>
            </div>
          }
          onClick={() =>
            setDrilldown({
              kind: 'deals',
              title: `Deals Closed · ${selectedWindow.label}`,
              subtitle: 'Stage-entry events into Funded / Invoiced for the selected window',
              rows: kpis.dealsClosedQTD.deals,
            })
          }
        />
      </div>

      {/* Row 2: Deal Types */}
      <div className="grid grid-cols-1 gap-4">
        <DealsByStatusPieChart window={{ start: selectedWindow.start, end: selectedWindow.end }} />
      </div>

      <ExecKpiDrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone Executive Dashboard widgets
// Each one is independently mounted as a tile in the unified Weekly Rundown
// grid (so they can be dragged/resized just like the rest of the widgets).
// They share a Mon→Sun week anchor via localStorage so toggling the week
// selector tile keeps every tile in sync.
// ─────────────────────────────────────────────────────────────────────────────
const EXEC_WEEK_STORAGE_KEY = 'executiveDashboard.weekAnchor';
const EXEC_WEEK_EVENT = 'executiveDashboard.weekAnchor.change';

function readWeekAnchor(): Date {
  try {
    const raw = globalThis.localStorage?.getItem(EXEC_WEEK_STORAGE_KEY);
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return startOfWeek(d, { weekStartsOn: 1 });
    }
  } catch { /* ignore */ }
  return startOfWeek(new Date(), { weekStartsOn: 1 });
}

function writeWeekAnchor(d: Date) {
  try {
    globalThis.localStorage?.setItem(EXEC_WEEK_STORAGE_KEY, d.toISOString());
    globalThis.dispatchEvent(new CustomEvent(EXEC_WEEK_EVENT));
  } catch { /* ignore */ }
}

function useExecutiveWeekWindow() {
  const [weekAnchor, setWeekAnchor] = useState<Date>(readWeekAnchor);

  useEffect(() => {
    const onChange = () => setWeekAnchor(readWeekAnchor());
    globalThis.addEventListener(EXEC_WEEK_EVENT, onChange);
    globalThis.addEventListener('storage', onChange);
    return () => {
      globalThis.removeEventListener(EXEC_WEEK_EVENT, onChange);
      globalThis.removeEventListener('storage', onChange);
    };
  }, []);

  const setAnchor = useCallback((d: Date) => {
    const norm = startOfWeek(d, { weekStartsOn: 1 });
    writeWeekAnchor(norm);
    setWeekAnchor(norm);
  }, []);

  const selectedWindow: ExecKpiWindow = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 1 });
    const end = endOfWeek(weekAnchor, { weekStartsOn: 1 });
    return {
      start,
      end,
      label: `${fmtDateFn(start, 'MMM d')} → ${fmtDateFn(end, 'MMM d, yyyy')}`,
    };
  }, [weekAnchor]);

  const isCurrentWeek = useMemo(
    () => isSameWeek(weekAnchor, new Date(), { weekStartsOn: 1 }),
    [weekAnchor],
  );

  return {
    weekAnchor,
    selectedWindow,
    isCurrentWeek,
    goPrev: () => setAnchor(addWeeks(weekAnchor, -1)),
    goNext: () => setAnchor(addWeeks(weekAnchor, 1)),
    goCurrent: () => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 })),
  };
}

export function ExecWeekSelectorWidget() {
  const { selectedWindow, isCurrentWeek, goPrev, goNext, goCurrent } = useExecutiveWeekWindow();
  return (
    <GlassCard className="h-full">
      <GlassCardHeader title="Executive Dashboard" subtitle="Week selector · Mon → Sun" />
      <GlassCardBody className="pt-0 pb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev} aria-label="Previous week" className="h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center px-3 py-1.5 rounded-md bg-white/5 border border-white/10">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Week of</p>
            <p className="text-xs font-medium tabular-nums">{selectedWindow.label}</p>
          </div>
          <Button variant="outline" size="sm" onClick={goNext} disabled={isCurrentWeek} aria-label="Next week" className="h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={goCurrent} className="h-8 text-xs">Current week</Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Total Active Deal Volume is always live</p>
      </GlassCardBody>
    </GlassCard>
  );
}

export function ExecTotalActiveDealVolumeWidget() {
  const tf = useInsightsTimeframeOptional();
  const fallback = useExecutiveWeekWindow();
  const selectedWindow: ExecKpiWindow = tf
    ? {
        start: new Date(tf.timeframe.start + 'T00:00:00'),
        end: new Date(tf.timeframe.end + 'T23:59:59.999'),
        label: tf.timeframe.label,
      }
    : fallback.selectedWindow;
  const kpis = useExecutiveTopRowKpis(selectedWindow);
  const [drilldown, setDrilldown] = useState<ExecKpiDrilldown | null>(null);
  const fmtMoney = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : formatCurrency(v));
  return (
    <>
      <StatCard
        title="Total Active Deal Volume"
        value={fmtMoney(kpis.totalActiveDealVolume.value)}
        subtitle="Final Credit Items → In Due Diligence"
        loading={kpis.totalActiveDealVolume.loading}
        tooltip={
          <div className="space-y-1.5">
            <p className="font-medium text-foreground">Total Active Deal Volume</p>
            <p>SUM of <span className="font-mono">deal value</span> for every open deal whose current stage falls in the inclusive range <em>Final Credit Items → In Due Diligence</em>.</p>
            <p className="text-muted-foreground">Pipeline: active (default). Window: live snapshot.</p>
          </div>
        }
        onClick={() => setDrilldown({
          kind: 'deals',
          title: 'Total Active Deal Volume',
          subtitle: 'Open deals · Final Credit Items → In Due Diligence (active pipeline)',
          rows: kpis.totalActiveDealVolume.deals,
        })}
      />
      <ExecKpiDrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} />
    </>
  );
}

export function ExecDealsClosedWidget() {
  const tf = useInsightsTimeframeOptional();
  const fallback = useExecutiveWeekWindow();
  const selectedWindow: ExecKpiWindow = tf
    ? {
        start: new Date(tf.timeframe.start + 'T00:00:00'),
        end: new Date(tf.timeframe.end + 'T23:59:59.999'),
        label: tf.timeframe.label,
      }
    : fallback.selectedWindow;
  const kpis = useExecutiveTopRowKpis(selectedWindow);
  const [drilldown, setDrilldown] = useState<ExecKpiDrilldown | null>(null);
  const fmtCount = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : v.toLocaleString());
  return (
    <>
      <StatCard
        title="Deals Closed"
        value={fmtCount(kpis.dealsClosedQTD.value)}
        subtitle={`Entered Funded / Invoiced · ${selectedWindow.label}`}
        loading={kpis.dealsClosedQTD.loading}
        tooltip={
          <div className="space-y-1.5">
            <p className="font-medium text-foreground">Deals Closed</p>
            <p>COUNT of distinct deals that <em>entered</em> the <em>Funded / Invoiced</em> stage during the selected window (stage-entry events, not current snapshots).</p>
            <p className="text-muted-foreground">Window: {selectedWindow.label}.</p>
          </div>
        }
        onClick={() => setDrilldown({
          kind: 'deals',
          title: `Deals Closed · ${selectedWindow.label}`,
          subtitle: 'Stage-entry events into Funded / Invoiced for the selected window',
          rows: kpis.dealsClosedQTD.deals,
        })}
      />
      <ExecKpiDrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} />
    </>
  );
}

export function ExecDealsByStatusWidget() {
  const tf = useInsightsTimeframeOptional();
  const fallback = useExecutiveWeekWindow();
  const selectedWindow: ExecKpiWindow = tf
    ? {
        start: new Date(tf.timeframe.start + 'T00:00:00'),
        end: new Date(tf.timeframe.end + 'T23:59:59.999'),
        label: tf.timeframe.label,
      }
    : fallback.selectedWindow;
  return <DealsByStatusPieChart window={{ start: selectedWindow.start, end: selectedWindow.end }} />;
}
