import { useMemo, useState, type CSSProperties } from 'react';
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
import { Target, Pencil, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAcquisitionPlan } from '@/components/lenders/FundingSourcePlanModal';
import type { MasterLender } from '@/hooks/useMasterLenders';

type Cadence = 'monthly' | 'quarterly';

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

// ─── TEMPORARY OVERRIDE ────────────────────────────────────────────────────
// The live actuals source (lenders.created_at) is over-counting because it
// reflects every directory row, not actual newly *qualified* lenders. Until a
// canonical "qualified lender" flag exists, hardcode a manual baseline for
// 5th Line's 2026 quarterly Performance view:
//   • Q1 2026  = 2 qualified lenders (fixed)
//   • Q2 2026+ = start from 0, then count only lenders created at/after the
//                override cutoff timestamp below.
// TODO: Replace with a proper "qualified lender" data source.
const PERF_OVERRIDE_YEAR = 2026;
const PERF_OVERRIDE_CUTOFF_ISO = '2026-05-29T00:00:00Z';
const PERF_OVERRIDE_QUARTERLY_BASELINE: Record<number, number> = {
  1: 2, // Q1 2026 — manually fixed
  2: 0,
  3: 0,
  4: 0,
};

interface Props {
  tenantId: string;
  /** All lenders visible to the user; used to compute actuals by created_at. */
  lenders: MasterLender[];
  /** Opens the existing FundingSourcePlanModal (pre-filled). */
  onOpenPlan: () => void;
}

export function FundingSourcePerformanceCard({ tenantId, lenders, onOpenPlan }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [cadenceOverride, setCadenceOverride] = useState<Cadence | null>(null);
  const [drillPeriod, setDrillPeriod] = useState<{ label: string; lenders: MasterLender[] } | null>(null);

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

  // Bucket lenders by period for the selected year.
  const actualsByPeriod = useMemo(() => {
    const periods = cadence === 'monthly' ? 12 : 4;
    const buckets: MasterLender[][] = Array.from({ length: periods }, () => []);
    // Apply the temporary 2026-quarterly override (qualified-lender baseline)
    // only when viewing the 2026 quarterly Performance view.
    const useOverride = year === PERF_OVERRIDE_YEAR && cadence === 'quarterly';
    const cutoffMs = useOverride ? new Date(PERF_OVERRIDE_CUTOFF_ISO).getTime() : 0;
    for (const l of lenders) {
      const t = l.created_at ? new Date(l.created_at) : null;
      if (!t || isNaN(t.getTime())) continue;
      if (t.getFullYear() !== year) continue;
      // Under the override: only count lenders created at/after the cutoff,
      // and never bucket them into Q1 (Q1 is fixed by the baseline below).
      if (useOverride) {
        if (t.getTime() < cutoffMs) continue;
        const qIdx = Math.floor(t.getMonth() / 3);
        if (qIdx === 0) continue;
        buckets[qIdx].push(l);
        continue;
      }
      const m = t.getMonth(); // 0..11
      const idx = cadence === 'monthly' ? m : Math.floor(m / 3);
      buckets[idx].push(l);
    }
    return buckets;
  }, [lenders, year, cadence]);

  // Authoritative per-period actual *counts* for the chart and YTD tiles.
  // Decoupled from the lender list so the temporary 2026-quarterly baseline
  // (Q1 = 2) can be applied without faking lender rows in the drill-down.
  const actualCountsByPeriod = useMemo(() => {
    const periods = cadence === 'monthly' ? 12 : 4;
    const counts = actualsByPeriod.map((b) => b.length);
    if (year === PERF_OVERRIDE_YEAR && cadence === 'quarterly') {
      for (let qIdx = 0; qIdx < periods; qIdx++) {
        const baseline = PERF_OVERRIDE_QUARTERLY_BASELINE[qIdx + 1] ?? 0;
        if ((counts[qIdx] ?? 0) < baseline) counts[qIdx] = baseline;
      }
    }
    return counts;
  }, [actualsByPeriod, year, cadence]);

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

  const isLoading = loadingMonthly || loadingQuarterly;

  const handleBarClick = (data: { period?: string; idx?: number }) => {
    if (data?.idx == null) return;
    const periodLenders = actualsByPeriod[data.idx] ?? [];
    const yLabel = data.period ?? '';
    setDrillPeriod({ label: `${yLabel} ${year}`, lenders: periodLenders });
  };

  const VarianceIcon = variance > 0 ? TrendingUp : variance < 0 ? TrendingDown : Minus;
  const varianceColor =
    variance > 0 ? 'text-emerald-400' : variance < 0 ? 'text-rose-400' : 'text-slate-400';

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <>
      <div className="rounded-lg border overflow-hidden" style={PANEL_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-700/40">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Performance — Plan vs Actual
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tabs
              value={cadence}
              onValueChange={(v) => setCadenceOverride(v as Cadence)}
            >
              <TabsList className="h-7 bg-slate-900/60 border border-slate-700/60">
                <TabsTrigger value="monthly" className="text-[11px] h-5 px-2">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly" className="text-[11px] h-5 px-2">Quarterly</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-7 w-[88px] text-[11px] bg-slate-900/60 border-slate-700/60 text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[1500]">
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenPlan}
              className="h-7 text-[11px] text-sky-300 hover:text-sky-200 hover:bg-slate-800/60 gap-1"
            >
              <Pencil className="h-3 w-3" /> Edit plan
            </Button>
          </div>
        </div>

        {!hasPlan && !isLoading ? (
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
        ) : (
          <div className="p-3 space-y-3">
            {/* YTD summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile label="YTD Plan" value={ytdPlan} />
              <StatTile label="YTD Actual" value={ytdActual} valueClass="text-emerald-300" />
              <StatTile
                label="Variance"
                value={`${variance > 0 ? '+' : ''}${variance}`}
                valueClass={varianceColor}
                icon={<VarianceIcon className="h-3 w-3" />}
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
                  <Legend wrapperStyle={{ fontSize: 11 }} />
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
          </div>
        )}
      </div>

      <Sheet open={!!drillPeriod} onOpenChange={(o) => { if (!o) setDrillPeriod(null); }}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[640px] z-[1500] bg-slate-950 text-slate-100 border-slate-700/60 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-slate-100">
              Funding Sources — {drillPeriod?.label}
            </SheetTitle>
            <SheetDescription className="text-slate-400 text-[12px]">
              {drillPeriod?.lenders.length ?? 0} new funding source{(drillPeriod?.lenders.length ?? 0) === 1 ? '' : 's'} added in this period.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
            {!drillPeriod || drillPeriod.lenders.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-slate-500">No funding sources added</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-left text-slate-400 border-b border-slate-700/40">
                  <tr>
                    <th className="py-1.5">Name</th>
                    <th className="text-right">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {drillPeriod.lenders
                    .slice()
                    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
                    .map((l) => (
                      <tr key={l.id} className="border-t border-slate-700/40">
                        <td className="py-1.5 text-slate-100 truncate max-w-[360px]">{l.name || '—'}</td>
                        <td className="text-right text-slate-400 tabular-nums">
                          {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
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

function StatTile({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: number | string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-700/40 bg-slate-900/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-[18px] font-semibold tabular-nums flex items-center gap-1 ${valueClass ?? 'text-slate-100'}`}>
        {icon}
        {value}
      </div>
    </div>
  );
}