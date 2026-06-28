import * as React from 'react';
import { useSalesCallsCount } from '@/hooks/useSalesCallsCount';
import { useDealsOnBoardByMonth, type DealOnBoardEntry } from '@/hooks/useDealsOnBoardByMonth';
import {
  buildQuarterOptions,
  getCurrentQuarter,
  buildCustomPeriod,
  type QuarterOption,
} from '@/hooks/useQBQuarterlyRevenue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  BarChart3,
  Layers,
  FileText,
  Settings,
  Phone,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

/**
 * Sales Dashboard-V2 — faithful build of the 5th Line approved prototype.
 * Self-contained, derives all values from PLAN/ACTUAL arrays below.
 * Uses platform font (inherited), tabular-nums on all numeric values.
 */

// ============================================================
// DATA — Jan–Sep 2026 (actuals exist for Jan–Jun only)
// ============================================================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] as const;
const ELAPSED = 6;

// Calendar-month indexed (0=Jan ... 8=Sep) seeded data covers 2026 only.
const SEED_YEAR = 2026;
const SEED_MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

type MetricKey =
  | 'salesCalls'
  | 'dealsOnBoard'
  | 'dollarsOnBoard'
  | 'proposalsIssued'
  | 'dollarsProposed'
  | 'clientsSigned'
  | 'dollarsSigned'
  | 'clientsReceivingTerms'
  | 'termsSigned'
  | 'volumeOfTermsSigned'
  | 'dealsClosed'
  | 'dollarsFunded';

interface RowDef {
  key: MetricKey;
  label: string;
  type: 'count' | 'money';
  bold?: boolean;
}

const ROW_ORDER: RowDef[] = [
  { key: 'salesCalls', label: 'Sales Calls', type: 'count' },
  { key: 'dealsOnBoard', label: 'Deals on Board', type: 'count' },
  { key: 'dollarsOnBoard', label: 'Dollars on Board', type: 'money' },
  { key: 'proposalsIssued', label: 'Proposals Issued', type: 'count' },
  { key: 'dollarsProposed', label: 'Dollars Proposed', type: 'money' },
  { key: 'clientsSigned', label: 'Clients Signed', type: 'count' },
  { key: 'dollarsSigned', label: 'Dollars Signed', type: 'money' },
  { key: 'clientsReceivingTerms', label: 'Clients Receiving Terms', type: 'count' },
  { key: 'termsSigned', label: 'Terms Signed', type: 'count' },
  { key: 'volumeOfTermsSigned', label: 'Volume of Terms Signed', type: 'money' },
  { key: 'dealsClosed', label: 'Deals Closed', type: 'count' },
  { key: 'dollarsFunded', label: 'Dollars Funded', type: 'money', bold: true },
];

const PLAN: Record<MetricKey, number[]> = {
  salesCalls: [44, 46, 48, 48, 50, 50, 52, 52, 54],
  dealsOnBoard: [11, 11, 11, 11, 11, 11, 11, 11, 11],
  dollarsOnBoard: [30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3],
  proposalsIssued: [7, 7, 7, 7, 7, 7, 7, 7, 7],
  dollarsProposed: [20, 20, 20, 20, 20, 20, 20, 20, 20],
  clientsSigned: [1, 2, 2, 2, 2, 2, 2, 2, 2],
  dollarsSigned: [4.8, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 12.0, 12.0],
  clientsReceivingTerms: [2, 2, 2, 1, 2, 2, 2, 2, 2],
  termsSigned: [2, 2, 2, 2, 1, 2, 2, 2, 2],
  volumeOfTermsSigned: [6.4, 6.4, 6.4, 6.4, 3.5, 7.2, 8.0, 8.0, 8.0],
  dealsClosed: [2, 2, 2, 2, 2, 2, 2, 1, 2],
  dollarsFunded: [6.4, 6.4, 6.4, 6.4, 6.7, 7.2, 8.0, 4.8, 8.0],
};

const ACTUAL: Record<MetricKey, (number | null)[]> = {
  salesCalls: pad([]),
  dealsOnBoard: pad([9, 10, 11, 12, 11, 13]),
  dollarsOnBoard: pad([]),
  proposalsIssued: pad([6, 7, 8, 6, 7, 9]),
  dollarsProposed: pad([]),
  clientsSigned: pad([]),
  dollarsSigned: pad([4.2, 7.5, 8.4, 7.1, 8.8, 7.6]),
  clientsReceivingTerms: pad([]),
  termsSigned: pad([]),
  volumeOfTermsSigned: pad([]),
  dealsClosed: pad([1, 2, 2, 3, 1, 2]),
  dollarsFunded: pad([5.1, 6.8, 5.9, 7.0, 5.5, 6.9]),
};

function pad(actuals: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(9).fill(null);
  actuals.forEach((v, i) => (out[i] = v));
  return out;
}

// ============================================================
// FILTERED-VIEW CONTEXT
// All sub-components read months/plan/actual/elapsed from here so the
// quarter selector in the header drives the full dashboard.
// ============================================================
export interface DashboardView {
  months: string[];
  monthIndexes: number[]; // indexes into the seeded 9-month arrays
  plan: Record<MetricKey, number[]>;
  actual: Record<MetricKey, (number | null)[]>;
  elapsed: number; // number of months in `months` already elapsed (have actuals)
  rangeStart: Date;
  rangeEnd: Date;
  label: string;
}

const ViewCtx = React.createContext<DashboardView | null>(null);
function useView(): DashboardView {
  const v = React.useContext(ViewCtx);
  if (!v) throw new Error('Missing DashboardView');
  return v;
}

// ------------------------------------------------------------
// Drilldown context — any chart/KPI/cell can call open(metric, monthIdx?)
// to surface the underlying monthly composition.
// ------------------------------------------------------------
interface DrilldownFocus {
  metricKey: MetricKey;
  monthIndex?: number;
}
interface DrilldownApi {
  open: (metric: MetricKey, monthIndex?: number) => void;
}
const DrilldownCtx = React.createContext<DrilldownApi | null>(null);
function useDrilldown(): DrilldownApi {
  const v = React.useContext(DrilldownCtx);
  if (!v) throw new Error('Missing DrilldownCtx');
  return v;
}

function buildView(quarter: QuarterOption): DashboardView {
  // Determine which seeded month indexes fall inside the selected quarter.
  const indexes: number[] = [];
  const monthLabels: string[] = [];
  for (const m of quarter.months) {
    const [yStr, monStr] = m.key.split('-');
    const y = Number(yStr);
    const monIdx = Number(monStr) - 1; // 0-based
    if (y === SEED_YEAR && SEED_MONTH_INDEXES.includes(monIdx)) {
      indexes.push(monIdx);
      monthLabels.push(MONTHS[monIdx]);
    } else {
      // Month outside seeded window — keep label but no seeded data.
      indexes.push(-1);
      const d = new Date(y, monIdx, 1);
      monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    }
  }

  const slice = <T,>(arr: T[], fallback: T): T[] =>
    indexes.map((i) => (i >= 0 ? arr[i] : fallback));

  const plan = {} as Record<MetricKey, number[]>;
  const actual = {} as Record<MetricKey, (number | null)[]>;
  (Object.keys(PLAN) as MetricKey[]).forEach((k) => {
    plan[k] = slice(PLAN[k], 0);
    actual[k] = slice(ACTUAL[k], null);
  });

  // Elapsed = completed months plus the current month-to-date so live
  // calendar-backed actuals and drilldown rows reconcile to the event list.
  const today = new Date();
  let elapsed = 0;
  for (const m of quarter.months) {
    const start = new Date(m.start + 'T00:00:00');
    if (start <= today) elapsed += 1;
    else break;
  }
  // Clamp to at least 1 so charts render a current value
  if (elapsed < 1) elapsed = Math.min(1, quarter.months.length);

  return {
    months: monthLabels,
    monthIndexes: indexes,
    plan,
    actual,
    elapsed,
    rangeStart: new Date(quarter.startDate + 'T00:00:00Z'),
    rangeEnd: new Date(quarter.endDate + 'T23:59:59Z'),
    label: quarter.label,
  };
}

// ============================================================
// TOKENS
// ============================================================
const C = {
  bg: '#08080C',
  textPrimary: '#ECECF4',
  textMuted: '#8A8AA6',
  textFaint: '#5A5A72',
  periwinkle: '#9DA2F5',
  cyan: '#5EEAD4',
  violet: '#A78BFA',
  rose: '#FB7185',
  amber: '#FBBF24',
  surface: 'rgba(255,255,255,0.035)',
  surfaceBorder: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.06)',
};

const glassStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.surfaceBorder}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 16,
};

// ============================================================
// FORMATTERS
// ============================================================
function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${v.toFixed(1)}MM`;
}
function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}
function fmtRow(v: number | null | undefined, type: 'count' | 'money') {
  return type === 'money' ? fmtMoney(v) : fmtCount(v);
}
function fmtSignedMoney(v: number): string {
  const s = v >= 0 ? '+' : '−';
  return `${s}${Math.abs(v).toFixed(1)}MM`;
}
function fmtSignedCount(v: number): string {
  const s = v >= 0 ? '+' : '−';
  return `${s}${Math.abs(Math.round(v)).toLocaleString()}`;
}
function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
function sum(arr: (number | null)[], end?: number): number {
  const slice = end !== undefined ? arr.slice(0, end) : arr;
  return slice.reduce((a: number, b) => a + (b ?? 0), 0);
}
function cumulative(arr: (number | null)[]): (number | null)[] {
  let s = 0;
  return arr.map((v) => {
    if (v === null || v === undefined) return null;
    s += v;
    return s;
  });
}
function cumulativePlan(arr: number[]): number[] {
  let s = 0;
  return arr.map((v) => (s += v));
}

// ============================================================
// SMALL COMPONENTS
// ============================================================
function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ borderRadius: 'inherit' }}
    >
      <div
        style={{
          position: 'absolute',
          top: -200,
          left: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(157,162,245,0.10) 0%, transparent 60%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -180,
          right: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(94,234,212,0.07) 0%, transparent 60%)',
        }}
      />
    </div>
  );
}

function ConcentricLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="12" stroke={C.periwinkle} strokeWidth="1" strokeDasharray="1.5 3" />
      <circle cx="14" cy="14" r="8" stroke={C.cyan} strokeWidth="1" strokeDasharray="1.5 3" />
      <circle cx="14" cy="14" r="4" stroke={C.cyan} strokeWidth="1" strokeDasharray="1.5 3" />
      <circle cx="14" cy="14" r="1.6" fill={C.cyan} />
    </svg>
  );
}

function NavRail() {
  const items = [LayoutGrid, BarChart3, Layers, FileText, Settings];
  return (
    <div
      className="hidden md:flex flex-col items-center gap-3 py-5 shrink-0"
      style={{
        width: 62,
        borderRight: `1px solid ${C.surfaceBorder}`,
      }}
    >
      <div className="mb-2">
        <ConcentricLogo />
      </div>
      {items.map((Icon, i) => {
        const active = i === 0;
        return (
          <button
            key={i}
            tabIndex={0}
            className="flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2"
            style={{
              width: 36,
              height: 36,
              background: active ? 'rgba(157,162,245,0.14)' : 'transparent',
              border: active ? `1px solid ${C.periwinkle}` : '1px solid transparent',
              color: active ? C.periwinkle : C.textFaint,
            }}
            aria-label={`nav-${i}`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// KPI CARD
// ============================================================
function KpiCard({
  label,
  Icon,
  type,
  metricKey,
  mode,
}: {
  label: string;
  Icon: LucideIcon;
  type: 'count' | 'money';
  metricKey: MetricKey;
  mode: 'sum' | 'current';
}) {
  const view = useView();
  const drill = useDrilldown();
  const planArr = view.plan[metricKey];
  const actualArr = view.actual[metricKey];
  const E = view.elapsed;
  const currentActual = actualArr[E - 1] ?? 0;
  const currentPlan = planArr[E - 1] ?? 0;
  const deltaPct = currentPlan === 0 ? 0 : (currentActual - currentPlan) / currentPlan;
  const positive = deltaPct >= 0;

  // sub-line uses comparison mode
  const compareActual = mode === 'sum' ? sum(actualArr, E) : currentActual;
  const comparePlan = mode === 'sum' ? planArr.slice(0, E).reduce((a, b) => a + b, 0) : currentPlan;
  const gap = compareActual - comparePlan;

  const sparkData = view.months.map((m, i) => ({
    month: m,
    plan: planArr[i],
    actual: actualArr[i],
  }));

  return (
    <button
      type="button"
      onClick={() => drill.open(metricKey)}
      style={glassStyle}
      className="relative p-4 flex flex-col gap-2 overflow-hidden text-left cursor-pointer transition-transform hover:-translate-y-[1px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
      aria-label={`Drill into ${label}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 28,
            height: 28,
            background: 'rgba(157,162,245,0.14)',
            color: C.periwinkle,
          }}
        >
          <Icon size={14} />
        </div>
        <div
          className="text-[10px] font-medium uppercase"
          style={{ color: C.textMuted, letterSpacing: '0.08em' }}
        >
          {label}
        </div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <div
          className="text-3xl font-semibold leading-none"
          style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}
        >
          {type === 'money' ? fmtMoney(currentActual) : fmtCount(currentActual)}
        </div>
        <div
          className="flex items-center gap-0.5 text-xs font-medium"
          style={{ color: positive ? C.cyan : C.rose, fontVariantNumeric: 'tabular-nums' }}
        >
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {positive ? '+' : '−'}
          {Math.abs(Math.round(deltaPct * 100))}%
        </div>
      </div>
      <div className="text-[11px]" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
        vs plan {type === 'money' ? fmtMoney(comparePlan) : fmtCount(comparePlan)} ·{' '}
        <span style={{ color: gap >= 0 ? C.cyan : C.rose }}>
          {type === 'money' ? fmtSignedMoney(gap) : fmtSignedCount(gap)}
        </span>
      </div>
      <div style={{ height: 44 }} className="mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey="plan"
              stroke={C.periwinkle}
              strokeWidth={1.2}
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={C.cyan}
              strokeWidth={1.6}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

// ============================================================
// PERFORMANCE-TO-PLAN PANEL
// ============================================================
function statusColor(att: number): string {
  if (att >= 1) return C.cyan;
  if (att >= 0.95) return C.amber;
  return C.rose;
}

function PerformancePanel() {
  const view = useView();
  const drill = useDrilldown();
  const E = view.elapsed;
  const planYtd = view.plan.dollarsFunded.slice(0, E).reduce((a, b) => a + b, 0);
  const actualYtd = sum(view.actual.dollarsFunded, E);
  const attainment = planYtd === 0 ? 0 : actualYtd / planYtd;
  const gap = actualYtd - planYtd;

  // Drivers
  type Driver = {
    label: string;
    note?: string;
    actual: number;
    plan: number;
    type: 'count' | 'money';
    metricKey: MetricKey;
  };
  const drivers: Driver[] = [
    { label: 'Sales Calls', metricKey: 'salesCalls', actual: sum(view.actual.salesCalls, E), plan: view.plan.salesCalls.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'Proposals Issued', metricKey: 'proposalsIssued', actual: sum(view.actual.proposalsIssued, E), plan: view.plan.proposalsIssued.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'Deals on Board', metricKey: 'dealsOnBoard', note: '· current', actual: view.actual.dealsOnBoard[E - 1] ?? 0, plan: view.plan.dealsOnBoard[E - 1] ?? 0, type: 'count' },
    { label: 'Dollars Signed', metricKey: 'dollarsSigned', actual: sum(view.actual.dollarsSigned, E), plan: view.plan.dollarsSigned.slice(0, E).reduce((a, b) => a + b, 0), type: 'money' },
    { label: 'Deals Closed', metricKey: 'dealsClosed', actual: sum(view.actual.dealsClosed, E), plan: view.plan.dealsClosed.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'Dollars Funded', metricKey: 'dollarsFunded', actual: actualYtd, plan: planYtd, type: 'money' },
  ];

  const actualWidthPct = planYtd === 0 ? 0 : Math.max(0, Math.min(100, (actualYtd / planYtd) * 100));

  return (
    <div style={glassStyle} className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] overflow-hidden">
      {/* LEFT */}
      <div className="p-5 lg:border-r" style={{ borderColor: C.surfaceBorder }}>
        <div
          className="flex items-center gap-1.5 text-[10px] font-medium uppercase mb-3"
          style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
        >
          <Target size={11} />
          Performance to Plan · Dollars Funded YTD
        </div>
        <div className="flex items-end gap-3">
          <div
            className="text-5xl font-semibold leading-none"
            style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtPct(attainment)}
          </div>
          <div
            className="text-[11px] px-2 py-1 rounded-md"
            style={{
              color: gap >= 0 ? C.cyan : C.rose,
              background: gap >= 0 ? 'rgba(94,234,212,0.10)' : 'rgba(251,113,133,0.10)',
              border: `1px solid ${gap >= 0 ? 'rgba(94,234,212,0.25)' : 'rgba(251,113,133,0.25)'}`,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtSignedMoney(gap)} to plan
          </div>
        </div>

        {/* Bridge */}
        <div className="mt-6 space-y-3">
          {/* Plan bar */}
          <BridgeBar
            label="Plan"
            value={fmtMoney(planYtd)}
            widthPct={100}
            fill={`repeating-linear-gradient(135deg, rgba(157,162,245,0.45) 0 6px, rgba(157,162,245,0.18) 6px 12px)`}
            valueColor={C.periwinkle}
          />
          {/* Actual bar */}
          <BridgeBar
            label="Actual"
            value={fmtMoney(actualYtd)}
            widthPct={actualWidthPct}
            fill={`linear-gradient(90deg, rgba(94,234,212,0.85), rgba(94,234,212,0.55))`}
            valueColor={C.cyan}
          />
        </div>

        {/* Gap callout */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-px flex-1"
            style={{
              backgroundImage: `linear-gradient(to right, ${C.rose} 50%, transparent 50%)`,
              backgroundSize: '6px 1px',
              backgroundRepeat: 'repeat-x',
              opacity: 0.55,
            }}
          />
          <div className="text-[11px]" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: C.rose }}>Gap {fmtSignedMoney(gap)}</span>
            <span> · {Math.round(Math.abs(1 - attainment) * 100)}% short of pace through {view.months[E - 1] ?? ''}</span>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="p-5">
        <div
          className="text-[10px] font-medium uppercase mb-3"
          style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
        >
          Gap to Plan · By Driver
        </div>
        <div className="flex flex-col">
          {drivers.map((d, idx) => {
            const att = d.actual / d.plan;
            const color = statusColor(att);
            return (
              <button
                type="button"
                key={d.label}
                onClick={() => drill.open(d.metricKey)}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 text-left w-full cursor-pointer hover:bg-white/[0.03] rounded-md px-2 -mx-2 focus-visible:outline-none focus-visible:ring-1"
                style={{
                  borderTop: idx === 0 ? 'none' : `1px solid ${C.hairline}`,
                }}
              >
                <div className="text-[12px]" style={{ color: C.textPrimary }}>
                  {d.label}
                  {d.note && <span className="ml-1" style={{ color: C.textFaint }}>{d.note}</span>}
                </div>
                <div className="text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: C.textPrimary }}>
                    {d.type === 'money' ? `$${d.actual.toFixed(1)}` : Math.round(d.actual)}
                  </span>
                  <span style={{ color: C.textFaint }}>
                    {' / '}
                    {d.type === 'money' ? `$${d.plan.toFixed(1)}` : Math.round(d.plan)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 min-w-[48px] justify-end">
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: 'inline-block' }} />
                  <span
                    className="text-[12px] font-medium"
                    style={{ color, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtPct(att)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BridgeBar({
  label,
  value,
  widthPct,
  fill,
  valueColor,
}: {
  label: string;
  value: string;
  widthPct: number;
  fill: string;
  valueColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px]" style={{ color: C.textMuted }}>
          {label}
        </div>
        <div
          className="text-[12px] font-medium"
          style={{ color: valueColor, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </div>
      </div>
      <div
        className="relative w-full"
        style={{
          height: 10,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${widthPct}%`,
            height: '100%',
            background: fill,
            borderRadius: 4,
            transition: 'width 400ms ease',
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// CUMULATIVE PACE CHART
// ============================================================
function CumulativePace() {
  const view = useView();
  const drill = useDrilldown();
  const E = view.elapsed;
  const planCum = cumulativePlan(view.plan.dollarsFunded);
  const actualCum = cumulative(view.actual.dollarsFunded);
  const data = view.months.map((m, i) => ({
    month: m,
    plan: planCum[i],
    actual: actualCum[i],
  }));
  const actualToDate = actualCum[E - 1] ?? 0;
  const planToDate = planCum[E - 1] ?? 0;
  const fyTarget = planCum[planCum.length - 1] ?? 0;

  return (
    <div style={glassStyle} className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: C.periwinkle }} />
          <div className="text-sm font-semibold" style={{ color: C.textPrimary }}>
            Cumulative pace
          </div>
          <div className="text-[11px]" style={{ color: C.textFaint }}>
            Dollars Funded · running total
          </div>
          <button
            type="button"
            onClick={() => drill.open('dollarsFunded')}
            className="ml-2 text-[10px] px-2 py-0.5 rounded-md hover:brightness-125 focus-visible:outline-none focus-visible:ring-1"
            style={{ background: 'rgba(157,162,245,0.10)', color: C.periwinkle, border: `1px solid ${C.surfaceBorder}` }}
          >
            Drill in
          </button>
        </div>
        <div className="flex items-center gap-5 text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Readout label="ACTUAL TO DATE" value={fmtMoney(actualToDate)} color={C.cyan} />
          <Readout label="PLAN TO DATE" value={fmtMoney(planToDate)} color={C.periwinkle} />
          <Readout label="FY TARGET" value={fmtMoney(fyTarget)} color={C.textMuted} />
        </div>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cyan} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.cyan} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.hairline} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={{ stroke: C.hairline }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${Math.round(v)}`}
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(8,8,12,0.95)',
                border: `1px solid ${C.surfaceBorder}`,
                borderRadius: 8,
                color: C.textPrimary,
                fontSize: 12,
              }}
              formatter={(v: number, n: string) => [`$${v.toFixed(1)}MM`, n === 'plan' ? 'Plan' : 'Actual']}
            />
            <ReferenceLine
              x={view.months[E - 1] ?? ''}
              stroke={C.textFaint}
              strokeDasharray="3 3"
              label={{ value: 'today', position: 'top', fill: C.textFaint, fontSize: 10 }}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke={C.cyan}
              strokeWidth={2}
              fill="url(#actualGrad)"
              dot={{ r: 2.5, fill: C.cyan, stroke: C.cyan }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="plan"
              stroke={C.periwinkle}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <div className="text-[9px] uppercase" style={{ color: C.textFaint, letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className="text-sm font-semibold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// KEY-STAT LINE CARDS
// ============================================================
function KeyStatCard({
  title,
  metricKey,
}: {
  title: string;
  metricKey: MetricKey;
}) {
  const view = useView();
  const drill = useDrilldown();
  const planArr = view.plan[metricKey];
  const actualArr = view.actual[metricKey];
  const data = view.months.map((m, i) => ({
    month: m,
    plan: planArr[i],
    actual: actualArr[i],
  }));
  return (
    <div style={glassStyle} className="p-4">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => drill.open(metricKey)}
          className="text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-1 rounded text-left"
          style={{ color: C.textPrimary }}
        >
          {title}
        </button>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: C.textMuted }}>
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 0, borderTop: `1.5px dashed ${C.periwinkle}`, display: 'inline-block' }} />
            Plan
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 2, background: C.cyan, display: 'inline-block', borderRadius: 1 }} />
            Actual
          </span>
        </div>
      </div>
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.hairline} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: C.textFaint, fontSize: 10 }}
              axisLine={{ stroke: C.hairline }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: C.textFaint, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(8,8,12,0.95)',
                border: `1px solid ${C.surfaceBorder}`,
                borderRadius: 8,
                color: C.textPrimary,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="plan"
              stroke={C.periwinkle}
              strokeWidth={1.4}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={C.cyan}
              strokeWidth={2}
              dot={{ r: 2.5, fill: C.cyan }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// SALES MODEL SHEET
// ============================================================
type SheetTab = 'Forecast' | 'Actuals' | 'Variance';

function SalesModelSheet() {
  const [tab, setTab] = React.useState<SheetTab>('Forecast');
  const view = useView();
  const drill = useDrilldown();
  const E = view.elapsed;

  const renderCell = (row: RowDef, i: number): React.ReactNode => {
    const planV = view.plan[row.key][i];
    const actualV = view.actual[row.key][i];
    if (tab === 'Forecast') {
      return (
        <span style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
          {fmtRow(planV, row.type)}
        </span>
      );
    }
    if (tab === 'Actuals') {
      if (actualV === null || actualV === undefined) {
        return <span style={{ color: C.textFaint }}>—</span>;
      }
      return (
        <span style={{ color: C.cyan, fontVariantNumeric: 'tabular-nums' }}>
          {fmtRow(actualV, row.type)}
        </span>
      );
    }
    // Variance
    if (actualV === null || actualV === undefined) {
      return <span style={{ color: C.textFaint }}>—</span>;
    }
    const v = actualV - planV;
    const color = v >= 0 ? C.cyan : C.rose;
    const formatted = row.type === 'money' ? fmtSignedMoney(v) : fmtSignedCount(v);
    return (
      <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{formatted}</span>
    );
  };

  return (
    <div style={glassStyle} className="p-5 overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} style={{ color: C.periwinkle }} />
          <div className="text-sm font-semibold" style={{ color: C.textPrimary }}>
            Sales Model
          </div>
          <div className="text-[11px]" style={{ color: C.textFaint }}>
            Monthly Forecast · {view.label}
          </div>
        </div>
        <div
          className="inline-flex p-0.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.surfaceBorder}` }}
          role="tablist"
        >
          {(['Forecast', 'Actuals', 'Variance'] as SheetTab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                className="px-3 py-1 text-[11px] font-medium rounded-md focus-visible:outline-none focus-visible:ring-2 transition-colors"
                style={{
                  color: active ? C.periwinkle : C.textMuted,
                  background: active ? 'rgba(157,162,245,0.14)' : 'transparent',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto sales-model-scroll">
        <table
          className="border-collapse"
          style={{
            width: '100%',
            minWidth: 880,
            fontSize: 12,
            color: C.textPrimary,
          }}
        >
          <thead>
            <tr>
              <th
                className="text-left px-3 py-2 sticky left-0 z-10"
                style={{
                  background: 'rgba(12,12,18,0.95)',
                  color: C.textMuted,
                  fontWeight: 500,
                  borderBottom: `1px solid ${C.hairline}`,
                  minWidth: 220,
                }}
              >
                Metric
              </th>
              {view.months.map((m, i) => {
                const isFuture = i >= E;
                return (
                  <th
                    key={m}
                    className="text-right px-3 py-2"
                    style={{
                      color: C.textMuted,
                      fontWeight: 500,
                      borderBottom: `1px solid ${C.hairline}`,
                      background: isFuture ? 'rgba(157,162,245,0.04)' : 'transparent',
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 70,
                    }}
                  >
                    {m}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROW_ORDER.map((row, rIdx) => (
              <tr
                key={row.key}
                style={{ background: rIdx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
              >
                <td
                  className="px-3 py-2 sticky left-0 z-10"
                  style={{
                    background: rIdx % 2 === 1 ? 'rgba(12,12,18,0.97)' : 'rgba(12,12,18,0.95)',
                    color: C.textPrimary,
                    fontWeight: row.bold ? 600 : 400,
                    borderBottom: `1px solid ${C.hairline}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => drill.open(row.key)}
                    className="hover:underline focus-visible:outline-none focus-visible:ring-1 rounded"
                    style={{ color: 'inherit', fontWeight: 'inherit' }}
                  >
                    {row.label}
                  </button>
                  {row.type === 'money' && (
                    <span className="ml-1 text-[10px]" style={{ color: C.textFaint }}>
                      $MM
                    </span>
                  )}
                </td>
                {view.months.map((m, i) => {
                  const isFuture = i >= E;
                  return (
                    <td
                      key={m}
                      className="px-3 py-2 text-right cursor-pointer hover:bg-white/[0.04]"
                      onClick={() => drill.open(row.key, i)}
                      style={{
                        borderBottom: `1px solid ${C.hairline}`,
                        background: isFuture ? 'rgba(157,162,245,0.04)' : 'transparent',
                      }}
                    >
                      {renderCell(row, i)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px]" style={{ color: C.textMuted }}>
        {E > 0 && (
          <>
            <span style={{ color: C.cyan }}>
              {view.months[0]}–{view.months[E - 1]} actuals tracked
            </span>
            {E < view.months.length && <span> · </span>}
          </>
        )}
        {E < view.months.length && (
          <span style={{ color: C.periwinkle }}>
            {view.months[E]}–{view.months[view.months.length - 1]} forecast
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// METRIC DRILLDOWN DIALOG
// ============================================================
interface SalesCallEvent {
  title?: string;
  start?: string;
  end?: string;
  organizer?: string;
  attendees?: unknown;
  calendar_owner?: string;
  ical_uid?: string | null;
}

function MetricDrilldownDialog({
  focus,
  onClose,
  view,
  salesCallEvents,
  salesCallsLoading,
  salesCallsError,
  dealsOnBoard,
  dealsOnBoardLoading,
  dealsOnBoardError,
}: {
  focus: DrilldownFocus | null;
  onClose: () => void;
  view: DashboardView;
  salesCallEvents: SalesCallEvent[];
  salesCallsLoading?: boolean;
  salesCallsError?: Error | null;
  dealsOnBoard: DealOnBoardEntry[];
  dealsOnBoardLoading?: boolean;
  dealsOnBoardError?: Error | null;
}) {
  if (!focus) return null;
  const row = ROW_ORDER.find((r) => r.key === focus.metricKey);
  if (!row) return null;

  const planArr = view.plan[row.key];
  const actualArr = view.actual[row.key];
  const E = view.elapsed;

  const totalActual = actualArr.slice(0, E).reduce<number>((a, b) => a + (b ?? 0), 0);
  const totalPlan = planArr.slice(0, E).reduce((a, b) => a + b, 0);
  const variance = totalActual - totalPlan;
  const attainment = totalPlan === 0 ? 0 : totalActual / totalPlan;

  // Optional: list of underlying sales-call events for the focused month/period
  const showCallEvents = row.key === 'salesCalls';
  let eventsInPeriod: SalesCallEvent[] = [];
  if (showCallEvents) {
    const start = view.rangeStart;
    const end = view.rangeEnd;
    eventsInPeriod = salesCallEvents.filter((ev) => {
      if (!ev.start) return false;
      const d = new Date(ev.start);
      return d >= start && d <= end;
    });
    if (focus.monthIndex !== undefined && focus.monthIndex >= 0) {
      const idx = view.monthIndexes[focus.monthIndex];
      if (idx >= 0) {
        eventsInPeriod = eventsInPeriod.filter((ev) => {
          if (!ev.start) return false;
          const d = new Date(ev.start);
          return d.getUTCFullYear() === SEED_YEAR && d.getUTCMonth() === idx;
        });
      }
    }
    eventsInPeriod = eventsInPeriod.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  }

  // Optional: list of underlying Deals on Board for the focused month/period
  const showDealsOnBoard = row.key === 'dealsOnBoard';
  let dealsInPeriod: DealOnBoardEntry[] = [];
  if (showDealsOnBoard) {
    const start = view.rangeStart;
    const end = view.rangeEnd;
    dealsInPeriod = dealsOnBoard.filter((d) => {
      const c = new Date(d.created_at);
      return c >= start && c <= end;
    });
    if (focus.monthIndex !== undefined && focus.monthIndex >= 0) {
      const idx = view.monthIndexes[focus.monthIndex];
      if (idx >= 0) {
        dealsInPeriod = dealsInPeriod.filter((d) => {
          const c = new Date(d.created_at);
          return c.getUTCFullYear() === SEED_YEAR && c.getUTCMonth() === idx;
        });
      }
    }
    dealsInPeriod = dealsInPeriod.sort((a, b) =>
      (a.created_at ?? '').localeCompare(b.created_at ?? ''),
    );
  }

  const focusedMonthLabel =
    focus.monthIndex !== undefined ? view.months[focus.monthIndex] : null;

  return (
    <Dialog open={!!focus} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl"
        style={{
          background: 'rgba(12,12,18,0.98)',
          border: `1px solid ${C.surfaceBorder}`,
          color: C.textPrimary,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: C.textPrimary }}>
            {row.label}
            {focusedMonthLabel && (
              <span className="ml-2 text-xs font-normal" style={{ color: C.textMuted }}>
                · {focusedMonthLabel}
              </span>
            )}
          </DialogTitle>
          <DialogDescription style={{ color: C.textMuted }}>
            {view.label} · breakdown of the underlying data
          </DialogDescription>
        </DialogHeader>

        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-3 mt-2">
          <SummaryTile label="Actual" value={fmtRow(totalActual, row.type)} color={C.cyan} />
          <SummaryTile label="Plan" value={fmtRow(totalPlan, row.type)} color={C.periwinkle} />
          <SummaryTile
            label="Variance"
            value={row.type === 'money' ? fmtSignedMoney(variance) : fmtSignedCount(variance)}
            color={variance >= 0 ? C.cyan : C.rose}
          />
          <SummaryTile label="Attainment" value={fmtPct(attainment)} color={statusColor(attainment)} />
        </div>

        {/* Monthly breakdown */}
        <div className="mt-4 overflow-x-auto sales-model-scroll">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: C.textMuted, fontSize: 11 }}>
                <th className="text-left px-3 py-2">Month</th>
                <th className="text-right px-3 py-2">Plan</th>
                <th className="text-right px-3 py-2">Actual</th>
                <th className="text-right px-3 py-2">Variance</th>
                <th className="text-right px-3 py-2">Attainment</th>
              </tr>
            </thead>
            <tbody>
              {view.months.map((m, i) => {
                const p = planArr[i] ?? 0;
                const a = actualArr[i];
                const v = a === null || a === undefined ? null : a - p;
                const att = a === null || a === undefined || p === 0 ? null : a / p;
                const isFocused = focus.monthIndex === i;
                const isFuture = i >= E;
                return (
                  <tr
                    key={m}
                    style={{
                      borderTop: `1px solid ${C.hairline}`,
                      background: isFocused ? 'rgba(157,162,245,0.10)' : 'transparent',
                      fontVariantNumeric: 'tabular-nums',
                      color: isFuture ? C.textMuted : C.textPrimary,
                    }}
                  >
                    <td className="px-3 py-2">{m}</td>
                    <td className="text-right px-3 py-2">{fmtRow(p, row.type)}</td>
                    <td className="text-right px-3 py-2" style={{ color: a == null ? C.textFaint : C.cyan }}>
                      {a == null ? '—' : fmtRow(a, row.type)}
                    </td>
                    <td
                      className="text-right px-3 py-2"
                      style={{ color: v == null ? C.textFaint : v >= 0 ? C.cyan : C.rose }}
                    >
                      {v == null
                        ? '—'
                        : row.type === 'money'
                          ? fmtSignedMoney(v)
                          : fmtSignedCount(v)}
                    </td>
                    <td
                      className="text-right px-3 py-2"
                      style={{ color: att == null ? C.textFaint : statusColor(att) }}
                    >
                      {att == null ? '—' : fmtPct(att)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sales-call event list (live data) */}
        {showCallEvents && (
          <div className="mt-5">
            <div
              className="text-[10px] font-medium uppercase mb-2"
              style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
            >
              Qualifying calendar events ({eventsInPeriod.length})
            </div>
            <div
              className="max-h-64 overflow-y-auto rounded-md"
              style={{ border: `1px solid ${C.surfaceBorder}` }}
            >
              {eventsInPeriod.length === 0 ? (
                <div className="px-3 py-4 text-xs" style={{ color: C.textMuted }}>
                  {salesCallsLoading
                    ? 'Loading qualifying calendar events…'
                    : salesCallsError
                      ? 'Could not load qualifying calendar events. The metric is unavailable until the calendar scan succeeds.'
                      : 'No qualifying "[Company] <> 5th Line Financing Review" events in this period.'}
                </div>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: C.textMuted, fontSize: 10 }}>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider">Call Title</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-32">Date</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-56">5th Line Attendees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsInPeriod.map((ev, i) => {
                      const d = ev.start ? new Date(ev.start) : null;
                      const when = d
                        ? d.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—';
                      const attendeeNames =
                        ((ev.attendees ?? []) as { email: string | null; name: string | null }[])
                          .map((a) => a.name || (a.email ? a.email.split('@')[0] : null))
                          .filter((n): n is string => !!n)
                          .join(', ') || '—';
                      return (
                        <tr
                          key={`${ev.ical_uid ?? i}-${ev.start ?? i}`}
                          style={{ borderTop: `1px solid ${C.hairline}`, color: C.textPrimary }}
                        >
                          <td className="px-3 py-2 font-medium">{ev.title ?? '(untitled)'}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: C.textMuted }}>{when}</td>
                          <td className="px-3 py-2" style={{ color: C.textMuted }}>{attendeeNames}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Deals on Board list (live data) */}
        {showDealsOnBoard && (
          <div className="mt-5">
            <div
              className="text-[10px] font-medium uppercase mb-2"
              style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
            >
              Deals counted ({dealsInPeriod.length})
            </div>
            <div
              className="max-h-64 overflow-y-auto rounded-md"
              style={{ border: `1px solid ${C.surfaceBorder}` }}
            >
              {dealsInPeriod.length === 0 ? (
                <div className="px-3 py-4 text-xs" style={{ color: C.textMuted }}>
                  {dealsOnBoardLoading
                    ? 'Loading deals…'
                    : dealsOnBoardError
                      ? 'Could not load deals from the Active Pipeline.'
                      : 'No deals added to the Active Pipeline in this period.'}
                </div>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: C.textMuted, fontSize: 10 }}>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider">Deal</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-32">Added</th>
                      <th className="text-right px-3 py-2 font-medium uppercase tracking-wider w-32">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealsInPeriod.map((d) => {
                      const when = new Date(d.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                      const v = d.value
                        ? `$${(d.value / 1_000_000).toFixed(1)}MM`
                        : '—';
                      return (
                        <tr
                          key={d.id}
                          style={{ borderTop: `1px solid ${C.hairline}`, color: C.textPrimary }}
                        >
                          <td className="px-3 py-2 font-medium">{d.company}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: C.textMuted }}>{when}</td>
                          <td className="px-3 py-2 text-right" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="p-3 rounded-md"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${C.surfaceBorder}`,
      }}
    >
      <div
        className="text-[9px] uppercase mb-1"
        style={{ color: C.textFaint, letterSpacing: '0.08em' }}
      >
        {label}
      </div>
      <div
        className="text-base font-semibold"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================
export function SalesDashboardV2() {
  // Timeframe selector — Month / Quarter / Half / Year.
  // Drives every chart, KPI, and the Sales Model sheet.
  type Granularity = 'month' | 'quarter' | 'half' | 'year';
  const periodOptionsByGranularity = React.useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    // Months — last 12 (oldest → newest reversed to newest-first)
    const months: QuarterOption[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(y, m - i, 1);
      const opt = buildCustomPeriod(d, d);
      opt.label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      opt.value = `month-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(opt);
    }

    // Quarters — last 8
    const quarters = buildQuarterOptions(8);

    // Halves — last 4
    const halves: QuarterOption[] = [];
    const currentHalf = m < 6 ? 1 : 2;
    for (let i = 0; i < 4; i++) {
      let h = currentHalf - i;
      let yr = y;
      while (h <= 0) {
        h += 2;
        yr -= 1;
      }
      const startMonth = h === 1 ? 0 : 6;
      const start = new Date(yr, startMonth, 1);
      const end = new Date(yr, startMonth + 6, 0);
      const opt = buildCustomPeriod(start, end);
      opt.label = `H${h} ${yr}`;
      opt.value = `half-${yr}-H${h}`;
      halves.push(opt);
    }

    // Years — last 3
    const years: QuarterOption[] = [];
    for (let i = 0; i < 3; i++) {
      const yr = y - i;
      const start = new Date(yr, 0, 1);
      const end = new Date(yr, 11, 31);
      const opt = buildCustomPeriod(start, end);
      opt.label = `${yr}`;
      opt.value = `year-${yr}`;
      years.push(opt);
    }

    return { month: months, quarter: quarters, half: halves, year: years } as Record<
      Granularity,
      QuarterOption[]
    >;
  }, []);

  const [granularity, setGranularity] = React.useState<Granularity>('quarter');
  const [periodValue, setPeriodValue] = React.useState<string>(
    () => getCurrentQuarter().value,
  );

  const periodOptions = periodOptionsByGranularity[granularity];
  const selectedQuarter: QuarterOption = React.useMemo(
    () => periodOptions.find((p) => p.value === periodValue) ?? periodOptions[0],
    [periodOptions, periodValue],
  );

  const handleGranularityChange = (g: Granularity) => {
    setGranularity(g);
    // Default to the most recent period for the new granularity.
    const next = periodOptionsByGranularity[g][0];
    if (next) setPeriodValue(next.value);
  };

  // Live Sales Calls — fetch for the full seeded year so the per-month
  // overwrite below picks up any month that maps into the active quarter.
  const YEAR = 2026;
  const yearStart = React.useMemo(() => new Date(Date.UTC(YEAR, 0, 1)), []);
  const yearEnd = React.useMemo(() => new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59)), []);
  const salesCallsQuery = useSalesCallsCount(yearStart, yearEnd);
  const salesCallEvents = salesCallsQuery.data?.events ?? [];
  const liveSalesCallsActual = React.useMemo<(number | null)[]>(() => {
    if (salesCallsQuery.isLoading || salesCallsQuery.isFetching) {
      return new Array(9).fill(null);
    }
    const buckets: (number | null)[] = new Array(9).fill(null);
    for (let i = 0; i < buckets.length; i += 1) buckets[i] = 0;
    for (const ev of salesCallEvents) {
      if (!ev.start) continue;
      const d = new Date(ev.start);
      if (d.getUTCFullYear() !== YEAR) continue;
      const m = d.getUTCMonth();
      if (m >= 9) continue; // dashboard covers Jan–Sep only
      buckets[m] = (buckets[m] ?? 0) + 1;
    }
    return buckets;
  }, [salesCallsQuery.isFetching, salesCallsQuery.isLoading, salesCallEvents]);

  const baseView = React.useMemo(() => buildView(selectedQuarter), [selectedQuarter]);
  const view = React.useMemo<DashboardView>(() => ({
    ...baseView,
    actual: {
      ...baseView.actual,
      salesCalls: baseView.monthIndexes.map((idx) => (idx >= 0 ? liveSalesCallsActual[idx] : null)),
    },
  }), [baseView, liveSalesCallsActual]);

  // Drilldown state
  const [drillFocus, setDrillFocus] = React.useState<DrilldownFocus | null>(null);
  const drillApi = React.useMemo<DrilldownApi>(
    () => ({ open: (metricKey, monthIndex) => setDrillFocus({ metricKey, monthIndex }) }),
    [],
  );

  return (
    <ViewCtx.Provider value={view}>
    <DrilldownCtx.Provider value={drillApi}>
    <div
      className="sales-dashboard-v2 relative w-full"
      style={{
        background: C.bg,
        color: C.textPrimary,
        borderRadius: 16,
        overflow: 'hidden',
        minHeight: 600,
      }}
    >
      <style>{`
        .sales-dashboard-v2 .sales-model-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .sales-dashboard-v2 .sales-model-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12); border-radius: 4px;
        }
        .sales-dashboard-v2 .sales-model-scroll::-webkit-scrollbar-track { background: transparent; }
        @media (prefers-reduced-motion: reduce) {
          .sales-dashboard-v2 * { transition: none !important; animation: none !important; }
        }
      `}</style>
      <AmbientGlow />
      <div className="relative flex">
        {/* NavRail removed per request */}
        <div className="flex-1 min-w-0" style={{ padding: '22px 26px', maxWidth: 1240, margin: '0 auto' }}>
          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
            <div>
              <div
                className="text-[10px] font-medium uppercase mb-1"
                style={{ color: C.periwinkle, letterSpacing: '0.12em' }}
              >
                5th Line · Sales Console
              </div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: C.textPrimary }}>
                Pipeline Performance
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={granularity}
                onValueChange={(v) => handleGranularityChange(v as Granularity)}
              >
                <SelectTrigger
                  className="w-[120px] h-9 rounded-full"
                  style={{
                    ...glassStyle,
                    borderRadius: 999,
                    color: C.textPrimary,
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="half">Half-Year</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedQuarter.value} onValueChange={setPeriodValue}>
                <SelectTrigger
                  className="w-[180px] h-9 rounded-full"
                  style={{
                    ...glassStyle,
                    borderRadius: 999,
                    color: C.textPrimary,
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KpiCard
              label="Sales Calls"
              Icon={Phone}
              type="count"
              metricKey="salesCalls"
              mode="sum"
            />
            <KpiCard
              label="Deals on Board"
              Icon={Layers}
              type="count"
              metricKey="dealsOnBoard"
              mode="current"
            />
            <KpiCard
              label="Proposals Issued"
              Icon={FileText}
              type="count"
              metricKey="proposalsIssued"
              mode="sum"
            />
          </div>

          {/* Performance-to-plan panel */}
          <div className="mb-6">
            <PerformancePanel />
          </div>

          {/* Cumulative pace */}
          <div className="mb-6 sales-model-scroll overflow-x-auto">
            <div style={{ minWidth: 600 }}>
              <CumulativePace />
            </div>
          </div>

          {/* Key-stat line charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KeyStatCard title="Sales Calls" metricKey="salesCalls" />
            <KeyStatCard title="Deals on Board" metricKey="dealsOnBoard" />
            <KeyStatCard title="Proposals Issued" metricKey="proposalsIssued" />
          </div>

          {/* Sales model sheet */}
          <SalesModelSheet />
        </div>
      </div>
    </div>
    <MetricDrilldownDialog
      focus={drillFocus}
      onClose={() => setDrillFocus(null)}
      view={view}
      salesCallEvents={salesCallEvents}
      salesCallsLoading={salesCallsQuery.isLoading || salesCallsQuery.isFetching}
      salesCallsError={salesCallsQuery.error ?? null}
    />
    </DrilldownCtx.Provider>
    </ViewCtx.Provider>
  );
}

export default SalesDashboardV2;