import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, RotateCcw, RefreshCw, ExternalLink, Link2, SlidersHorizontal, Save as SaveIcon, Loader2, Pencil, X as XIcon } from 'lucide-react';
import { useCompanyDashboardConfig } from '@/hooks/useCompanyDashboardConfig';
import { toast as sonnerToast } from 'sonner';
import { useAsanaGoals, type AsanaGoalRow } from '@/hooks/useAsanaGoals';
import { useAsanaPortfolioProjects, type AsanaPortfolioProjectRow } from '@/hooks/useAsanaPortfolioProjects';
import { useAsanaPortfolios } from '@/hooks/useAsanaPortfolios';
import { useAsanaGoalFilterPrefs } from '@/hooks/useAsanaGoalFilterPrefs';
import { useSortGroup, type SortGroupColumn } from './qir/useSortGroup';
import { SortGroupToolbar } from './qir/SortGroupToolbar';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import naitiveLogoDark from '@/assets/naitive-logo-dark.png';
import { QirContextualComments } from './qir/QirContextualComments';
import { InsightsDrilldownDrawer, type DrilldownColumn, type DrilldownContext } from '../insights/InsightsDrilldownDrawer';
import { KpiDrillDownDialog, type KpiLike } from './qir/KpiDrillDownDialog';
import { QirSummaryView } from './qir/QirSummaryView';
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

  const PREPARED_BY_OPTIONS = ['James Turner', 'John Moffitt', 'Scott Williams', 'McKenzie Clark'];
  const currentPreparedBy = s.authors[0] && PREPARED_BY_OPTIONS.includes(s.authors[0])
    ? s.authors[0]
    : 'James Turner';
  const reportTitle = s.period === 'monthly'
    ? `Monthly Insights Report — ${monthsForQuarter(s.quarter).includes(s.month) ? s.month : (monthsForQuarter(s.quarter)[0] || s.quarter)}`
    : `Quarterly Insights Report — ${s.quarter}`;
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.1em', color: TEXT_LABEL,
  };
  return (
    <Card className="glass-module">
      <div style={{
        padding: '20px 22px',
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'minmax(280px, 2fr) minmax(140px, 1fr) minmax(160px, 1fr)',
        alignItems: 'end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabelStyle}>Report</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-.2px', lineHeight: 1.25 }}>
            {reportTitle}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={fieldLabelStyle} htmlFor="qir-date-prepared">Date Prepared</label>
          <input
            id="qir-date-prepared"
            value={s.preparedDate}
            onChange={e => set(prev => ({ ...prev, preparedDate: e.target.value }))}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={fieldLabelStyle} htmlFor="qir-prepared-by">Prepared By</label>
          <select
            id="qir-prepared-by"
            value={currentPreparedBy}
            onChange={e => set(prev => ({ ...prev, authors: [e.target.value] }))}
            style={{ ...selectStyle, width: '100%' }}
          >
            {PREPARED_BY_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const MAX_KPIS = 5;
  const visibleKpis = s.kpis.slice(0, MAX_KPIS);
  const canAdd = s.kpis.length < MAX_KPIS;

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={
          <span title={canAdd ? '' : `Max ${MAX_KPIS} KPIs`}>
            <Btn icon={Plus} variant="ghost" onClick={canAdd ? addKPI : undefined}>Add KPI</Btn>
          </span>
        }>KPIs</SectionTitle>
        <div style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        }}>
          {visibleKpis.map(kpi => {
            const status = deriveStatus(kpi.actual, kpi.target);
            const tone = status === 'Above Plan' ? 'pos' : status === 'On Plan' ? 'neu' : 'neg';
            const isEditing = editingId === kpi.id;
            return (
              <div
                key={kpi.id}
                data-comment-source="kpi"
                data-comment-source-id={kpi.id}
                data-comment-source-label={`KPI · ${kpi.label}`}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 8,
                  padding: 14,
                  borderRadius: RADIUS,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
                role="button"
                tabIndex={0}
                title="View metric details"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('input, select, textarea, button, [data-kpi-edit]')) return;
                  setDrillKpi(kpi as unknown as KpiLike);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    const target = e.target as HTMLElement;
                    if (target.closest('input, select, textarea, button, [data-kpi-edit]')) return;
                    e.preventDefault();
                    setDrillKpi(kpi as unknown as KpiLike);
                  }
                }}
              >
                {/* Top-right edit / remove buttons */}
                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}>
                  <button
                    type="button"
                    aria-label="Edit KPI"
                    onClick={(e) => { e.stopPropagation(); setEditingId(isEditing ? null : kpi.id); }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: TEXT_LABEL,
                      cursor: 'pointer',
                      padding: 4,
                      borderRadius: 6,
                      display: 'inline-flex',
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                </div>

                {/* Label */}
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  color: TEXT_LABEL,
                  maxWidth: '100%',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{kpi.label}</div>

                {/* Value */}
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}>{formatKPI(kpi.actual, kpi.format)}</div>

                {/* Footer: target + status pill */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                  <span style={{ fontSize: 10, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    Target {formatKPI(kpi.target, kpi.format)}
                  </span>
                  <Pill tone={tone}>{status}</Pill>
                </div>

                {/* Inline editor popover */}
                {isEditing && (
                  <div
                    data-kpi-edit
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(12,18,28,0.96)',
                      border: '1px solid rgba(120,170,255,0.25)',
                      borderRadius: RADIUS,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      zIndex: 2,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Edit KPI</span>
                      <button type="button" aria-label="Close editor" onClick={() => setEditingId(null)} style={{ background: 'transparent', border: 'none', color: TEXT_LABEL, cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
                        <XIcon size={12} />
                      </button>
                    </div>
                    <label style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Label</label>
                    <input value={kpi.label} onChange={e => updateKPI(kpi.id, { label: e.target.value })} placeholder="Metric label" style={inputStyle} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <label style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Actual</label>
                        <input value={kpi.actual} onChange={e => updateKPI(kpi.id, { actual: e.target.value })} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Target</label>
                        <input value={kpi.target} onChange={e => updateKPI(kpi.id, { target: e.target.value })} style={inputStyle} />
                      </div>
                    </div>
                    <label style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Format</label>
                    <select value={kpi.format} onChange={e => updateKPI(kpi.id, { format: e.target.value as KPIFormat })} style={selectStyle}>
                      <option value="currency">$ Currency</option>
                      <option value="percent">% Percent</option>
                      <option value="number"># Whole number</option>
                    </select>
                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Btn icon={Trash2} variant="danger" ariaLabel="Remove KPI" onClick={() => { removeKPI(kpi.id); setEditingId(null); }}>Remove</Btn>
                      <Btn variant="ghost" onClick={() => setEditingId(null)}>Done</Btn>
                    </div>
                  </div>
                )}
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
  const insightsTf = useInsightsTimeframeOptional();
  const reportingPeriod = insightsTf?.reportingPeriod ?? null;

  // Derive the active reporting year from the shared header selector first,
  // falling back to the local report state (quarter/month) if the header
  // context is unavailable.
  const activeYear = useMemo<number | null>(() => {
    if (reportingPeriod) {
      const m = /(\d{4})/.exec(reportingPeriod.period || '') || /(\d{4})/.exec(reportingPeriod.label || '');
      if (m) return parseInt(m[1], 10);
    }
    const fromQuarter = /(\d{4})/.exec(s.quarter || '');
    if (fromQuarter) return parseInt(fromQuarter[1], 10);
    const fromMonth = /(\d{4})/.exec(s.month || '');
    if (fromMonth) return parseInt(fromMonth[1], 10);
    return null;
  }, [reportingPeriod, s.quarter, s.month]);

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

  // Extract a year from a goal's time period (e.g. "Q2 FY26", "Q2 2026",
  // "H1 FY2026"), falling back to the goal's due date year when the time
  // period string lacks a year token. Returns null when nothing reliable is
  // available so we can safely exclude the goal.
  const goalYear = (g: AsanaGoalRow): number | null => {
    const tp = (g.timePeriod || '').trim();
    if (tp) {
      const fy = /fy\s*'?\s*(\d{2,4})/i.exec(tp);
      if (fy) {
        const n = fy[1].length === 2 ? 2000 + parseInt(fy[1], 10) : parseInt(fy[1], 10);
        return n;
      }
      const yr = /\b(20\d{2})\b/.exec(tp);
      if (yr) return parseInt(yr[1], 10);
      const yr2 = /\b([qh][1-4])\s+'?(\d{2})\b/i.exec(tp);
      if (yr2) return 2000 + parseInt(yr2[2], 10);
    }
    if (g.due) {
      const m = /^(\d{4})/.exec(g.due);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  };

  const ownerGoals = useMemo(
    () => asanaGoals.filter(g => {
      if (!g.owner || normalize(g.owner) !== preparedByKey) return false;
      if (activeYear == null) return true;
      const y = goalYear(g);
      return y === activeYear;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asanaGoals, preparedByKey, activeYear]
  );
  const visibleGoals = useMemo(
    () => ownerGoals,
    [ownerGoals]
  );

  // Sort + group controls for Goals.
  const goalStatusRank: Record<string, number> = { 'Off Track': 0, 'Behind': 0, 'At Risk': 1, 'On Track': 2, 'Achieved': 3 };
  const goalColumns: SortGroupColumn<AsanaGoalRow>[] = [
    { id: 'title', label: 'Title', accessor: g => g.title?.toLowerCase() || '', sortable: true },
    { id: 'owner', label: 'Owner', accessor: g => g.owner || '', sortable: true, groupable: true },
    { id: 'status', label: 'Status', accessor: g => goalStatusRank[g.status] ?? 99, sortable: true },
    { id: 'statusGroup', label: 'Status', accessor: g => g.status || '—', groupable: true },
    { id: 'period', label: 'Time Period', accessor: g => g.timePeriod || '', sortable: true, groupable: true },
    { id: 'source', label: 'Source', accessor: g => 'Asana', sortable: true, groupable: true },
  ];
  const goalsSG = useSortGroup<AsanaGoalRow>({
    rows: visibleGoals,
    columns: goalColumns,
    defaultSortBy: 'period',
    defaultSortDir: 'asc',
    defaultGroupBy: 'statusGroup',
  });

  // Drilldown state — opens a right-side drawer with filtered goal records.
  const [goalsDrill, setGoalsDrill] = useState<DrilldownContext | null>(null);
  const goalsDrillRows = useMemo<AsanaGoalRow[]>(() => {
    if (!goalsDrill) return [];
    if (goalsDrill.sourceId.startsWith('goal:')) {
      const id = goalsDrill.sourceId.slice('goal:'.length);
      return visibleGoals.filter(g => g.id === id);
    }
    if (goalsDrill.sourceId.startsWith('goals:status:')) {
      const status = goalsDrill.sourceId.slice('goals:status:'.length);
      return visibleGoals.filter(g => g.status === status);
    }
    if (goalsDrill.sourceId === 'goals:all') return visibleGoals;
    return [];
  }, [goalsDrill, visibleGoals]);
  const goalsDrillColumns: DrilldownColumn<AsanaGoalRow>[] = [
    { key: 'title', label: 'Goal', render: (g) => g.title },
    { key: 'owner', label: 'Owner', width: 140, render: (g) => g.owner || '—' },
    { key: 'status', label: 'Status', width: 110, render: (g) => <Pill tone={statusTone(g.status)}>{g.status}</Pill> },
    { key: 'period', label: 'Period', width: 100, render: (g) => g.timePeriod || '—' },
    { key: 'progress', label: 'Progress', width: 100, align: 'right', render: (g) => g.progressDisplay || (g.progressPercent != null ? `${Math.round(g.progressPercent)}%` : '—') },
  ];

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
      <div style={{ fontWeight: 600, color: TEXT_PRIMARY }}>
        No Asana goals owned by {preparedBy} for the current selection
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
            <SortGroupToolbar
              groupBy={goalsSG.groupBy}
              setGroupBy={goalsSG.setGroupBy}
              sortBy={goalsSG.sortBy}
              sortDir={goalsSG.sortDir}
              setSortBy={goalsSG.setSortBy}
              setSortDir={goalsSG.setSortDir}
              groupOptions={[
                { id: 'statusGroup', label: 'Status' },
                { id: 'owner', label: 'Owner' },
                { id: 'period', label: 'Time Period' },
              ]}
              sortOptions={[
                { id: 'title', label: 'Title' },
                { id: 'owner', label: 'Owner' },
                { id: 'status', label: 'Status' },
                { id: 'period', label: 'Time Period' },
              ]}
            />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 36 }}>#</th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => goalsSG.toggleSort('title')}>Title{goalsSG.indicator('title')}</th>
                  <th style={{ ...thStyle, width: 170, cursor: 'pointer' }} onClick={() => goalsSG.toggleSort('owner')}>Owner{goalsSG.indicator('owner')}</th>
                  <th style={{ ...thStyle, width: 110, cursor: 'pointer' }} onClick={() => goalsSG.toggleSort('status')}>Status{goalsSG.indicator('status')}</th>
                  <th style={{ ...thStyle, width: 120, cursor: 'pointer' }} onClick={() => goalsSG.toggleSort('period')}>Time Period{goalsSG.indicator('period')}</th>
                </tr>
              </thead>
              <tbody>
                {goalsSG.groups.map((group, gi) => (
                  <React.Fragment key={`g-${gi}-${group.key}`}>
                    {goalsSG.groupBy && (
                      <tr
                        onClick={() => setGoalsDrill({
                          sourceId: goalsSG.groupBy === 'statusGroup' ? `goals:status:${group.key}` : 'goals:all',
                          sourceLabel: `Goals · ${group.key}`,
                          selection: `${group.rows.length} goal${group.rows.length === 1 ? '' : 's'}`,
                          periodLabel: activeQuarterLabel || activeHalfLabel || undefined,
                          filters: [{ label: 'Owner', value: preparedBy }],
                        })}
                        style={{ cursor: 'pointer' }}
                      >
                        <td colSpan={5} style={{ padding: '10px 10px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: TEXT_LABEL, background: 'rgba(255,255,255,0.02)' }}>
                          {group.key} <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>· {group.rows.length}</span>
                        </td>
                      </tr>
                    )}
                    {group.rows.map((goal: AsanaGoalRow, index: number) => (
                      <tr
                        key={goal.id}
                        data-comment-source="goal"
                        data-comment-source-id={goal.id}
                        data-comment-source-label={`Goal · ${goal.title}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('a, button')) return;
                          setGoalsDrill({
                            sourceId: `goal:${goal.id}`,
                            sourceLabel: `Goal · ${goal.title}`,
                            selection: goal.timePeriod || undefined,
                            periodLabel: activeQuarterLabel || activeHalfLabel || undefined,
                            filters: [
                              { label: 'Owner', value: goal.owner || preparedBy },
                              { label: 'Status', value: goal.status },
                            ],
                          });
                        }}
                        style={{ cursor: 'pointer' }}
                      >
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
                    <td style={{ ...tdStyle, color: TEXT_PRIMARY }}>
                      {goal.timePeriod || <span style={{ color: TEXT_LABEL }}>—</span>}
                    </td>
                  </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <InsightsDrilldownDrawer
        open={!!goalsDrill}
        context={goalsDrill}
        onClose={() => setGoalsDrill(null)}
        columns={goalsDrillColumns}
        rows={goalsDrillRows}
        rowHref={(g) => g.url || null}
        emptyHint="No goals match this selection for the active period and owner."
      />
    </Card>
  );
}

function ReportInitiativesSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  const preparedBy = s.authors[0] || 'James Turner';
  // Initiatives sourced live from a user-selectable Asana Portfolio.
  const DEFAULT_PORTFOLIO_GID = '1212153276296114';
  const LEGACY_PORTFOLIO_GIDS = ['1212153276296112'];
  const PORTFOLIO_PREF_KEY = 'qir.initiatives.portfolioGid';
  const [portfolioGid, setPortfolioGid] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PORTFOLIO_PREF_KEY);
      if (!stored || LEGACY_PORTFOLIO_GIDS.includes(stored)) return DEFAULT_PORTFOLIO_GID;
      return stored;
    } catch { return DEFAULT_PORTFOLIO_GID; }
  });
  useEffect(() => {
    try { localStorage.setItem(PORTFOLIO_PREF_KEY, portfolioGid); } catch { /* ignore */ }
  }, [portfolioGid]);
  const { portfolios: availablePortfolios, loading: portfoliosLoading } = useAsanaPortfolios();
  const { projects, loading, error, lastSyncedAt, configured, refresh } = useAsanaPortfolioProjects(portfolioGid);

  const normName = (v: string) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normEmail = (v: string) => (v || '').trim().toLowerCase();
  // Known email aliases per Prepared By user. Lets us match initiatives whose
  // Asana owner field returns only an email or a slightly different display name.
  const PREPARED_BY_ALIASES: Record<string, { names: string[]; emails: string[] }> = {
    'james turner': {
      names: ['james turner', 'jturner', 'james t', 'james turner jr'],
      emails: ['james@5thline.com', 'jturner@5thline.com', 'james.turner@5thline.com', 'james@naitive.co', 'jturner@naitive.co'],
    },
    'john moffitt': { names: ['john moffitt', 'jmoffitt'], emails: ['john@5thline.com', 'john.moffitt@5thline.com'] },
    'scott williams': { names: ['scott williams'], emails: ['scott@5thline.com', 'scott.williams@5thline.com'] },
    'mckenzie clark': { names: ['mckenzie clark'], emails: ['mckenzie@5thline.com', 'mckenzie.clark@5thline.com'] },
  };
  const preparedByKey = normName(preparedBy);
  const aliases = PREPARED_BY_ALIASES[preparedByKey] || { names: [preparedByKey], emails: [] };
  const aliasNameSet = new Set([preparedByKey, ...aliases.names.map(normName)]);
  const aliasEmailSet = new Set(aliases.emails.map(normEmail));

  const projectMatchesPreparedBy = (p: AsanaPortfolioProjectRow): boolean => {
    const pool: Array<{ name: string | null; email: string | null }> = [
      { name: p.owner, email: p.ownerEmail },
      ...((p.ownerCandidates || []) as Array<{ name: string | null; email: string | null }>),
    ];
    for (const c of pool) {
      if (c.name && aliasNameSet.has(normName(c.name))) return true;
      if (c.email && aliasEmailSet.has(normEmail(c.email))) return true;
    }
    return false;
  };

  const ownedProjects = useMemo(
    () => projects.filter(projectMatchesPreparedBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, preparedByKey],
  );

  // Debug: surface owner mapping per project so we can audit James-Turner-owned
  // initiatives that aren't matching. View in browser console.
  useEffect(() => {
    if (!projects.length) return;
    // eslint-disable-next-line no-console
    console.debug('[Initiatives] portfolio=%s preparedBy=%s', portfolioGid, preparedBy,
      projects.map(p => ({
        name: p.name,
        owner: p.owner,
        ownerEmail: p.ownerEmail,
        ownerSource: p.ownerSource,
        candidates: p.ownerCandidates,
        matched: projectMatchesPreparedBy(p),
      })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, preparedByKey, portfolioGid]);
  const counts = useMemo(() => ({
    onTrack: ownedProjects.filter(p => p.status === 'On Track').length,
    atRisk: ownedProjects.filter(p => p.status === 'At Risk').length,
    offTrack: ownedProjects.filter(p => p.status === 'Off Track').length,
  }), [ownedProjects]);

  const initStatusRank: Record<string, number> = { 'Off Track': 0, 'At Risk': 1, 'On Hold': 2, 'On Track': 3, 'Complete': 4, 'No Status': 5 };
  const initColumns: SortGroupColumn<AsanaPortfolioProjectRow>[] = [
    { id: 'name', label: 'Name', accessor: p => p.name?.toLowerCase() || '', sortable: true },
    { id: 'owner', label: 'Owner', accessor: p => p.owner || '', sortable: true, groupable: true },
    { id: 'statusSort', label: 'Status', accessor: p => initStatusRank[p.status] ?? 99, sortable: true },
    { id: 'status', label: 'Status', accessor: p => p.status || '—', groupable: true },
    { id: 'due', label: 'Due Date', accessor: p => p.dueOn || null, sortable: true },
    { id: 'source', label: 'Source', accessor: () => 'Asana', groupable: true },
  ];
  const initSG = useSortGroup<AsanaPortfolioProjectRow>({
    rows: ownedProjects,
    columns: initColumns,
    defaultSortBy: 'name',
    defaultSortDir: 'asc',
    defaultGroupBy: 'status',
  });

  const [initDrill, setInitDrill] = useState<DrilldownContext | null>(null);
  const initDrillRows = useMemo<AsanaPortfolioProjectRow[]>(() => {
    if (!initDrill) return [];
    if (initDrill.sourceId.startsWith('init:')) {
      const gid = initDrill.sourceId.slice('init:'.length);
      return ownedProjects.filter(p => p.gid === gid);
    }
    if (initDrill.sourceId.startsWith('init:status:')) {
      const status = initDrill.sourceId.slice('init:status:'.length);
      return ownedProjects.filter(p => p.status === status);
    }
    if (initDrill.sourceId === 'init:all') return ownedProjects;
    return [];
  }, [initDrill, ownedProjects]);
  const initDrillColumns: DrilldownColumn<AsanaPortfolioProjectRow>[] = [
    { key: 'name', label: 'Initiative', render: (p) => p.name },
    { key: 'owner', label: 'Owner', width: 140, render: (p) => p.owner || '—' },
    { key: 'status', label: 'Status', width: 120, render: (p) => <Pill tone={statusTone(p.status === 'Off Track' ? 'Off Track' : p.status === 'At Risk' ? 'At Risk' : p.status === 'On Track' ? 'On Track' : 'On Track')}>{p.status}</Pill> },
    { key: 'due', label: 'Due', width: 100, render: (p) => p.dueOn || '—' },
  ];

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: TEXT_PRIMARY, verticalAlign: 'middle', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={portfolioGid}
              onChange={(e) => setPortfolioGid(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: TEXT_PRIMARY,
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                maxWidth: 220,
              }}
              title="Asana portfolio source"
            >
              {!availablePortfolios.some(p => p.gid === portfolioGid) && (
                <option value={portfolioGid}>
                  {portfolioGid === DEFAULT_PORTFOLIO_GID ? 'Default portfolio' : `Portfolio ${portfolioGid}`}
                </option>
              )}
              {availablePortfolios.map(p => (
                <option key={p.gid} value={p.gid}>{p.name}</option>
              ))}
              {portfoliosLoading && availablePortfolios.length === 0 && (
                <option value={portfolioGid} disabled>Loading portfolios…</option>
              )}
            </select>
            {lastSyncedAt && (
              <span style={{ fontSize: 10, color: TEXT_LABEL }}>
                Synced {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Btn icon={RefreshCw} variant="ghost" onClick={() => { void refresh(); }}>
              {loading ? 'Syncing…' : 'Sync'}
            </Btn>
          </div>
        )}>Initiatives</SectionTitle>

        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 10 }}>
          Sourced from Asana portfolio · Owner: <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{preparedBy}</span>
          <span style={{ marginLeft: 8, display: 'inline-flex', gap: 6 }}>
            <span role="button" style={{ cursor: 'pointer' }} onClick={() => setInitDrill({ sourceId: 'init:status:On Track', sourceLabel: 'Initiatives · On Track', selection: `${counts.onTrack} initiative${counts.onTrack === 1 ? '' : 's'}`, filters: [{ label: 'Owner', value: preparedBy }] })}>
              <Pill tone="pos">On Track · {counts.onTrack}</Pill>
            </span>
            <span role="button" style={{ cursor: 'pointer' }} onClick={() => setInitDrill({ sourceId: 'init:status:At Risk', sourceLabel: 'Initiatives · At Risk', selection: `${counts.atRisk} initiative${counts.atRisk === 1 ? '' : 's'}`, filters: [{ label: 'Owner', value: preparedBy }] })}>
              <Pill tone="neu">At Risk · {counts.atRisk}</Pill>
            </span>
            <span role="button" style={{ cursor: 'pointer' }} onClick={() => setInitDrill({ sourceId: 'init:status:Off Track', sourceLabel: 'Initiatives · Off Track', selection: `${counts.offTrack} initiative${counts.offTrack === 1 ? '' : 's'}`, filters: [{ label: 'Owner', value: preparedBy }] })}>
              <Pill tone="neg">Off Track · {counts.offTrack}</Pill>
            </span>
          </span>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', fontSize: 11, color: '#f08585', background: 'rgba(220,80,80,0.08)', border: '1px solid rgba(220,80,80,0.2)', borderRadius: 8, marginBottom: 10 }}>
            Asana sync error: {error}
          </div>
        )}

        {!configured && !loading ? (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: TEXT_MUTED, fontSize: 12, border: '1px dashed rgba(120,170,255,0.18)', borderRadius: RADIUS, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 4 }}>Asana not connected</div>
            <div>Connect Asana to sync portfolio initiatives.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <SortGroupToolbar
              groupBy={initSG.groupBy}
              setGroupBy={initSG.setGroupBy}
              sortBy={initSG.sortBy}
              sortDir={initSG.sortDir}
              setSortBy={initSG.setSortBy}
              setSortDir={initSG.setSortDir}
              groupOptions={[
                { id: 'status', label: 'Status' },
                { id: 'owner', label: 'Owner' },
                { id: 'source', label: 'Source' },
              ]}
              sortOptions={[
                { id: 'name', label: 'Name' },
                { id: 'owner', label: 'Owner' },
                { id: 'statusSort', label: 'Status' },
                { id: 'due', label: 'Due Date' },
              ]}
            />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 36 }}>#</th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => initSG.toggleSort('name')}>Title{initSG.indicator('name')}</th>
                  <th style={{ ...thStyle, width: 130, cursor: 'pointer' }} onClick={() => initSG.toggleSort('statusSort')}>Status{initSG.indicator('statusSort')}</th>
                  <th style={{ ...thStyle, width: 170, cursor: 'pointer' }} onClick={() => initSG.toggleSort('owner')}>Owner{initSG.indicator('owner')}</th>
                  <th style={{ ...thStyle, width: 120, cursor: 'pointer' }} onClick={() => initSG.toggleSort('due')}>Due Date{initSG.indicator('due')}</th>
                  <th style={{ ...thStyle, width: 70 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {initSG.groups.map((group, gi) => (
                  <React.Fragment key={`ig-${gi}-${group.key}`}>
                    {initSG.groupBy && (
                      <tr
                        onClick={() => setInitDrill({
                          sourceId: initSG.groupBy === 'status' ? `init:status:${group.key}` : 'init:all',
                          sourceLabel: `Initiatives · ${group.key}`,
                          selection: `${group.rows.length} initiative${group.rows.length === 1 ? '' : 's'}`,
                          filters: [{ label: 'Owner', value: preparedBy }],
                        })}
                        style={{ cursor: 'pointer' }}
                      >
                        <td colSpan={6} style={{ padding: '10px 10px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: TEXT_LABEL, background: 'rgba(255,255,255,0.02)' }}>
                          {group.key} <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>· {group.rows.length}</span>
                        </td>
                      </tr>
                    )}
                    {group.rows.map((p, idx) => (
                      <tr
                        key={p.gid}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('a, button')) return;
                          setInitDrill({
                            sourceId: `init:${p.gid}`,
                            sourceLabel: `Initiative · ${p.name}`,
                            selection: p.dueOn ? `Due ${p.dueOn}` : undefined,
                            filters: [
                              { label: 'Owner', value: p.owner || preparedBy },
                              { label: 'Status', value: p.status },
                            ],
                          });
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                    <td style={{ ...tdStyle, color: TEXT_LABEL, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                    <td style={tdStyle}>
                      {p.permalink_url ? (
                        <a href={p.permalink_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: TEXT_PRIMARY, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#7cc8f0'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT_PRIMARY; }}>
                          {p.name}
                          <ExternalLink size={11} style={{ opacity: 0.55 }} />
                        </a>
                      ) : (
                        <span>{p.name}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <Pill tone={statusTone(p.status === 'Off Track' ? 'Off Track' : p.status === 'At Risk' ? 'At Risk' : p.status === 'On Track' ? 'On Track' : 'On Track')}>{p.status}</Pill>
                    </td>
                    <td style={{ ...tdStyle, color: TEXT_PRIMARY }}>{p.owner || <span style={{ color: TEXT_LABEL }}>—</span>}</td>
                    <td style={{ ...tdStyle, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                      {p.dueOn || <span style={{ color: TEXT_LABEL }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: RADIUS_PILL, color: '#f0a45a', background: 'rgba(240,140,40,0.10)', border: '1px solid rgba(240,140,40,0.22)' }}>
                        Asana
                      </span>
                    </td>
                  </tr>
                    ))}
                  </React.Fragment>
                ))}
                {ownedProjects.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: TEXT_LABEL, padding: 20 }}>
                      No Asana portfolio initiatives owned by {preparedBy}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <InsightsDrilldownDrawer
        open={!!initDrill}
        context={initDrill}
        onClose={() => setInitDrill(null)}
        columns={initDrillColumns}
        rows={initDrillRows}
        rowHref={(p) => p.permalink_url || null}
        emptyHint="No initiatives match this selection in the active Asana portfolio."
      />
    </Card>
  );
}

function ReportRisksSection({ s, set, print }: { s: ReportState; set: ReportSetState; print: () => void }) {
  const updateRisk = (id: string, patch: Partial<Risk>) => set(prev => ({ ...prev, risks: prev.risks.map(risk => risk.id === id ? { ...risk, ...patch } : risk) }));
  const removeRisk = (id: string) => set(prev => ({ ...prev, risks: prev.risks.filter(risk => risk.id !== id) }));
  const addRisk = () => set(prev => ({ ...prev, risks: [...prev.risks, { id: uid(), description: '', mitigation: '' }] }));

  const [riskDrill, setRiskDrill] = useState<DrilldownContext | null>(null);
  const riskDrillRows = useMemo<Risk[]>(() => {
    if (!riskDrill) return [];
    if (riskDrill.sourceId.startsWith('risk:')) {
      const id = riskDrill.sourceId.slice('risk:'.length);
      return s.risks.filter(r => r.id === id);
    }
    return s.risks;
  }, [riskDrill, s.risks]);
  const riskDrillColumns: DrilldownColumn<Risk>[] = [
    { key: 'description', label: 'Risk', render: (r) => r.description || <span style={{ color: TEXT_LABEL }}>—</span> },
    { key: 'mitigation', label: 'Mitigation', render: (r) => r.mitigation || <span style={{ color: TEXT_LABEL }}>—</span> },
  ];

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid rgba(255,255,255,0.04)' };
  const taStyle: React.CSSProperties = { ...inputStyle, minHeight: 70, lineHeight: 1.5, padding: 10, resize: 'vertical', fontFamily: 'inherit' };

  return (
    <Card className="glass-module">
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={(
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon={ExternalLink} variant="ghost" onClick={() => setRiskDrill({ sourceId: 'risks:all', sourceLabel: 'Open Risks · All', selection: `${s.risks.length} risk${s.risks.length === 1 ? '' : 's'}` })}>View All</Btn>
            <Btn icon={Plus} variant="ghost" onClick={addRisk}>Add Risk</Btn>
          </div>
        )}>
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
                <tr key={risk.id} data-comment-source="risk" data-comment-source-id={risk.id} data-comment-source-label={`Risk · ${risk.description?.slice(0, 40) || 'Untitled risk'}`}>
                  <td style={{ ...tdStyle, width: '50%' }}>
                    <textarea value={risk.description} onChange={e => updateRisk(risk.id, { description: e.target.value })} placeholder="Describe the risk…" style={taStyle} />
                  </td>
                  <td style={{ ...tdStyle, width: '50%' }}>
                    <textarea value={risk.mitigation} onChange={e => updateRisk(risk.id, { mitigation: e.target.value })} placeholder="Mitigation plan…" style={taStyle} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Btn icon={ExternalLink} variant="ghost" ariaLabel="Drill into risk" onClick={() => setRiskDrill({ sourceId: `risk:${risk.id}`, sourceLabel: `Risk · ${risk.description?.slice(0, 60) || 'Untitled risk'}` })} />
                      <Btn icon={Trash2} variant="danger" ariaLabel="Remove risk" onClick={() => removeRisk(risk.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <InsightsDrilldownDrawer
        open={!!riskDrill}
        context={riskDrill}
        onClose={() => setRiskDrill(null)}
        columns={riskDrillColumns}
        rows={riskDrillRows}
        emptyHint="No open risks recorded for this report."
      />
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

export function ReportCoverSection({ s, set }: { s: ReportState; set: ReportSetState }) {
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
    <Card className="glass-module qir-page-break qir-cover-card">
      <div
        className="qir-cover-hero"
        style={{
          padding: '36px 36px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            <div className="qir-cover-title" style={{ fontSize: 34, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-.5px', lineHeight: 1.1 }}>
              {title}
            </div>
          )}

          <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, color: '#7cc8f0', letterSpacing: '.05em' }}>
            {effective.label}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14,
            paddingTop: 12,
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
    <div className="qir-agenda-inner" style={{ padding: embedded ? '20px 36px 28px' : '32px 36px' }}>
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
  const viewModeStorageKey = `qir:viewMode:${rk}`;
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>(() => {
    if (typeof window === 'undefined') return 'summary';
    try {
      const v = window.localStorage.getItem(viewModeStorageKey);
      return v === 'detailed' ? 'detailed' : 'summary';
    } catch { return 'summary'; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(viewModeStorageKey, viewMode); } catch { /* ignore */ }
  }, [viewMode, viewModeStorageKey]);
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
  const rootRef = React.useRef<HTMLDivElement>(null);
  const reportLabel = s.period === 'monthly'
    ? `Monthly Insights Report — ${s.month}`
    : `Quarterly Insights Report — ${s.quarter}`;
  return (
    <div ref={rootRef} style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, color: TEXT_PRIMARY }}>
      <ReportHeaderSection s={s} set={set} reset={reset} save={save} print={print} canEdit={canEdit} />
      <div
        className="qir-no-print"
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-end',
          padding: 3,
          background: 'rgba(10,18,36,0.6)',
          border: '1px solid rgba(120,170,255,0.18)',
          borderRadius: 999,
        }}
      >
        {(['summary', 'detailed'] as const).map(mode => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: active ? 'rgba(40,110,180,0.55)' : 'transparent',
                color: active ? '#e8f4ff' : TEXT_MUTED,
                transition: 'background .2s, color .2s',
              }}
            >
              {mode === 'summary' ? 'Summary' : 'Detailed'}
            </button>
          );
        })}
      </div>
      {viewMode === 'summary' ? (
        <QirSummaryView s={s} reportLabel={reportLabel} />
      ) : (
      <Card className="glass-module qir-unified-report">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div id="qir-section-summary" className="qir-unified-section">
            <ReportNarrativeSection s={s} set={set} />
          </div>
          <div id="qir-section-financials" className="qir-unified-section">
            <ReportKpisSection s={s} set={set} reportLabel={reportLabel} />
          </div>
          <div id="qir-section-pipeline" className="qir-unified-section">
            <ReportGoalsSection s={s} set={set} />
          </div>
          <div id="qir-section-metrics" className="qir-unified-section">
            <ReportInitiativesSection s={s} set={set} />
          </div>
          <div id="qir-section-goals" className="qir-unified-section">
            <ReportRisksSection s={s} set={set} print={print} />
          </div>
        </div>
      </Card>
      )}
      <QirContextualComments reportKey={rk} reportLabel={reportLabel} rootRef={rootRef} />
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
        /* 8 x 10 inch print target for the report front matter. */
        @page { size: 8in 10in; margin: 0.4in; }
        /* Combined Cover + Agenda must fit on a single 8x10 page. */
        .qir-cover-card { break-inside: avoid; page-break-inside: avoid; }
        .qir-cover-card .qir-cover-hero { padding: 0.15in 0.1in 0.1in !important; gap: 0.15in !important; }
        .qir-cover-card .qir-cover-title { font-size: 28pt !important; }
        .qir-cover-card .qir-agenda-inner { padding: 0.1in 0.1in 0.15in !important; }
        .qir-cover-card ol > li > a { padding: 6px 10px !important; font-size: 11pt !important; }
      }
    `;
    document.head.appendChild(el);
  }, []);
  return null;
}
