import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, RotateCcw, RefreshCw, ExternalLink, Link2, SlidersHorizontal, Save as SaveIcon, Loader2 } from 'lucide-react';
import { useCompanyDashboardConfig } from '@/hooks/useCompanyDashboardConfig';
import { toast as sonnerToast } from 'sonner';
import { useAsanaGoals, type AsanaGoalRow } from '@/hooks/useAsanaGoals';
import { useAsanaGoalFilterPrefs } from '@/hooks/useAsanaGoalFilterPrefs';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import naitiveLogoDark from '@/assets/naitive-logo-dark.png';
import { QirCommentThread } from './qir/QirCommentThread';
import { QirAllCommentsPanel } from './qir/QirAllCommentsPanel';
import { QuickBooksActualsPanel, type ActualsViewMode } from './qir/QuickBooksActualsPanel';
import { KpiDrillDownDialog, type KpiLike } from './qir/KpiDrillDownDialog';
import {
  DEFAULT_ASANA_GOAL_FILTERS,
  type AsanaGoalFilterTemplates,
  type QKey,
  type HKey,
} from './asanaGoalFilterTypes';
// Re-export so any existing consumers importing these from
// QuarterlyInsightsReport continue to work.
export {
  DEFAULT_ASANA_GOAL_FILTERS,
  type AsanaGoalFilterTemplates,
  type QKey,
  type HKey,
};

/* ─────────────────────────────────────────────────────────────────────────
   Quarterly Insights Report — reusable full report page for the existing
   ManagementReviewCarousel. Visual language matches the platform's Liquid
   Glass executive dashboards. All state is in-memory only.
   ───────────────────────────────────────────────────────────────────── */

const SURFACE = 'rgba(16,28,52,0.75)';
const SURFACE_BORDER = '1px solid rgba(80,140,255,0.18)';
const SHEEN = 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.00) 55%)';
/* Canonical platform radius tokens (mirrors src/index.css --radius-*).
   Containers/cards/inputs/selects/buttons → RADIUS (8px).
   Pills/badges/progress → RADIUS_PILL (full). */
const RADIUS = 8;
const RADIUS_PILL = 9999;
const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';
const INPUT_BG = 'rgba(10,18,36,0.6)';
const INPUT_BORDER = '1px solid rgba(120,170,255,0.18)';

const PEOPLE = [
  'James Turner', 'John Moffitt', 'Florencia Fustinoni', 'Scott Williams',
  'Mark Kaleniecki', 'Paz Pina', 'McKenzie Clark',
  'Jennifer Rivera', 'Tyler Robinson', 'Kris Lawless',
  'Niki Heikali', 'Siddhi Bhangale',
];
const ACTIVE_INITIATIVE_OWNERS = ['James Turner', 'Niki Heikali', 'Florencia Fustinoni', 'Paz Pina', 'McKenzie Clark'];
const PRIMARY_AUTHORS = ['James Turner', 'Scott Williams', 'John Moffitt'];
const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'];
const QUARTER_MONTHS: Record<string, string[]> = {
  Q1: ['January', 'February', 'March'],
  Q2: ['April', 'May', 'June'],
  Q3: ['July', 'August', 'September'],
  Q4: ['October', 'November', 'December'],
};
function monthsForQuarter(quarter: string): string[] {
  const [q, year] = quarter.split(' ');
  const names = QUARTER_MONTHS[q] || [];
  return names.map(m => `${m} ${year}`);
}

/* ── Asana Goals: period → filter mapping ────────────────────────────────
   Templates may include "{year}" which is replaced with the report's year.
   This keeps the mapping configurable yet generic across years. */
const Q_TO_HALF: Record<QKey, HKey> = { Q1: 'H1', Q2: 'H1', Q3: 'H2', Q4: 'H2' };
const MONTH_TO_Q: Record<string, QKey> = {
  January: 'Q1', February: 'Q1', March: 'Q1',
  April: 'Q2', May: 'Q2', June: 'Q2',
  July: 'Q3', August: 'Q3', September: 'Q3',
  October: 'Q4', November: 'Q4', December: 'Q4',
};

/** Derive the Asana quarter/half labels for the active report period. */
export function deriveAsanaGoalPeriod(
  s: Pick<ReportState, 'period' | 'quarter' | 'month'>,
  templates: AsanaGoalFilterTemplates = DEFAULT_ASANA_GOAL_FILTERS,
): { qKey: QKey; hKey: HKey; year: string; quarterLabel: string; halfLabel: string } {
  let qKey: QKey;
  let year: string;
  if (s.period === 'monthly') {
    const [monthName, monthYear] = (s.month || '').split(' ');
    qKey = (MONTH_TO_Q[monthName] || 'Q1') as QKey;
    year = monthYear || (s.quarter.split(' ')[1] ?? '');
  } else {
    const [q, qYear] = s.quarter.split(' ');
    qKey = (q as QKey) || 'Q1';
    year = qYear || '';
  }
  const hKey = Q_TO_HALF[qKey];
  const fill = (tpl: string) => tpl.replace(/\{year\}/g, year);
  return {
    qKey,
    hKey,
    year,
    quarterLabel: fill(templates.quarters[qKey] || ''),
    halfLabel: fill(templates.halves[hKey] || ''),
  };
}

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: RADIUS,
        background: SURFACE,
        border: SURFACE_BORDER,
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', background: SHEEN }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_LABEL, margin: 0 }}>{children}</h3>
      {right}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: INPUT_BG,
  border: INPUT_BORDER,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  color: TEXT_PRIMARY,
  width: '100%',
  outline: 'none',
  fontVariantNumeric: 'tabular-nums',
};
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' };

function Btn({ children, onClick, variant = 'default', icon: Icon, ariaLabel }: {
  children?: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'ghost' | 'danger';
  icon?: React.ElementType;
  ariaLabel?: string;
}) {
  const variants: Record<string, React.CSSProperties> = {
    default: { background: 'rgba(40,90,150,0.35)', border: '1px solid rgba(80,150,220,0.25)', color: '#cfe6ff' },
    ghost: { background: 'transparent', border: '1px solid rgba(120,170,255,0.18)', color: TEXT_MUTED },
    danger: { background: 'transparent', border: '1px solid rgba(220,80,80,0.25)', color: 'rgba(240,140,140,0.85)' },
  };

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: children ? '0 12px' : 0,
        width: children ? undefined : 30,
        justifyContent: 'center',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background .2s, border-color .2s',
        ...variants[variant],
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = variant === 'default' ? 'rgba(40,110,180,0.55)' : 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = variants[variant].background as string;
      }}
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

function Pill({ tone, children }: { tone: 'pos' | 'neu' | 'neg' | 'info'; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    pos: { background: 'rgba(40,190,120,0.15)', color: '#4de8a0', border: '1px solid rgba(40,190,120,0.28)' },
    neu: { background: 'rgba(220,170,40,0.13)', color: '#f0c84a', border: '1px solid rgba(220,170,40,0.25)' },
    neg: { background: 'rgba(220,80,80,0.15)', color: '#f08585', border: '1px solid rgba(220,80,80,0.28)' },
    info: { background: 'rgba(60,140,210,0.15)', color: '#7cc8f0', border: '1px solid rgba(60,150,220,0.25)' },
  };
  return <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '2px 8px', borderRadius: RADIUS_PILL, ...s[tone] }}>{children}</span>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 500,
        color: '#cfe2f7',
        background: 'rgba(40,90,150,0.25)',
        border: '1px solid rgba(80,150,220,0.22)',
        borderRadius: RADIUS_PILL,
      }}
    >
      {children}
    </span>
  );
}

export type KPIFormat = 'currency' | 'percent' | 'number';
export interface KPI { id: string; label: string; actual: string; target: string; format: KPIFormat; }
export interface Goal { id: string; title: string; owner: string; status: string; due: string; }
export interface Initiative { id: string; title: string; status: string; progress: number; owner: string; }
export interface Risk { id: string; description: string; mitigation: string; }

export interface ReportState {
  period: 'monthly' | 'quarterly';
  quarter: string;
  month: string;
  preparedDate: string;
  authors: string[];
  kpis: KPI[];
  narrative: string;
  goals: Goal[];
  initiatives: Initiative[];
  initiativeOwnerFilter: string;
  risks: Risk[];
  /** Legacy single cover title (kept for backward compatibility — migrated into coverTitlesByPeriod on first edit). */
  coverTitle?: string;
  /** Legacy single subtitle (kept for backward compatibility). */
  coverSubtitle?: string;
  /** Admin-editable cover title overrides keyed by reporting period label (e.g. "Q1 2026", "April 2026"). */
  coverTitlesByPeriod?: Record<string, string>;
  /** Admin-editable subtitle/tagline overrides keyed by reporting period label. */
  coverSubtitlesByPeriod?: Record<string, string>;
  /** Configurable mapping from report period → Asana Goals time-period labels. */
  asanaGoalFilters?: AsanaGoalFilterTemplates;
  /** Optional manual override for the active report (resets when period changes). */
  asanaGoalOverride?: { quarterLabel?: string; halfLabel?: string } | null;
  /** When true, match Asana time_period by exact label (case-insensitive) instead of substring. */
  asanaGoalExactMatch?: boolean;
}

const SEED: ReportState = {
  period: 'quarterly',
  quarter: 'Q1 2026',
  month: 'January 2026',
  preparedDate: '04/28/2026',
  authors: PRIMARY_AUTHORS,
  kpis: [
    { id: 'k1', label: 'Revenue', actual: '4250000', target: '4000000', format: 'currency' },
    { id: 'k2', label: 'Pipeline', actual: '18500000', target: '20000000', format: 'currency' },
    { id: 'k3', label: 'Custom Metric', actual: '92', target: '85', format: 'percent' },
  ],
  narrative:
`Q1 2026 closed with revenue 6.3% above plan, driven by stronger-than-expected execution in Debt Capital Markets and continued momentum from the FinServ advisory practice. Two strategic mandates closed inside quarter, contributing meaningful fee income and establishing reference accounts in our priority verticals.

Operationally, the Naitive platform reached internal feature parity for deal management, document intelligence, and lender matching. Adoption across the Debt and FinServ teams now sits at 100% for active engagements, materially shortening turnaround on lender outreach and write-up production.

Looking forward, our Q2 focus is sustaining pipeline velocity, hardening the agentic deal-ops layer, and converting the FinServ pipeline from indication-of-interest to signed engagements. We remain disciplined on opex while continuing to invest in the platform and senior origination capacity.`,
  goals: [
    { id: 'g1', title: 'Close 8 Debt mandates by quarter-end', owner: 'James Turner', status: 'On Track', due: '2026-06-30' },
    { id: 'g2', title: 'Launch FinServ outbound channel — Asana: ABC-1042', owner: 'Scott Williams', status: 'On Track', due: '2026-05-15' },
    { id: 'g3', title: 'Ship Naitive Agent v2 to internal users', owner: 'John Moffitt', status: 'At Risk', due: '2026-06-15' },
    { id: 'g4', title: 'Operationalize lender-tier scoring across all desks', owner: 'Mark Kaleniecki', status: 'On Track', due: '2026-05-30' },
    { id: 'g5', title: 'Stand up Q2 2026 pipeline review cadence', owner: 'Florencia Fustinoni', status: 'Achieved', due: '2026-04-15' },
    { id: 'g6', title: 'Hire 2 senior originators', owner: 'Chandler Minaldi', status: 'Behind', due: '2026-06-30' },
  ],
  initiatives: [
    { id: 'i1', title: 'Naitive Agent Platform — Asana Portfolio: AGT-2026', status: 'On Track', progress: 72, owner: 'John Moffitt' },
    { id: 'i2', title: 'FinServ Go-To-Market — Asana Project: FSV-Q2', status: 'At Risk', progress: 41, owner: 'Scott Williams' },
    { id: 'i3', title: 'Lender Directory Expansion (T1/T2)', status: 'On Track', progress: 88, owner: 'Mark Kaleniecki' },
  ],
  initiativeOwnerFilter: 'All',
  risks: [
    {
      id: 'r1',
      description: 'Concentration risk: top 3 mandates represent ~58% of forecast Q2 fee revenue.',
      mitigation: 'Accelerate FinServ pipeline conversion; stagger close dates; build secondary lender coverage.',
    },
    {
      id: 'r2',
      description: 'Senior originator capacity constrained ahead of Q2 push.',
      mitigation: 'Active retained search; backfill with contractor coverage on 2 named accounts through May.',
    },
    {
      id: 'r3',
      description: 'Agentic deal-ops still requires human approval gates — slows latency on long-tail tasks.',
      mitigation: 'Define low-risk auto-execute scope; ship guarded auto-mode for internal users only in Q2.',
    },
    { id: 'r4', description: '', mitigation: '' },
  ],
  asanaGoalFilters: DEFAULT_ASANA_GOAL_FILTERS,
  asanaGoalOverride: null,
  asanaGoalExactMatch: false,
};

const cloneSeed = (): ReportState => JSON.parse(JSON.stringify(SEED));

export function createQuarterlyReportSeed(overrides?: Partial<ReportState>): ReportState {
  return {
    ...cloneSeed(),
    ...overrides,
    authors: overrides?.authors ? [...overrides.authors] : [...SEED.authors],
    kpis: overrides?.kpis ? overrides.kpis.map(item => ({ ...item })) : cloneSeed().kpis,
    goals: overrides?.goals ? overrides.goals.map(item => ({ ...item })) : cloneSeed().goals,
    initiatives: overrides?.initiatives ? overrides.initiatives.map(item => ({ ...item })) : cloneSeed().initiatives,
    risks: overrides?.risks ? overrides.risks.map(item => ({ ...item })) : cloneSeed().risks,
  };
}

export function useQuarterlyReportState(initialState?: ReportState, storageKey?: string) {
  const seed = useMemo<ReportState>(
    () => (initialState ? createQuarterlyReportSeed(initialState) : cloneSeed()),
    // intentionally compute once per mount; downstream callers pass a stable seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Persist company-wide via company_settings.fpa_dashboard_config.
  // Falls back to in-memory state when no storageKey is provided.
  const configKey = storageKey || 'naitive.quarterlyReport.adhoc';
  const { config, saveConfig, isLoaded, canEdit } = useCompanyDashboardConfig<ReportState>(
    configKey,
    seed,
    { allowAllMembers: true },
  );
  // Local mirror so typing stays snappy; flushed to company config on change (debounced inside hook)
  const [state, setStateLocal] = useState<ReportState>(seed);
  // Hydrate from saved config once it loads — guard with isLoaded so we never
  // overwrite saved data with the seed default.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || hydratedRef.current) return;
    setStateLocal(config);
    hydratedRef.current = true;
  }, [isLoaded, config]);

  const setState: React.Dispatch<React.SetStateAction<ReportState>> = (updater) => {
    setStateLocal(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: ReportState) => ReportState)(prev)
        : updater;
      // Only persist after initial hydration to avoid clobbering with defaults
      if (hydratedRef.current) saveConfig(next);
      return next;
    });
  };

  const reset = () => {
    setStateLocal(seed);
    if (hydratedRef.current) saveConfig(seed);
    sonnerToast.success('Report reset to defaults');
  };
  const save = () => {
    if (!canEdit) {
      sonnerToast.error('You do not have permission to save this report');
      return;
    }
    saveConfig(state);
    sonnerToast.success('Report saved');
  };
  const print = () => { try { window.print(); } catch {} };
  return { state, setState, reset, save, print, isLoaded, canEdit };
}

function formatKPI(value: string, format: KPIFormat): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (format === 'currency') {
    // Whole-dollar USD with comma separators, no decimals, no abbreviation.
    // Negative values render as -$1,234 via the standard 'sign' formatter.
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.trunc(n));
  }
  if (format === 'percent') return `${n.toFixed(1)}%`;
  return n.toLocaleString();
}

function deriveStatus(actual: string, target: string): 'Above Plan' | 'On Plan' | 'Off Plan' {
  const a = Number(actual);
  const t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || t === 0) return 'On Plan';
  const ratio = a / t;
  if (ratio >= 1.02) return 'Above Plan';
  if (ratio >= 0.95) return 'On Plan';
  return 'Off Plan';
}

function statusTone(s: string): 'pos' | 'neu' | 'neg' {
  if (s === 'Above Plan' || s === 'Achieved' || s === 'On Track') return 'pos';
  if (s === 'On Plan' || s === 'At Risk') return 'neu';
  return 'neg';
}

const uid = () => Math.random().toString(36).slice(2, 9);

type ReportSetState = React.Dispatch<React.SetStateAction<ReportState>>;

function ReportHeaderSection({ s, set, reset, save, print, canEdit }: { s: ReportState; set: ReportSetState; reset: () => void; save?: () => void; print: () => void; canEdit?: boolean }) {
  // Validation: ensure Month always has a valid selection while in Monthly mode.
  // Covers stale persisted state, programmatic state changes, and quarter switches.
  useEffect(() => {
    if (s.period !== 'monthly') return;
    const validMonths = monthsForQuarter(s.quarter);
    if (validMonths.length === 0) return;
    if (!s.month || !validMonths.includes(s.month)) {
      set(prev => ({ ...prev, month: validMonths[0] }));
    }
  }, [s.period, s.quarter, s.month, set]);

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-.2px' }}>
              {s.period === 'monthly'
                ? `Monthly Insights Report — ${monthsForQuarter(s.quarter).includes(s.month) ? s.month : (monthsForQuarter(s.quarter)[0] || s.quarter)}`
                : `Quarterly Insights Report — ${s.quarter}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {save ? (
              <span title={canEdit === false ? 'You do not have permission to save' : 'Save report for everyone'}>
                <Btn icon={SaveIcon} onClick={save}>Save</Btn>
              </span>
            ) : null}
            <Btn icon={RotateCcw} variant="ghost" onClick={reset}>Reset</Btn>
            <Btn icon={Printer} onClick={print}>Print / Export</Btn>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Date Prepared</span>
            <input value={s.preparedDate} onChange={e => set(prev => ({ ...prev, preparedDate: e.target.value }))} style={{ ...inputStyle, width: 120 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Prepared By</span>
            {(() => {
              const PREPARED_BY_OPTIONS = ['James Turner', 'John Moffitt', 'Scott Williams', 'McKenzie Clark'];
              const current = s.authors[0] && PREPARED_BY_OPTIONS.includes(s.authors[0])
                ? s.authors[0]
                : 'James Turner';
              return (
                <select
                  value={current}
                  onChange={e => set(prev => ({ ...prev, authors: [e.target.value] }))}
                  style={{ ...selectStyle, width: 140 }}
                >
                  {PREPARED_BY_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              );
            })()}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReportKpisSection({ s, set, reportLabel }: { s: ReportState; set: ReportSetState; reportLabel: string }) {
  const updateKPI = (id: string, patch: Partial<KPI>) => set(prev => ({ ...prev, kpis: prev.kpis.map(k => k.id === id ? { ...k, ...patch } : k) }));
  const removeKPI = (id: string) => set(prev => ({ ...prev, kpis: prev.kpis.filter(k => k.id !== id) }));
  const addKPI = () => set(prev => ({ ...prev, kpis: [...prev.kpis, { id: uid(), label: 'New KPI', actual: '0', target: '0', format: 'number' }] }));
  const [drillKpi, setDrillKpi] = useState<KpiLike | null>(null);

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={<Btn icon={Plus} variant="ghost" onClick={addKPI}>Add KPI</Btn>}>KPIs</SectionTitle>
        <div style={{ display: 'grid', gap: 10 }}>
          {s.kpis.map(kpi => {
            const status = deriveStatus(kpi.actual, kpi.target);
            const tone = status === 'Above Plan' ? 'pos' : status === 'On Plan' ? 'neu' : 'neg';
            return (
              <div
                key={kpi.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(160px,1.4fr) auto minmax(110px,1fr) minmax(110px,1fr) 110px 30px',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: RADIUS,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                }}
                role="button"
                tabIndex={0}
                title="View metric details"
                onClick={(e) => {
                  // Avoid opening the drill-down when interacting with inline editors / delete button
                  const target = e.target as HTMLElement;
                  if (target.closest('input, select, textarea, button')) return;
                  setDrillKpi(kpi as unknown as KpiLike);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    const target = e.target as HTMLElement;
                    if (target.closest('input, select, textarea, button')) return;
                    e.preventDefault();
                    setDrillKpi(kpi as unknown as KpiLike);
                  }
                }}
              >
                <input value={kpi.label} onChange={e => updateKPI(kpi.id, { label: e.target.value })} placeholder="Metric label" style={inputStyle} />
                <Pill tone={tone}>{status}</Pill>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Actual</span>
                  <input value={kpi.actual} onChange={e => updateKPI(kpi.id, { actual: e.target.value })} style={inputStyle} />
                  <span style={{ fontSize: 11, color: '#dde8f8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatKPI(kpi.actual, kpi.format)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Target</span>
                  <input value={kpi.target} onChange={e => updateKPI(kpi.id, { target: e.target.value })} style={inputStyle} />
                  <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatKPI(kpi.target, kpi.format)}</span>
                </div>
                <select value={kpi.format} onChange={e => updateKPI(kpi.id, { format: e.target.value as KPIFormat })} style={selectStyle}>
                  <option value="currency">$ Currency</option>
                  <option value="percent">% Percent</option>
                  <option value="number"># Number</option>
                </select>
                <Btn icon={Trash2} variant="danger" ariaLabel="Remove KPI" onClick={() => removeKPI(kpi.id)} />
              </div>
            );
          })}
        </div>
      </div>
      <KpiDrillDownDialog
        kpi={drillKpi}
        open={!!drillKpi}
        onClose={() => setDrillKpi(null)}
        period={s.period}
        quarter={s.quarter}
        month={s.month}
        reportLabel={reportLabel}
      />
    </Card>
  );
}

function ReportNarrativeSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle>Summary / Quarterly Narrative Update</SectionTitle>
        <textarea
          value={s.narrative}
          onChange={e => set(prev => ({ ...prev, narrative: e.target.value }))}
          style={{
            ...inputStyle,
            minHeight: 220,
            lineHeight: 1.6,
            fontSize: 13,
            padding: 14,
            resize: 'vertical',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
        />
      </div>
    </Card>
  );
}

function ReportGoalsSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  const { goals: asanaGoals, loading, error, lastSyncedAt, configured, refresh } = useAsanaGoals();
  const prefs = useAsanaGoalFilterPrefs();

  // When server prefs finish loading, hydrate the per-report state once so
  // downstream code (and persisted localStorage snapshot) stays in sync.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!prefs.isLoaded || hydratedRef.current) return;
    hydratedRef.current = true;
    set(prev => ({
      ...prev,
      asanaGoalFilters: prefs.filters,
      asanaGoalOverride: prefs.override,
      asanaGoalExactMatch: prefs.exactMatch,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.isLoaded]);

  const preparedBy = s.authors[0] || 'James Turner';
  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const preparedByKey = normalize(preparedBy);

  const templates = (prefs.isLoaded ? prefs.filters : (s.asanaGoalFilters || DEFAULT_ASANA_GOAL_FILTERS));
  const derived = useMemo(() => deriveAsanaGoalPeriod(s, templates), [s, templates]);
  const activeOverride = prefs.isLoaded ? prefs.override : s.asanaGoalOverride;
  const activeExactMatch = prefs.isLoaded ? prefs.exactMatch : !!s.asanaGoalExactMatch;
  const activeQuarterLabel = activeOverride?.quarterLabel ?? derived.quarterLabel;
  const activeHalfLabel = activeOverride?.halfLabel ?? derived.halfLabel;

  // Reset manual override whenever the underlying period changes.
  useEffect(() => {
    if (activeOverride) {
      set(prev => ({ ...prev, asanaGoalOverride: null }));
      if (prefs.isLoaded) void prefs.save({ override: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.period, s.quarter, s.month]);

  /**
   * Normalize a time period label for exact comparison:
   * - lowercased + trimmed + collapsed whitespace
   * - "FY24" / "FY 24" / "FY 2024" / "FY2024" / "fy '24" → "fy<4-digit-year>"
   * - bare 2-digit year tokens after Q1–Q4 / H1–H2 are expanded ("q2 24" → "q2 2024")
   */
  const normalizePeriodLabel = (raw: string): string => {
    let s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    // FY normalization (handles "fy24", "fy 24", "fy '24", "fy 2024")
    s = s.replace(/fy\s*'?\s*(\d{2,4})/g, (_m, y) => {
      const n = String(y).length === 2 ? `20${y}` : String(y);
      return `fy${n}`;
    });
    // Bare year after Q/H token: "q2 24" → "q2 2024"
    s = s.replace(/\b([qh][1-4])\s+'?(\d{2})\b/g, (_m, p, y) => `${p} 20${y}`);
    return s.trim();
  };

  const matchesPeriod = (tp: string | null): boolean => {
    if (!tp) return false;
    const exact = activeExactMatch;
    if (exact) {
      const norm = normalizePeriodLabel(tp);
      const q = normalizePeriodLabel(activeQuarterLabel);
      const h = normalizePeriodLabel(activeHalfLabel);
      if (q && norm === q) return true;
      if (h && norm === h) return true;
      return false;
    }
    const norm = tp.trim().toLowerCase();
    const q = activeQuarterLabel.trim().toLowerCase();
    const h = activeHalfLabel.trim().toLowerCase();
    if (q && norm.includes(q)) return true;
    if (h && norm.includes(h)) return true;
    return false;
  };

  const ownerGoals = useMemo(
    () => asanaGoals.filter(g => g.owner && normalize(g.owner) === preparedByKey),
    [asanaGoals, preparedByKey]
  );
  const visibleGoals = useMemo(
    () => ownerGoals.filter(g => matchesPeriod(g.timePeriod)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownerGoals, activeQuarterLabel, activeHalfLabel, activeExactMatch]
  );

  // Preview counts for both modes — used in the filter editor next to the toggle.
  const matchPreview = useMemo(() => {
    const qSub = activeQuarterLabel.trim().toLowerCase();
    const hSub = activeHalfLabel.trim().toLowerCase();
    const qEx = normalizePeriodLabel(activeQuarterLabel);
    const hEx = normalizePeriodLabel(activeHalfLabel);
    const exactMatches: typeof ownerGoals = [];
    const substringMatches: typeof ownerGoals = [];
    for (const g of ownerGoals) {
      const raw = g.timePeriod || '';
      if (!raw.trim()) continue;
      const tpSub = raw.trim().toLowerCase();
      const tpEx = normalizePeriodLabel(raw);
      if ((qEx && tpEx === qEx) || (hEx && tpEx === hEx)) exactMatches.push(g);
      if ((qSub && tpSub.includes(qSub)) || (hSub && tpSub.includes(hSub))) substringMatches.push(g);
    }
    return { exact: exactMatches, substring: substringMatches };
  }, [ownerGoals, activeQuarterLabel, activeHalfLabel]);

  // Persist editor open/closed state in localStorage so it survives reloads.
  const editorOpenStorageKey = 'asanaGoalFilterEditorOpen:v1';
  const [filterEditorOpen, setFilterEditorOpenRaw] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(editorOpenStorageKey) === '1';
    } catch {
      return false;
    }
  });
  const setFilterEditorOpen: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
    setFilterEditorOpenRaw(prev => {
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value;
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(editorOpenStorageKey, next ? '1' : '0'); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 12, color: TEXT_PRIMARY, verticalAlign: 'middle', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  const formatSyncedAt = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  };

  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {lastSyncedAt && (
        <span style={{ fontSize: 10, color: TEXT_LABEL, letterSpacing: '.04em' }}>
          Synced {formatSyncedAt(lastSyncedAt)}
        </span>
      )}
      <Btn icon={SlidersHorizontal} variant="ghost" onClick={() => setFilterEditorOpen(o => !o)}>
        Filters
      </Btn>
      <Btn icon={RefreshCw} variant="ghost" onClick={() => { void refresh(); }}>
        {loading ? 'Syncing…' : 'Sync'}
      </Btn>
    </div>
  );

  const renderEmpty = () => (
    <div style={{
      padding: '28px 18px',
      textAlign: 'center',
      color: TEXT_MUTED,
      fontSize: 12,
      border: '1px dashed rgba(120,170,255,0.18)',
      borderRadius: RADIUS,
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 4 }}>No Asana Goals synced</div>
      <div style={{ marginBottom: 10 }}>
        {configured
          ? 'No Goals were returned from your connected Asana workspace.'
          : 'Connect Asana to sync goals into this report.'}
      </div>
      <Btn icon={Link2} variant="ghost" onClick={() => window.open('/integrations', '_blank')}>
        {configured ? 'Manage Asana' : 'Connect Asana'}
      </Btn>
    </div>
  );

  const renderError = () => (
    <div style={{
      padding: '10px 12px',
      fontSize: 11,
      color: '#f08585',
      background: 'rgba(220,80,80,0.08)',
      border: '1px solid rgba(220,80,80,0.2)',
      borderRadius: 8,
      marginBottom: 10,
    }}>
      Asana sync error: {error}
    </div>
  );

  const renderSkeleton = () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          height: 36,
          borderRadius: 8,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
          backgroundSize: '200% 100%',
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
    </div>
  );

  const showSkeleton = loading && asanaGoals.length === 0;
  const showEmpty = !showSkeleton && !error && asanaGoals.length === 0;
  const showFilteredEmpty = !showSkeleton && !showEmpty && !error && visibleGoals.length === 0;

  const renderFilteredEmpty = () => (
    <div style={{
      padding: '24px 18px',
      textAlign: 'center',
      color: TEXT_MUTED,
      fontSize: 12,
      border: '1px dashed rgba(120,170,255,0.18)',
      borderRadius: RADIUS,
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ fontWeight: 600, color: TEXT_PRIMARY }}>No goals match the current filters</div>
      <div style={{ marginTop: 4 }}>
        Filtered by: {preparedBy} · {activeQuarterLabel || '—'} · {activeHalfLabel || '—'}
      </div>
    </div>
  );

  const updateTemplate = (kind: 'quarters' | 'halves', key: string, val: string) => {
    const base = templates;
    const nextSection = { ...base[kind], [key]: val } as Record<string, string>;
    const nextFilters = { ...base, [kind]: nextSection } as AsanaGoalFilterTemplates;
    set(prev => ({ ...prev, asanaGoalFilters: nextFilters }));
    void prefs.save({ filters: nextFilters });
  };

  const renderFilterEditor = () => {
    const inp: React.CSSProperties = { ...inputStyle, width: '100%' };
    const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: TEXT_LABEL, marginBottom: 4 };
    const warnInp: React.CSSProperties = { ...inp, borderColor: 'rgba(255,140,140,0.55)', boxShadow: '0 0 0 1px rgba(255,140,140,0.25) inset' };
    const warnText: React.CSSProperties = { fontSize: 10, color: '#ff9b9b', marginTop: 4 };
    const isBlank = (v: string | undefined) => !v || !v.trim();
    const blankQs = (['Q1','Q2','Q3','Q4'] as QKey[]).filter(q => isBlank(templates.quarters[q]));
    const blankHs = (['H1','H2'] as HKey[]).filter(h => isBlank(templates.halves[h]));
    const hasBlanks = blankQs.length > 0 || blankHs.length > 0;
    return (
      <div style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: RADIUS,
        border: '1px solid rgba(120,170,255,0.18)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>Asana Goals filter mapping</div>
          <div style={{ fontSize: 10, color: TEXT_MUTED }}>
            Use <code style={{ color: '#7cc8f0' }}>{'{year}'}</code> to template the year. Matches Asana <em>time period</em> by substring.
          </div>
        </div>
        {/* Live preview for currently selected period */}
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid rgba(120,170,255,0.18)',
          background: 'rgba(120,170,255,0.06)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: TEXT_PRIMARY,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: TEXT_LABEL }}>
            Preview ({s.period === 'monthly' ? s.month : s.quarter})
          </span>
          <span style={{ color: TEXT_MUTED }}>Quarter →</span>
          <code style={{ color: activeQuarterLabel ? '#7cc8f0' : '#ff9b9b' }}>
            {activeQuarterLabel || '(blank)'}
          </code>
          <span style={{ color: TEXT_MUTED }}>· Half →</span>
          <code style={{ color: activeHalfLabel ? '#7cc8f0' : '#ff9b9b' }}>
            {activeHalfLabel || '(blank)'}
          </code>
          <span style={{ marginLeft: 'auto', color: TEXT_MUTED, fontSize: 10 }}>
            Mode: {activeExactMatch ? 'exact' : 'substring'}
          </span>
        </div>
        {hasBlanks && (
          <div style={{
            marginBottom: 10,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,140,140,0.35)',
            background: 'rgba(255,140,140,0.08)',
            fontSize: 11,
            color: '#ffb3b3',
          }}>
            ⚠ Blank template{(blankQs.length + blankHs.length) > 1 ? 's' : ''}:{' '}
            {[...blankQs, ...blankHs].join(', ')} — goals for these periods will not match.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
          {(['Q1','Q2','Q3','Q4'] as QKey[]).map(q => (
            <div key={q}>
              <div style={lbl}>{q}</div>
              <input
                value={templates.quarters[q]}
                onChange={e => updateTemplate('quarters', q, e.target.value)}
                style={isBlank(templates.quarters[q]) ? warnInp : inp}
              />
              {isBlank(templates.quarters[q]) && (
                <div style={warnText}>Required — leaving blank disables matching for {q}.</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
          {(['H1','H2'] as HKey[]).map(h => (
            <div key={h}>
              <div style={lbl}>{h}</div>
              <input
                value={templates.halves[h]}
                onChange={e => updateTemplate('halves', h, e.target.value)}
                style={isBlank(templates.halves[h]) ? warnInp : inp}
              />
              {isBlank(templates.halves[h]) && (
                <div style={warnText}>Required — leaving blank disables matching for {h}.</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={lbl}>Override quarter (this report)</div>
              {activeOverride?.quarterLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...(activeOverride || {}) };
                    delete (next as any).quarterLabel;
                    const nextOverride = (next.halfLabel ? next : null) as typeof activeOverride;
                    set(prev => ({ ...prev, asanaGoalOverride: nextOverride }));
                    void prefs.save({ override: nextOverride });
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#7cc8f0', fontSize: 10, cursor: 'pointer', padding: 0 }}
                  title={`Use derived: ${derived.quarterLabel}`}
                >
                  Use derived
                </button>
              ) : (
                <span style={{ fontSize: 10, color: TEXT_MUTED }}>Using derived</span>
              )}
            </div>
            <input
              placeholder={derived.quarterLabel}
              value={activeOverride?.quarterLabel ?? ''}
              onChange={e => {
                const raw = e.target.value;
                const trimmed = raw.trim();
                // Block clearing when the derived fallback is also blank — this would
                // leave the report with no quarter label at all. Show inline warning
                // and skip persistence instead of silently saving an empty override.
                if (!trimmed && !derived.quarterLabel.trim()) {
                  // Preserve any prior value rather than clearing it.
                  return;
                }
                const nextOverride = { ...(activeOverride || {}), quarterLabel: trimmed || undefined };
                set(prev => ({ ...prev, asanaGoalOverride: nextOverride }));
                void prefs.save({ override: nextOverride });
              }}
              style={inp}
              aria-invalid={!derived.quarterLabel.trim() && !(activeOverride?.quarterLabel ?? '').trim()}
            />
            {!derived.quarterLabel.trim() && !(activeOverride?.quarterLabel ?? '').trim() && (
              <div style={{ marginTop: 4, fontSize: 10, color: '#f0a96a', lineHeight: 1.35 }}>
                Cannot leave blank — the derived quarter label is empty for this period.
                Enter a value (e.g. <code style={{ color: '#f0a96a' }}>Q1 2026</code>) or fix the Q-mapping above.
              </div>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={lbl}>Override half (this report)</div>
              {activeOverride?.halfLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...(activeOverride || {}) };
                    delete (next as any).halfLabel;
                    const nextOverride = (next.quarterLabel ? next : null) as typeof activeOverride;
                    set(prev => ({ ...prev, asanaGoalOverride: nextOverride }));
                    void prefs.save({ override: nextOverride });
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#7cc8f0', fontSize: 10, cursor: 'pointer', padding: 0 }}
                  title={`Use derived: ${derived.halfLabel}`}
                >
                  Use derived
                </button>
              ) : (
                <span style={{ fontSize: 10, color: TEXT_MUTED }}>Using derived</span>
              )}
            </div>
            <input
              placeholder={derived.halfLabel}
              value={activeOverride?.halfLabel ?? ''}
              onChange={e => {
                const raw = e.target.value;
                const trimmed = raw.trim();
                if (!trimmed && !derived.halfLabel.trim()) {
                  return;
                }
                const nextOverride = { ...(activeOverride || {}), halfLabel: trimmed || undefined };
                set(prev => ({ ...prev, asanaGoalOverride: nextOverride }));
                void prefs.save({ override: nextOverride });
              }}
              style={inp}
              aria-invalid={!derived.halfLabel.trim() && !(activeOverride?.halfLabel ?? '').trim()}
            />
            {!derived.halfLabel.trim() && !(activeOverride?.halfLabel ?? '').trim() && (
              <div style={{ marginTop: 4, fontSize: 10, color: '#f0a96a', lineHeight: 1.35 }}>
                Cannot leave blank — the derived half label is empty for this period.
                Enter a value (e.g. <code style={{ color: '#f0a96a' }}>H1 2026</code>) or fix the H-mapping above.
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 'auto', fontSize: 11, color: TEXT_PRIMARY, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={activeExactMatch}
              onChange={e => {
                const next = e.target.checked;
                set(prev => ({ ...prev, asanaGoalExactMatch: next }));
                void prefs.save({ exactMatch: next });
              }}
              style={{ accentColor: '#5ba3d0' }}
            />
            Exact match (case-insensitive)
            <span style={{ fontSize: 10, color: TEXT_MUTED }}>
              — when off, matches by substring so different FY formats still match
            </span>
          </label>
          <Btn variant="ghost" onClick={() => {
            set(prev => ({ ...prev, asanaGoalFilters: DEFAULT_ASANA_GOAL_FILTERS, asanaGoalOverride: null }));
            void prefs.reset();
          }}>
            Reset mapping
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => {
              const current = templates;
              const filled: AsanaGoalFilterTemplates = {
                quarters: {
                  Q1: current.quarters.Q1?.trim() || DEFAULT_ASANA_GOAL_FILTERS.quarters.Q1,
                  Q2: current.quarters.Q2?.trim() || DEFAULT_ASANA_GOAL_FILTERS.quarters.Q2,
                  Q3: current.quarters.Q3?.trim() || DEFAULT_ASANA_GOAL_FILTERS.quarters.Q3,
                  Q4: current.quarters.Q4?.trim() || DEFAULT_ASANA_GOAL_FILTERS.quarters.Q4,
                },
                halves: {
                  H1: current.halves.H1?.trim() || DEFAULT_ASANA_GOAL_FILTERS.halves.H1,
                  H2: current.halves.H2?.trim() || DEFAULT_ASANA_GOAL_FILTERS.halves.H2,
                },
              };
              set(prev => ({ ...prev, asanaGoalFilters: filled }));
              void prefs.save({ filters: filled });
            }}
            ariaLabel="Fill blank Q1-Q4 and H1-H2 fields with default Asana label patterns"
          >
            Auto-fill defaults
          </Btn>
          <Btn variant="ghost" onClick={() => setFilterEditorOpen(false)}>Done</Btn>
        </div>
        {/* Live match preview — reflects toggle in real time */}
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid rgba(120,170,255,0.18)',
          background: 'rgba(255,255,255,0.02)',
          fontSize: 11,
          color: TEXT_PRIMARY,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: TEXT_LABEL }}>
              Match preview
            </span>
            <span style={{ color: TEXT_MUTED, fontSize: 10 }}>for {preparedBy}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: TEXT_MUTED }}>
              <span style={{ color: activeExactMatch ? '#7cc8f0' : TEXT_MUTED, fontWeight: activeExactMatch ? 700 : 400 }}>
                Exact: {matchPreview.exact.length}
              </span>
              {' · '}
              <span style={{ color: !activeExactMatch ? '#7cc8f0' : TEXT_MUTED, fontWeight: !activeExactMatch ? 700 : 400 }}>
                Substring: {matchPreview.substring.length}
              </span>
              {' · of '}{ownerGoals.length} owner goals
            </span>
          </div>
          {visibleGoals.length === 0 ? (
            <div style={{ color: '#ff9b9b', fontSize: 11 }}>
              No goals match in <strong>{activeExactMatch ? 'exact' : 'substring'}</strong> mode.
              {!activeExactMatch && matchPreview.exact.length > 0 && (
                <> Try enabling exact match — {matchPreview.exact.length} would match.</>
              )}
              {activeExactMatch && matchPreview.substring.length > 0 && (
                <> Try disabling exact match — {matchPreview.substring.length} would match.</>
              )}
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
              {visibleGoals.slice(0, 8).map(g => (
                <li key={g.id} style={{ fontSize: 11, color: TEXT_PRIMARY }}>
                  <span>{g.title}</span>
                  {g.timePeriod && (
                    <span style={{ color: TEXT_MUTED }}> — <code style={{ color: '#7cc8f0' }}>{g.timePeriod}</code></span>
                  )}
                </li>
              ))}
              {visibleGoals.length > 8 && (
                <li style={{ fontSize: 10, color: TEXT_MUTED, listStyle: 'none', marginLeft: -16 }}>
                  …and {visibleGoals.length - 8} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={headerRight}>Goals</SectionTitle>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 10 }}>
          Filtered by: <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{preparedBy}</span>
          {' · '}
          <span style={{ color: TEXT_PRIMARY }}>{activeQuarterLabel || '—'}</span>
          {' · '}
          <span style={{ color: TEXT_PRIMARY }}>{activeHalfLabel || '—'}</span>
          <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: TEXT_LABEL }}>
            · {activeExactMatch ? 'exact' : 'substring'}
          </span>
          {activeOverride && (activeOverride.quarterLabel || activeOverride.halfLabel) && (
            <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#f0a45a' }}>
              · manual override
            </span>
          )}
        </div>
        {filterEditorOpen && renderFilterEditor()}
        {error && renderError()}
        {showSkeleton ? renderSkeleton() : showEmpty ? renderEmpty() : showFilteredEmpty ? renderFilteredEmpty() : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 36 }}>#</th>
                  <th style={thStyle}>Title</th>
                  <th style={{ ...thStyle, width: 170 }}>Owner</th>
                  <th style={{ ...thStyle, width: 110 }}>Status</th>
                  <th style={{ ...thStyle, width: 120 }}>Due Date</th>
                  <th style={{ ...thStyle, width: 70 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {visibleGoals.map((goal: AsanaGoalRow, index: number) => (
                  <tr key={goal.id}>
                    <td style={{ ...tdStyle, color: TEXT_LABEL, fontVariantNumeric: 'tabular-nums' }}>{index + 1}</td>
                    <td style={tdStyle}>
                      {goal.url ? (
                        <a
                          href={goal.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: TEXT_PRIMARY,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 500,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#7cc8f0'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT_PRIMARY; }}
                        >
                          {goal.title}
                          <ExternalLink size={11} style={{ opacity: 0.55 }} />
                        </a>
                      ) : (
                        <span>{goal.title}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: TEXT_PRIMARY }}>{goal.owner}</td>
                    <td style={tdStyle}>
                      <Pill tone={statusTone(goal.status)}>{goal.status}</Pill>
                    </td>
                    <td style={{ ...tdStyle, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                      {goal.due || <span style={{ color: TEXT_LABEL }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        padding: '2px 7px',
                        borderRadius: RADIUS_PILL,
                        color: '#f0a45a',
                        background: 'rgba(240,140,40,0.10)',
                        border: '1px solid rgba(240,140,40,0.22)',
                      }}>
                        Asana
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function ReportInitiativesSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  const updateInit = (id: string, patch: Partial<Initiative>) => set(prev => ({ ...prev, initiatives: prev.initiatives.map(init => init.id === id ? { ...init, ...patch } : init) }));
  const removeInit = (id: string) => set(prev => ({ ...prev, initiatives: prev.initiatives.filter(init => init.id !== id) }));
  const addInit = () => set(prev => ({ ...prev, initiatives: [...prev.initiatives, { id: uid(), title: '', status: 'On Track', progress: 0, owner: PEOPLE[0] }] }));

  // Live Asana goals — used to source the Owner display & dropdown options so they
  // reflect the latest Asana state automatically when the goals data refreshes.
  const { goals: asanaGoals, lastSyncedAt } = useAsanaGoals();
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

  // Resolve a "live" owner per initiative by best-effort matching against Asana goals.
  // 1. Try exact title match (normalized).
  // 2. Otherwise, if the stored owner matches an Asana goal owner, keep it.
  // 3. Else fall back to the locally stored owner.
  const resolveLiveOwner = (init: Initiative): string => {
    if (!asanaGoals || asanaGoals.length === 0) return init.owner;
    const titleKey = norm(init.title || '');
    if (titleKey) {
      const byTitle = asanaGoals.find(g => norm(g.title || '') === titleKey);
      if (byTitle?.owner) return byTitle.owner;
      const byPartial = asanaGoals.find(g => {
        const t = norm(g.title || '');
        return t && (t.includes(titleKey) || titleKey.includes(t));
      });
      if (byPartial?.owner) return byPartial.owner;
    }
    return init.owner;
  };

  // Live owners set restricted to the active team allowlist; used for the filter dropdown.
  const liveOwnerOptions = useMemo(() => {
    const fromAsana = new Set<string>();
    for (const g of asanaGoals || []) {
      if (g.owner && ACTIVE_INITIATIVE_OWNERS.includes(g.owner)) fromAsana.add(g.owner);
    }
    // Always include owners that currently appear on initiatives (after live resolution)
    // so the filter never hides a row that's actually on screen.
    for (const init of s.initiatives) {
      const live = resolveLiveOwner(init);
      if (live && ACTIVE_INITIATIVE_OWNERS.includes(live)) fromAsana.add(live);
    }
    // Preserve canonical ordering from ACTIVE_INITIATIVE_OWNERS.
    return ACTIVE_INITIATIVE_OWNERS.filter(o => fromAsana.has(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asanaGoals, s.initiatives]);

  const initsWithLiveOwner = useMemo(
    () => s.initiatives.map(init => ({ ...init, _liveOwner: resolveLiveOwner(init) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.initiatives, asanaGoals],
  );

  const filteredInits = useMemo(
    () => s.initiativeOwnerFilter === 'All'
      ? initsWithLiveOwner
      : initsWithLiveOwner.filter(init => init._liveOwner === s.initiativeOwnerFilter),
    [initsWithLiveOwner, s.initiativeOwnerFilter],
  );
  const counts = useMemo(() => ({
    onTrack: filteredInits.filter(init => init.status === 'On Track').length,
    atRisk: filteredInits.filter(init => init.status === 'At Risk').length,
    offTrack: filteredInits.filter(init => init.status === 'Off Track').length,
  }), [filteredInits]);

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: TEXT_PRIMARY, verticalAlign: 'middle', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={<Btn icon={Plus} variant="ghost" onClick={addInit}>Add Goal</Btn>}>Initiatives</SectionTitle>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Owner</span>
            <select
              value={s.initiativeOwnerFilter}
              onChange={e => set(prev => ({ ...prev, initiativeOwnerFilter: e.target.value }))}
              style={{ ...selectStyle, width: 180 }}
              title={lastSyncedAt ? `Owners sourced from Asana — last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Owners sourced from Asana'}
            >
              <option value="All">All Owners</option>
              {(liveOwnerOptions.length > 0 ? liveOwnerOptions : ACTIVE_INITIATIVE_OWNERS).map(person => (
                <option key={person} value={person}>{person}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Pill tone="pos">On Track · {counts.onTrack}</Pill>
            <Pill tone="neu">At Risk · {counts.atRisk}</Pill>
            <Pill tone="neg">Off Track · {counts.offTrack}</Pill>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                <th style={{ ...thStyle, width: 130 }}>Status</th>
                <th style={{ ...thStyle, width: 200 }}>Progress</th>
                <th style={{ ...thStyle, width: 170 }}>Owner</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredInits.map(init => (
                <tr key={init.id}>
                  <td style={tdStyle}>
                    <input value={init.title} onChange={e => updateInit(init.id, { title: e.target.value })} placeholder="Initiative or Asana portfolio link" style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <select value={init.status} onChange={e => updateInit(init.id, { status: e.target.value })} style={selectStyle}>
                        {['On Track', 'At Risk', 'Off Track'].map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <Pill tone={statusTone(init.status)}>{init.status}</Pill>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={init.progress}
                        onChange={e => updateInit(init.id, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                        style={{ ...inputStyle, width: 60 }}
                      />
                      <div style={{ flex: 1, height: 6, borderRadius: RADIUS_PILL, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${init.progress}%`,
                            height: '100%',
                            background: init.status === 'Off Track'
                              ? 'linear-gradient(90deg,#a23838,#f08585)'
                              : init.status === 'At Risk'
                                ? 'linear-gradient(90deg,#a37a16,#f0c84a)'
                                : 'linear-gradient(90deg,#1a8552,#4de8a0)',
                            transition: 'width .3s',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>{init.progress}%</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span
                      title={lastSyncedAt
                        ? `To change the owner, update this goal in Asana (last synced ${new Date(lastSyncedAt).toLocaleString()})`
                        : 'To change the owner, update this goal in Asana'}
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        color: TEXT_PRIMARY,
                        fontSize: 12,
                        cursor: 'help',
                      }}
                    >
                      {init._liveOwner || init.owner || <span style={{ color: TEXT_LABEL }}>—</span>}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <Btn icon={Trash2} variant="danger" ariaLabel="Remove initiative" onClick={() => removeInit(init.id)} />
                  </td>
                </tr>
              ))}
              {filteredInits.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: TEXT_LABEL, padding: 20 }}>No initiatives match the selected owner.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function ReportRisksSection({ s, set, print }: { s: ReportState; set: ReportSetState; print: () => void }) {
  const updateRisk = (id: string, patch: Partial<Risk>) => set(prev => ({ ...prev, risks: prev.risks.map(risk => risk.id === id ? { ...risk, ...patch } : risk) }));
  const removeRisk = (id: string) => set(prev => ({ ...prev, risks: prev.risks.filter(risk => risk.id !== id) }));
  const addRisk = () => set(prev => ({ ...prev, risks: [...prev.risks, { id: uid(), description: '', mitigation: '' }] }));

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid rgba(255,255,255,0.04)' };
  const taStyle: React.CSSProperties = { ...inputStyle, minHeight: 70, lineHeight: 1.5, padding: 10, resize: 'vertical', fontFamily: 'inherit' };

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={<div style={{ display: 'flex', gap: 8 }}><Btn icon={Plus} variant="ghost" onClick={addRisk}>Add Risk</Btn><Btn icon={Printer} onClick={print}>Print / Export</Btn></div>}>
          Open Risks
        </SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={thStyle}>Risk Description</th>
                <th style={thStyle}>Mitigation Plan</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {s.risks.map(risk => (
                <tr key={risk.id}>
                  <td style={{ ...tdStyle, width: '50%' }}>
                    <textarea value={risk.description} onChange={e => updateRisk(risk.id, { description: e.target.value })} placeholder="Describe the risk…" style={taStyle} />
                  </td>
                  <td style={{ ...tdStyle, width: '50%' }}>
                    <textarea value={risk.mitigation} onChange={e => updateRisk(risk.id, { mitigation: e.target.value })} placeholder="Mitigation plan…" style={taStyle} />
                  </td>
                  <td style={tdStyle}>
                    <Btn icon={Trash2} variant="danger" ariaLabel="Remove risk" onClick={() => removeRisk(risk.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function ReportFooterSection({ s, print }: { s: ReportState; print: () => void }) {
  return (
    <Card className="glass-module">
      <div style={{ padding: '20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: TEXT_LABEL }}>5th Line — {s.quarter}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, marginTop: 4 }}>April 28, 2026</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: TEXT_MUTED, letterSpacing: '.08em', textTransform: 'uppercase' }}>Board-ready export</span>
          <Btn icon={Printer} onClick={print}>Print / Export</Btn>
        </div>
      </div>
    </Card>
  );
}

// NOTE: section IDs are stable storage keys (used by QirSectionNotes / comments).
// Labels here describe the section the anchor actually scrolls to — keep them
// aligned with the components rendered under each id in QuarterlyInsightsReportPage.
const AGENDA_SECTIONS: { id: string; label: string }[] = [
  { id: 'qir-section-summary', label: 'Executive Summary' },
  { id: 'qir-section-financials', label: 'Revenue & Financial Performance — KPIs' },
  { id: 'qir-section-pipeline', label: 'Goals' },
  { id: 'qir-section-metrics', label: 'Initiatives' },
  { id: 'qir-section-goals', label: 'Risks & Mitigation' },
  { id: 'qir-section-commentary', label: 'Commentary & Footer' },
];

function periodLabel(s: ReportState): string {
  if (s.period === 'monthly') {
    const valid = monthsForQuarter(s.quarter);
    return valid.includes(s.month) ? s.month : (valid[0] || s.quarter);
  }
  return s.quarter;
}

function defaultCoverTitle(s: ReportState): string {
  return s.period === 'monthly' ? 'Monthly Insights' : 'Quarterly Insights';
}

function ReportCoverSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRole();
  const insightsTf = useInsightsTimeframeOptional();
  const reportingPeriod = insightsTf?.reportingPeriod ?? null;
  // Derive cover title + period sub-label from the global header reporting
  // period when it's set, so the cover stays in sync with the user's choice.
  const effective = (() => {
    if (!reportingPeriod) {
      return { title: defaultCoverTitle(s), label: periodLabel(s) };
    }
    if (reportingPeriod.view === 'month') {
      const m = /^(\d{4})-(\d{2})$/.exec(reportingPeriod.period);
      let label = reportingPeriod.label;
      if (m) {
        const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
        label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      return { title: 'Monthly Insights', label };
    }
    return { title: 'Quarterly Insights', label: reportingPeriod.label };
  })();
  const preparedByName =
    s.authors[0] ||
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    user?.email ||
    '—';
  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const periodKey = effective.label;
  const titleOverride =
    s.coverTitlesByPeriod?.[periodKey] ??
    // Fallback to legacy single field if present and no per-period value yet
    (s.coverTitlesByPeriod && periodKey in s.coverTitlesByPeriod ? '' : s.coverTitle ?? '');
  const title = titleOverride.trim() || effective.title;
  const updateTitle = (value: string) =>
    set(prev => ({
      ...prev,
      coverTitlesByPeriod: { ...(prev.coverTitlesByPeriod || {}), [periodKey]: value },
    }));
  return (
    <Card className="glass-module qir-page-break">
      <div
        style={{
          padding: '48px 40px',
          minHeight: 520,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 32,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isAdmin ? (
            <input
              value={titleOverride}
              placeholder={effective.title}
              onChange={e => updateTitle(e.target.value)}
              className="qir-no-print"
              style={{
                ...inputStyle,
                fontSize: 34,
                fontWeight: 700,
                padding: '8px 12px',
                background: 'transparent',
                border: '1px dashed rgba(120,170,255,0.18)',
                color: TEXT_PRIMARY,
                letterSpacing: '-.5px',
                width: '100%',
              }}
            />
          ) : null}
          {!isAdmin && (
            <div style={{ fontSize: 38, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-.5px', lineHeight: 1.1 }}>
              {title}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 18, fontWeight: 600, color: '#7cc8f0', letterSpacing: '.05em' }}>
            {effective.label}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 18,
            paddingTop: 18,
            borderTop: '1px solid rgba(120,170,255,0.12)',
          }}
        >
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: TEXT_LABEL }}>Date Prepared</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, marginTop: 4 }}>{todayStr}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: TEXT_LABEL }}>Reporting Period</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, marginTop: 4 }}>{periodLabel(s)}</div>
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.18em',
            color: 'rgba(240,140,40,0.85)',
            padding: '8px 12px',
            border: '1px solid rgba(240,140,40,0.22)',
            borderRadius: RADIUS,
            display: 'inline-block',
            alignSelf: 'flex-start',
            background: 'rgba(240,140,40,0.06)',
          }}
        >
          Confidential — For Internal Use Only
        </div>
      </div>
      <div style={{ height: 1, background: 'rgba(120,170,255,0.12)' }} />
      <ReportAgendaSection embedded />
    </Card>
  );
}

function ReportAgendaSection({ embedded = false }: { embedded?: boolean } = {}) {
  const STORAGE_KEY = 'qir.agenda.smoothScroll';
  const prefersReduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [smooth, setSmooth] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return !prefersReduced;
  });
  React.useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, String(smooth)); } catch {}
  }, [smooth]);
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    jumpTo(id);
  };
  const linkRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);
  const jumpTo = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    // Move focus to the section heading for screen readers / keyboard users.
    const prevTabIndex = el.getAttribute('tabindex');
    if (prevTabIndex == null) el.setAttribute('tabindex', '-1');
    try { (el as HTMLElement).focus({ preventScroll: true }); } catch { (el as HTMLElement).focus(); }
    if (typeof history !== 'undefined' && history.replaceState) {
      try { history.replaceState(null, '', `#${id}`); } catch {}
    }
  }, [smooth]);
  const focusIdx = (idx: number) => {
    const total = AGENDA_SECTIONS.length;
    const next = ((idx % total) + total) % total;
    linkRefs.current[next]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>, idx: number) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault(); focusIdx(idx + 1); return;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault(); focusIdx(idx - 1); return;
      case 'Home':
        e.preventDefault(); focusIdx(0); return;
      case 'End':
        e.preventDefault(); focusIdx(AGENDA_SECTIONS.length - 1); return;
      case 'Enter':
      case ' ':
        e.preventDefault(); jumpTo(AGENDA_SECTIONS[idx].id); return;
      default: return;
    }
  };
  const inner = (
    <div style={{ padding: '32px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <SectionTitle>Agenda</SectionTitle>
          <label
            className="qir-no-print"
            title={prefersReduced && smooth ? 'Your system prefers reduced motion' : 'Toggle smooth scrolling for agenda links'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12,
              color: 'rgba(200,225,245,0.75)', cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span>Smooth scroll</span>
            <span
              role="switch"
              aria-checked={smooth}
              tabIndex={0}
              onClick={() => setSmooth(s => !s)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSmooth(s => !s); } }}
              style={{
                position: 'relative', width: 32, height: 18, borderRadius: 9,
                background: smooth ? 'rgba(80,140,255,0.55)' : 'rgba(120,170,255,0.18)',
                border: '1px solid rgba(120,170,255,0.3)', transition: 'background .15s',
                display: 'inline-block',
              }}
            >
              <span style={{
                position: 'absolute', top: 1, left: smooth ? 15 : 1, width: 14, height: 14,
                borderRadius: 7, background: '#dde8f8', transition: 'left .15s',
              }} />
            </span>
          </label>
        </div>
        <ol
          role="list"
          aria-label="Report sections"
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {AGENDA_SECTIONS.map((item, idx) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                ref={el => { linkRefs.current[idx] = el; }}
                onClick={e => handleClick(e, item.id)}
                onKeyDown={e => onKeyDown(e, idx)}
                aria-label={`${idx + 1}. ${item.label}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 14px',
                  borderRadius: RADIUS,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: TEXT_PRIMARY,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'background .2s, border-color .2s',
                  outline: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(40,90,150,0.18)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onFocus={e => {
                  e.currentTarget.style.background = 'rgba(40,90,150,0.22)';
                  e.currentTarget.style.borderColor = 'rgba(124,200,240,0.55)';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(124,200,240,0.25)';
                }}
                onBlur={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7cc8f0', minWidth: 22, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}.</span>
                <span>{item.label}</span>
              </a>
            </li>
          ))}
      </ol>
    </div>
  );
  if (embedded) return inner;
  return <Card className="glass-module qir-page-break">{inner}</Card>;
}

export function QuarterlyInsightsReportPage({ s, set, reset, save, print, canEdit, reportKey }: {
  s: ReportState;
  set: ReportSetState;
  reset: () => void;
  save?: () => void;
  print: () => void;
  canEdit?: boolean;
  reportKey?: string;
}) {
  const rk = reportKey || 'naitive.quarterlyReport.adhoc';
  const [actualsViewMode, setActualsViewMode] = useState<ActualsViewMode>('plan_vs_actuals');
  // Single source of truth: the dashboard header's Reporting Period selector
  // drives s.period / s.quarter / s.month for every section/widget.
  const insightsTf = useInsightsTimeframeOptional();
  const reportingPeriod = insightsTf?.reportingPeriod ?? null;
  useEffect(() => {
    if (!reportingPeriod) return;
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (reportingPeriod.view === 'month') {
      const m = /^(\d{4})-(\d{2})$/.exec(reportingPeriod.period);
      if (!m) return;
      const year = parseInt(m[1], 10);
      const month1 = parseInt(m[2], 10);
      const monthLabel = `${MONTH_NAMES[month1 - 1]} ${year}`;
      const q = Math.floor((month1 - 1) / 3) + 1;
      const quarterLabel = `Q${q} ${year}`;
      set(prev => (prev.period === 'monthly' && prev.quarter === quarterLabel && prev.month === monthLabel)
        ? prev
        : { ...prev, period: 'monthly', quarter: quarterLabel, month: monthLabel });
    } else {
      const m = /^(\d{4})-Q([1-4])$/.exec(reportingPeriod.period);
      if (!m) return;
      const year = parseInt(m[1], 10);
      const q = parseInt(m[2], 10);
      const quarterLabel = `Q${q} ${year}`;
      const firstMonthLabel = `${MONTH_NAMES[(q - 1) * 3]} ${year}`;
      set(prev => (prev.period === 'quarterly' && prev.quarter === quarterLabel && prev.month === firstMonthLabel)
        ? prev
        : { ...prev, period: 'quarterly', quarter: quarterLabel, month: firstMonthLabel });
    }
  }, [reportingPeriod, set]);
  const planRevenue = useMemo(() => {
    const k = s.kpis.find(x => /revenue/i.test(x.label));
    const n = Number(k?.target);
    return Number.isFinite(n) ? n : 0;
  }, [s.kpis]);
  const reportLabel = s.period === 'monthly'
    ? `Monthly Insights Report — ${s.month}`
    : `Quarterly Insights Report — ${s.quarter}`;
  const sectionThread = (sectionKey: string, label: string) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
      <QirCommentThread reportKey={rk} reportLabel={reportLabel} targetType="section" targetId={sectionKey} targetLabel={label} />
    </div>
  );
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, color: TEXT_PRIMARY }}>
      <ReportCoverSection s={s} set={set} />
      <ReportHeaderSection s={s} set={set} reset={reset} save={save} print={print} canEdit={canEdit} />
      <Card className="glass-module qir-unified-report">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div id="qir-section-summary" className="qir-unified-section">
            <ReportNarrativeSection s={s} set={set} />
            {sectionThread('summary', 'Executive Summary')}
          </div>
          <div id="qir-section-financials" className="qir-unified-section">
            <QuickBooksActualsPanel
              period={s.period}
              quarter={s.quarter}
              month={s.month}
              planRevenue={planRevenue}
              viewMode={actualsViewMode}
              onChangeViewMode={setActualsViewMode}
            />
            <ReportKpisSection s={s} set={set} reportLabel={reportLabel} />
            {sectionThread('financials', 'Revenue & Financial Performance')}
          </div>
          <div id="qir-section-pipeline" className="qir-unified-section">
            <ReportGoalsSection s={s} set={set} />
            {sectionThread('pipeline', 'Deal Pipeline')}
          </div>
          <div id="qir-section-metrics" className="qir-unified-section">
            <ReportInitiativesSection s={s} set={set} />
            {sectionThread('metrics', 'Key Metrics')}
          </div>
          <div id="qir-section-goals" className="qir-unified-section">
            <ReportRisksSection s={s} set={set} print={print} />
            {sectionThread('goals', 'Goals & Milestones')}
          </div>
          <div id="qir-section-commentary" className="qir-unified-section">
            <ReportFooterSection s={s} print={print} />
          </div>
        </div>
      </Card>
      <QirAllCommentsPanel reportKey={rk} reportLabel={reportLabel} />
    </div>
  );
}

export function QuarterlyReportPrintStyles() {
  useEffect(() => {
    const id = 'qir-print-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.innerHTML = `
      [id^="qir-section-"] { scroll-margin-top: 96px; }
      /* Unify subsections inside the single Monthly/Quarterly report card. */
      .qir-unified-report > div > .qir-unified-section + .qir-unified-section {
        border-top: 1px solid rgba(120,170,255,0.10);
        margin-top: 8px;
        padding-top: 16px;
      }
      .qir-unified-report .qir-unified-section [class*="glass-module"],
      .qir-unified-report .qir-unified-section .glass-module {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
      }
      @media print {
        body { background: #ffffff !important; }
        .qir-no-print { display: none !important; }
        .qir-page-break { page-break-after: always; break-after: page; }
        [id^="qir-section-"] { break-before: page; page-break-before: always; }
        [id="qir-section-summary"] { break-before: auto; page-break-before: auto; }
      }
    `;
    document.head.appendChild(el);
  }, []);
  return null;
}
