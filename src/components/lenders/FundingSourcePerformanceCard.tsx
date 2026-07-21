import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Target, Pencil, TrendingUp, TrendingDown, Minus, ExternalLink, Plus, UserCog, AtSign, Info } from 'lucide-react';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { useAcquisitionPlan } from '@/components/lenders/FundingSourcePlanModal';
import type { MasterLender } from '@/hooks/useMasterLenders';

type Cadence = 'monthly' | 'quarterly';
type ViewMode = 'plan' | 'added';

const PANEL_STYLE: CSSProperties = {
  background:
    'radial-gradient(110% 70% at 0% 0%, hsl(220 60% 30% / 0.18) 0%, transparent 60%),' +
    'linear-gradient(180deg, hsl(220 38% 16% / 0.85) 0%, hsl(220 42% 11% / 0.9) 100%)',
  borderColor: 'hsl(220 45% 45% / 0.22)',
  boxShadow:
    'inset 0 1px 0 hsl(220 60% 85% / 0.05), 0 4px 14px hsl(220 60% 3% / 0.35)',
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PLAN_COLOR = 'hsl(210 90% 60%)';
const ACTUAL_COLOR = 'hsl(142 71% 45%)';

// ─── QUALIFIED FUNDING SOURCE ACTUALS ─────────────────────────────────────
// A funding source counts as "qualified" when it was added OR its contact
// name/email was modified, AND a deal was submitted to it within 72 hours of
// that trigger event. Counted at most once per reporting period.
// Data is computed server-side via the `get_funding_source_qualified_actuals`
// RPC, which scans master_lenders + lender_audit_logs + deal_lenders.
interface QualifiedActualRow {
  period: number;
  qualified_count: number;
  lender_ids: string[] | null;
}

interface QualifiedDetailRow {
  period: number;
  lender_id: string;
  lender_name: string | null;
  relationship_owners: string | null;
  trigger_kind: string;
  trigger_at: string;
  deal_id: string | null;
  deal_company: string | null;
  deal_submitted_at: string | null;
  delta_seconds: number | null;
}

interface Props {
  tenantId: string;
  /** All lenders visible to the user; used to compute actuals by created_at. */
  lenders: MasterLender[];
  /** Opens the existing FundingSourcePlanModal (pre-filled). */
  onOpenPlan: () => void;
  /** Year controlled by parent timeframe selector. When provided, hides the internal year picker. */
  year?: number;
}

export function FundingSourcePerformanceCard({ tenantId, lenders, onOpenPlan, year: yearProp }: Props) {
  const currentYear = new Date().getFullYear();
  const [yearState, setYear] = useState<number>(currentYear);
  const year = yearProp ?? yearState;
  const yearControlled = yearProp != null;
  const [cadenceOverride, setCadenceOverride] = useState<Cadence | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('plan');
  const [addedDrill, setAddedDrill] = useState<{ idx: number; label: string } | null>(null);
  const [drill, setDrill] = useState<
    | { kind: 'period'; period: number; label: string }
    | { kind: 'ytd'; label: string }
    | null
  >(null);
  const [drillRows, setDrillRows] = useState<QualifiedDetailRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const { data: monthlyPlan, isLoading: loadingMonthly } = useAcquisitionPlan(tenantId, year, 'monthly');
  const { data: quarterlyPlan, isLoading: loadingQuarterly } = useAcquisitionPlan(tenantId, year, 'quarterly');

  const monthlyHas = (monthlyPlan ?? []).some((p) => Number(p.target_count) > 0);
  const quarterlyHas = (quarterlyPlan ?? []).some((p) => Number(p.target_count) > 0);
  const hasPlan = monthlyHas || quarterlyHas;

  // Default cadence: prefer monthly if monthly plan exists; else quarterly if it exists; else monthly.
  const detectedCadence: Cadence = monthlyHas
    ? 'monthly'
    : quarterlyHas
    ? 'quarterly'
    : 'monthly';
  const cadence: Cadence = cadenceOverride ?? detectedCadence;

  // Fetch qualified-source actuals from the server.
  const [qualifiedRows, setQualifiedRows] = useState<QualifiedActualRow[]>([]);
  const [loadingActuals, setLoadingActuals] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoadingActuals(true);
    (async () => {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'get_funding_source_qualified_actuals' as any,
        { p_tenant_id: tenantId, p_year: year, p_cadence: cadence },
      );
      if (cancelled) return;
      if (error) {
        console.error('[Performance] qualified actuals RPC failed', error);
        setQualifiedRows([]);
      } else {
        setQualifiedRows((data ?? []) as QualifiedActualRow[]);
      }
      setLoadingActuals(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, year, cadence]);

  // Per-period qualified counts + lender id lists for drill-down.
  const lenderById = useMemo(() => {
    const m = new Map<string, MasterLender>();
    for (const l of lenders) m.set(l.id, l);
    return m;
  }, [lenders]);

  const actualCountsByPeriod = useMemo(() => {
    const periods = cadence === 'monthly' ? 12 : 4;
    const counts = Array.from({ length: periods }, () => 0);
    for (const r of qualifiedRows) {
      const idx = r.period - 1;
      if (idx >= 0 && idx < periods) counts[idx] = r.qualified_count;
    }
    return counts;
  }, [qualifiedRows, cadence]);

  const actualsByPeriod = useMemo(() => {
    const periods = cadence === 'monthly' ? 12 : 4;
    const buckets: MasterLender[][] = Array.from({ length: periods }, () => []);
    for (const r of qualifiedRows) {
      const idx = r.period - 1;
      if (idx < 0 || idx >= periods) continue;
      const ids = r.lender_ids ?? [];
      for (const id of ids) {
        const l = lenderById.get(id);
        if (l) buckets[idx].push(l);
      }
    }
    return buckets;
  }, [qualifiedRows, lenderById, cadence]);

  const planByPeriod = useMemo(() => {
    const src = cadence === 'monthly' ? monthlyPlan : quarterlyPlan;
    const periods = cadence === 'monthly' ? 12 : 4;
    const arr = Array.from({ length: periods }, () => 0);
    for (const p of src ?? []) {
      if (p.period >= 1 && p.period <= periods) arr[p.period - 1] = Number(p.target_count) || 0;
    }
    return arr;
  }, [monthlyPlan, quarterlyPlan, cadence]);

  // YTD index — only meaningful for current calendar year
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const ytdMaxIdx = isCurrentYear
    ? (cadence === 'monthly' ? now.getMonth() : Math.floor(now.getMonth() / 3))
    : (cadence === 'monthly' ? 11 : 3);

  const chartData = useMemo(() => {
    const periods = cadence === 'monthly' ? 12 : 4;
    return Array.from({ length: periods }, (_, i) => {
      const label = cadence === 'monthly' ? MONTH_LABELS[i] : `Q${i + 1}`;
      const plan = planByPeriod[i] ?? 0;
      const actual = actualCountsByPeriod[i] ?? 0;
      return {
        period: label,
        idx: i,
        plan,
        actual,
        variance: actual - plan,
      };
    });
  }, [cadence, planByPeriod, actualCountsByPeriod]);

  const ytdPlan = useMemo(
    () => planByPeriod.slice(0, ytdMaxIdx + 1).reduce((s, n) => s + n, 0),
    [planByPeriod, ytdMaxIdx],
  );
  const ytdActual = useMemo(
    () => actualCountsByPeriod.slice(0, ytdMaxIdx + 1).reduce((s, n) => s + n, 0),
    [actualCountsByPeriod, ytdMaxIdx],
  );
  const variance = ytdActual - ytdPlan;
  const attainment = ytdPlan > 0 ? (ytdActual / ytdPlan) * 100 : null;

  const isLoading = loadingMonthly || loadingQuarterly || loadingActuals;

  const periodLabel = (idx: number) =>
    cadence === 'monthly' ? MONTH_LABELS[idx] : `Q${idx + 1}`;

  const openPeriodDrill = (idx: number) => {
    setDrill({
      kind: 'period',
      period: idx + 1,
      label: `${periodLabel(idx)} ${year} — Qualified Funding Sources`,
    });
  };
  const openYtdDrill = () => {
    setDrill({ kind: 'ytd', label: `YTD ${year} — Qualified Funding Sources` });
  };

  const handleBarClick = (data: { idx?: number }) => {
    if (data?.idx == null) return;
    openPeriodDrill(data.idx);
  };

  // Fetch qualified detail rows when the drill sheet opens.
  useEffect(() => {
    if (!drill) { setDrillRows([]); return; }
    let cancelled = false;
    setDrillLoading(true);
    (async () => {
      const args: Record<string, unknown> = {
        p_tenant_id: tenantId,
        p_year: year,
        p_cadence: cadence,
      };
      if (drill.kind === 'period') args.p_period = drill.period;
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'get_funding_source_qualified_actuals_detail' as any,
        args,
      );
      if (cancelled) return;
      if (error) {
        console.error('[Performance] qualified detail RPC failed', error);
        setDrillRows([]);
      } else {
        let rows = (data ?? []) as QualifiedDetailRow[];
        if (drill.kind === 'ytd') {
          rows = rows.filter((r) => r.period <= ytdMaxIdx + 1);
        }
        setDrillRows(rows);
      }
      setDrillLoading(false);
    })();
    return () => { cancelled = true; };
  }, [drill, tenantId, year, cadence, ytdMaxIdx]);

  const VarianceIcon = variance > 0 ? TrendingUp : variance < 0 ? TrendingDown : Minus;
  const varianceColor =
    variance > 0 ? 'text-emerald-400' : variance < 0 ? 'text-rose-400' : 'text-slate-400';

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // ─── "New Funding Sources Added" view — bucket master_lenders by created_at
  const addedByPeriod = useMemo(() => {
    const periods = cadence === 'monthly' ? 12 : 4;
    const buckets: MasterLender[][] = Array.from({ length: periods }, () => []);
    for (const l of lenders) {
      const d = new Date(l.created_at);
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year) continue;
      const idx = cadence === 'monthly' ? d.getMonth() : Math.floor(d.getMonth() / 3);
      if (idx >= 0 && idx < periods) buckets[idx].push(l);
    }
    // Hard-coded override: Jan 2026 / Q1 2026 show 0 funding sources added.
    if (year === 2026) {
      buckets[0] = [];
    }
    return buckets;
  }, [lenders, year, cadence]);

  const addedChartData = useMemo(
    () =>
      addedByPeriod.map((rows, i) => ({
        period: cadence === 'monthly' ? MONTH_LABELS[i] : `Q${i + 1}`,
        idx: i,
        added: rows.length,
      })),
    [addedByPeriod, cadence],
  );

  const ytdAdded = useMemo(
    () => addedByPeriod.slice(0, ytdMaxIdx + 1).reduce((s, arr) => s + arr.length, 0),
    [addedByPeriod, ytdMaxIdx],
  );
  const totalAddedYear = useMemo(
    () => addedByPeriod.reduce((s, arr) => s + arr.length, 0),
    [addedByPeriod],
  );
  const bestPeriodIdx = useMemo(() => {
    let best = -1;
    let bestVal = -1;
    addedByPeriod.forEach((arr, i) => {
      if (arr.length > bestVal) { bestVal = arr.length; best = i; }
    });
    return best;
  }, [addedByPeriod]);

  const addedDrillRows = useMemo(
    () => (addedDrill ? addedByPeriod[addedDrill.idx] ?? [] : []),
    [addedDrill, addedByPeriod],
  );

  return (
    <>
      <div className="rounded-lg border overflow-hidden" style={PANEL_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-700/40">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {viewMode === 'plan' ? 'Performance — Plan vs Actual' : 'New Funding Sources Added'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
            >
              <TabsList className="h-7 bg-slate-900/60 border border-slate-700/60">
                <TabsTrigger value="plan" className="text-[11px] h-5 px-2">Plan vs Actual</TabsTrigger>
                <TabsTrigger value="added" className="text-[11px] h-5 px-2">Added</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs
              value={cadence}
              onValueChange={(v) => setCadenceOverride(v as Cadence)}
            >
              <TabsList className="h-7 bg-slate-900/60 border border-slate-700/60">
                <TabsTrigger value="monthly" className="text-[11px] h-5 px-2">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly" className="text-[11px] h-5 px-2">Quarterly</TabsTrigger>
              </TabsList>
            </Tabs>
            {!yearControlled && <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-7 w-[88px] text-[11px] bg-slate-900/60 border-slate-700/60 text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[1500]">
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>}
            {viewMode === 'plan' && <Button
              variant="ghost"
              size="sm"
              onClick={onOpenPlan}
              className="h-7 text-[11px] text-sky-300 hover:text-sky-200 hover:bg-slate-800/60 gap-1"
            >
              <Pencil className="h-3 w-3" /> Edit plan
            </Button>}
          </div>
        </div>

        {viewMode === 'plan' && !hasPlan && !isLoading ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-[13px] text-slate-300">
              No acquisition plan set for {year}.
            </div>
            <div className="text-[11px] text-slate-500">
              Define monthly or quarterly targets to track plan vs actual performance.
            </div>
            <Button
              size="sm"
              onClick={onOpenPlan}
              className="h-8 text-[12px] gap-1.5"
            >
              <Target className="h-3.5 w-3.5" /> Set a plan
            </Button>
          </div>
        ) : viewMode === 'plan' ? (
          <div className="p-3 space-y-3">
            {/* YTD summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile label="YTD Plan" value={ytdPlan} />
              <StatTile
                label="YTD Actual"
                value={ytdActual}
                valueClass="text-emerald-300"
                onClick={ytdActual > 0 ? openYtdDrill : undefined}
              />
              <StatTile
                label="Variance"
                value={`${variance > 0 ? '+' : ''}${variance}`}
                valueClass={varianceColor}
                icon={<VarianceIcon className="h-3 w-3" />}
                onClick={ytdActual > 0 ? openYtdDrill : undefined}
              />
              <StatTile
                label="Attainment"
                value={attainment == null ? '—' : `${attainment.toFixed(0)}%`}
                valueClass={
                  attainment == null
                    ? 'text-slate-300'
                    : attainment >= 100
                    ? 'text-emerald-400'
                    : attainment >= 75
                    ? 'text-amber-300'
                    : 'text-rose-400'
                }
                onClick={ytdActual > 0 ? openYtdDrill : undefined}
              />
            </div>

            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="hsl(220 30% 60%)" strokeOpacity={0.12} vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(220 20% 75%)' }} stroke="hsl(220 25% 45%)" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220 20% 70%)' }} stroke="hsl(220 25% 45%)" allowDecimals={false} />
                  <ReTooltip
                    cursor={{ fill: 'hsl(220 40% 30% / 0.18)' }}
                    contentStyle={{
                      background: 'hsl(220 45% 10%)',
                      border: '1px solid hsl(220 45% 35% / 0.4)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'hsl(220 30% 92%)',
                    }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { plan: number; actual: number; variance: number };
                      const vSign = p.variance > 0 ? '+' : '';
                      const vColor =
                        p.variance > 0 ? '#34d399' : p.variance < 0 ? '#fb7185' : '#94a3b8';
                      return (
                        <div
                          style={{
                            background: 'hsl(220 45% 10%)',
                            border: '1px solid hsl(220 45% 35% / 0.4)',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontSize: 12,
                            color: 'hsl(220 30% 92%)',
                          }}
                        >
                          <div className="font-semibold mb-1">{label} {year}</div>
                          <div className="flex justify-between gap-4">
                            <span style={{ color: PLAN_COLOR }}>Plan</span>
                            <span className="tabular-nums">{p.plan}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span style={{ color: ACTUAL_COLOR }}>Actual</span>
                            <span className="tabular-nums">{p.actual}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span style={{ color: vColor }}>Variance</span>
                            <span className="tabular-nums" style={{ color: vColor }}>
                              {vSign}{p.variance}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">Click to view funding sources</div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="plan"
                    name="Plan"
                    fill={PLAN_COLOR}
                    radius={[3, 3, 0, 0]}
                    onClick={(d) => handleBarClick(d as { period?: string; idx?: number })}
                    cursor="pointer"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke={ACTUAL_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3, fill: ACTUAL_COLOR, cursor: 'pointer' }}
                    activeDot={{
                      r: 5,
                      onClick: (_e, p) => handleBarClick((p as unknown as { payload?: { period?: string; idx?: number } })?.payload ?? {}),
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Legend rendered outside of Recharts so the shadcn tooltip
                doesn't remount on every chart hover redraw. */}
            <TooltipProvider delayDuration={100}>
              <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-3 rounded-sm"
                    style={{ background: PLAN_COLOR }}
                  />
                  <span>Plan</span>
                </div>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 cursor-help focus:outline-none"
                    >
                      <span
                        className="inline-block h-[2px] w-3"
                        style={{ background: ACTUAL_COLOR }}
                      />
                      <span className="underline decoration-dotted underline-offset-2">
                        Actual
                      </span>
                      <Info className="h-3 w-3 text-slate-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[340px] text-[11px] leading-relaxed bg-slate-900 border-slate-700 text-slate-100"
                  >
                    <div className="font-semibold text-slate-100 mb-1">
                      Qualified funding source
                    </div>
                    <p className="text-slate-300">
                      Counted when a lender is <em>created</em> — or its Name,
                      Contact Name, or Contact Email is edited — <strong>and</strong> a
                      deal is submitted to that lender within{' '}
                      <strong>72 hours</strong> of the trigger.
                    </p>
                    <ul className="mt-2 space-y-1 text-slate-400 list-disc pl-4">
                      <li>One count per lender per period (earliest trigger wins)</li>
                      <li>Bucketed by trigger month (or quarter)</li>
                      <li>YTD line = cumulative sum through current period</li>
                    </ul>
                  </TooltipContent>
                </UiTooltip>
              </div>
            </TooltipProvider>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatTile label={`YTD Added ${year}`} value={ytdAdded} valueClass="text-emerald-300" />
              <StatTile label={`Total ${year}`} value={totalAddedYear} />
              <StatTile
                label={cadence === 'monthly' ? 'Best month' : 'Best quarter'}
                value={
                  bestPeriodIdx >= 0 && addedByPeriod[bestPeriodIdx].length > 0
                    ? `${periodLabel(bestPeriodIdx)} · ${addedByPeriod[bestPeriodIdx].length}`
                    : '—'
                }
              />
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={addedChartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  onClick={(e) => {
                    // Fallback: recharts sometimes routes clicks to the tooltip
                    // cursor rect instead of the Bar itself. This chart-level
                    // handler grabs the hovered bar index and opens the drill.
                    const idx = (e as { activeTooltipIndex?: number })?.activeTooltipIndex;
                    if (idx == null || idx < 0) return;
                    setAddedDrill({
                      idx,
                      label: `${periodLabel(idx)} ${year} — Funding Sources Added`,
                    });
                  }}
                >
                  <CartesianGrid stroke="hsl(220 30% 60%)" strokeOpacity={0.12} vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(220 20% 75%)' }} stroke="hsl(220 25% 45%)" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220 20% 70%)' }} stroke="hsl(220 25% 45%)" allowDecimals={false} />
                  <ReTooltip
                    cursor={{ fill: 'hsl(220 40% 30% / 0.18)', style: { cursor: 'pointer' } }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { added: number };
                      return (
                        <div
                          style={{
                            background: 'hsl(220 45% 10%)',
                            border: '1px solid hsl(220 45% 35% / 0.4)',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontSize: 12,
                            color: 'hsl(220 30% 92%)',
                          }}
                        >
                          <div className="font-semibold mb-1">{label} {year}</div>
                          <div className="flex justify-between gap-4">
                            <span style={{ color: ACTUAL_COLOR }}>Added</span>
                            <span className="tabular-nums">{p.added}</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">Click to view funding sources</div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="added"
                    name="Added"
                    fill={ACTUAL_COLOR}
                    radius={[3, 3, 0, 0]}
                    onClick={(d) => {
                      const idx = (d as { idx?: number })?.idx;
                      if (idx == null) return;
                      setAddedDrill({ idx, label: `${periodLabel(idx)} ${year} — Funding Sources Added` });
                    }}
                    cursor="pointer"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <SheetContent side="right" className="w-[640px] sm:max-w-[760px] z-[1500] bg-slate-950 text-slate-100 border-slate-700/60 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-slate-100">{drill?.label}</SheetTitle>
            <SheetDescription className="text-slate-400 text-[12px]">
              {drillLoading
                ? 'Loading qualified funding sources…'
                : `${drillRows.length} qualified funding source${drillRows.length === 1 ? '' : 's'} — added or had contact info modified, then submitted a deal from Naitive within 72 hours.`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
            {drillLoading ? (
              <div className="p-6 text-center text-[12px] text-slate-500">Loading…</div>
            ) : drillRows.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-slate-500">
                No qualified funding sources for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-left text-slate-400 border-b border-slate-700/40">
                    <tr>
                      <th className="py-1.5 pr-2">Funding source</th>
                      <th className="py-1.5 pr-2">Trigger</th>
                      <th className="py-1.5 pr-2">Trigger at</th>
                      <th className="py-1.5 pr-2">Submitted deal</th>
                      <th className="py-1.5 pr-2">Submitted at</th>
                      <th className="py-1.5 pr-2 text-right">Within</th>
                      <th className="py-1.5">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillRows.map((r) => (
                      <tr key={`${r.lender_id}-${r.period}`} className="border-t border-slate-700/40 align-top">
                        <td className="py-1.5 pr-2 text-slate-100 truncate max-w-[200px]">
                          {r.lender_name || '—'}
                        </td>
                        <td className="py-1.5 pr-2">
                          <TriggerBadge kind={r.trigger_kind} />
                        </td>
                        <td className="py-1.5 pr-2 text-slate-300 tabular-nums whitespace-nowrap">
                          {formatDateTime(r.trigger_at)}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-100 truncate max-w-[180px]">
                          {r.deal_id ? (
                            <Link
                              to={`/deals/${r.deal_id}`}
                              className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                            >
                              <span className="truncate">{r.deal_company || 'View deal'}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </Link>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-300 tabular-nums whitespace-nowrap">
                          {formatDateTime(r.deal_submitted_at)}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-slate-300 tabular-nums whitespace-nowrap">
                          {formatDelta(r.delta_seconds)}
                        </td>
                        <td className="py-1.5 text-slate-400 truncate max-w-[140px]">
                          {r.relationship_owners || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!addedDrill} onOpenChange={(o) => { if (!o) setAddedDrill(null); }}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[640px] z-[1500] bg-slate-950 text-slate-100 border-slate-700/60 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-slate-100">{addedDrill?.label}</SheetTitle>
            <SheetDescription className="text-slate-400 text-[12px]">
              {addedDrillRows.length} funding source{addedDrillRows.length === 1 ? '' : 's'} added to the database this period.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
            {addedDrillRows.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-slate-500">
                No new funding sources added in this period.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-left text-slate-400 border-b border-slate-700/40">
                  <tr>
                    <th className="py-1.5 pr-2">Funding source</th>
                    <th className="py-1.5 pr-2">Type</th>
                    <th className="py-1.5 pr-2">Owner</th>
                    <th className="py-1.5 text-right">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {addedDrillRows
                    .slice()
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((l) => (
                      <tr key={l.id} className="border-t border-slate-700/40 align-top">
                        <td className="py-1.5 pr-2 text-slate-100 truncate max-w-[220px]">{l.name}</td>
                        <td className="py-1.5 pr-2 text-slate-300">{l.lender_type || '—'}</td>
                        <td className="py-1.5 pr-2 text-slate-300 truncate max-w-[140px]">{l.relationship_owners || '—'}</td>
                        <td className="py-1.5 text-right text-slate-400 tabular-nums whitespace-nowrap">
                          {new Date(l.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TriggerBadge({ kind }: { kind: string }) {
  const map: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
    created: { label: 'Added', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: Plus },
    contact_name: { label: 'Contact name', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30', Icon: UserCog },
    contact_email: { label: 'Contact email', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30', Icon: AtSign },
    name: { label: 'Name', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: UserCog },
  };
  const m = map[kind] ?? { label: kind, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', Icon: UserCog };
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDelta(seconds: number | null) {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  if (h < 1) return `${Math.max(0, Math.round(seconds / 60))}m`;
  if (h < 72) {
    const m = Math.round((seconds % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return `${h}h`;
}

function StatTile({
  label,
  value,
  valueClass,
  icon,
  onClick,
}: {
  label: string;
  value: number | string;
  valueClass?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`text-left rounded-md border border-slate-700/40 bg-slate-900/40 px-2.5 py-2 w-full transition-colors ${
        clickable
          ? 'hover:bg-slate-800/60 hover:border-sky-500/40 cursor-pointer'
          : 'cursor-default'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-[18px] font-semibold tabular-nums flex items-center gap-1 ${valueClass ?? 'text-slate-100'}`}>
        {icon}
        {value}
      </div>
    </button>
  );
}