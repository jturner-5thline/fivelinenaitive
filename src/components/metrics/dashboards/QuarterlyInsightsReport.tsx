import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Printer, RotateCcw, RefreshCw, ExternalLink, Link2 } from 'lucide-react';
import { useAsanaGoals, type AsanaGoalRow } from '@/hooks/useAsanaGoals';

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
  'Mark Kaleniecki', 'Chandler Minaldi', 'Paz Pina', 'McKenzie Clark',
  'Hayden Krug', 'Jennifer Rivera', 'Tyler Robinson', 'Kris Lawless',
  'Niki Heikali', 'Siddhi Bhangale', 'Gaby Good',
];
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
        borderRadius: 999,
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

export function useQuarterlyReportState(initialState?: ReportState) {
  const [state, setState] = useState<ReportState>(() => initialState ? createQuarterlyReportSeed(initialState) : cloneSeed());
  const reset = () => setState(initialState ? createQuarterlyReportSeed(initialState) : cloneSeed());
  const print = () => { try { window.print(); } catch {} };
  return { state, setState, reset, print };
}

function formatKPI(value: string, format: KPIFormat): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (format === 'currency') {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
    return `$${n.toFixed(0)}`;
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

function ReportHeaderSection({ s, set, reset, print }: { s: ReportState; set: ReportSetState; reset: () => void; print: () => void }) {
  return (
    <Card>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: TEXT_LABEL }}>
              5th Line Capital Advisors
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: TEXT_PRIMARY, letterSpacing: '-.2px' }}>
              {s.period === 'monthly'
                ? `Monthly Insights Report — ${s.month || s.quarter}`
                : `Quarterly Insights Report — ${s.quarter}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon={RotateCcw} variant="ghost" onClick={reset}>Reset</Btn>
            <Btn icon={Printer} onClick={print}>Print / Export</Btn>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', borderRadius: 8, border: INPUT_BORDER, overflow: 'hidden' }}>
            {(['monthly', 'quarterly'] as const).map(period => (
              <button
                key={period}
                onClick={() => set(prev => ({ ...prev, period }))}
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  background: s.period === period ? 'rgba(40,110,180,0.55)' : 'transparent',
                  color: s.period === period ? '#e8f4ff' : TEXT_MUTED,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {period}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Quarter</span>
            <select
              value={s.quarter}
              onChange={e => {
                const newQuarter = e.target.value;
                set(prev => {
                  const validMonths = monthsForQuarter(newQuarter);
                  const monthStillValid = validMonths.includes(prev.month);
                  return {
                    ...prev,
                    quarter: newQuarter,
                    month: monthStillValid ? prev.month : (validMonths[0] || ''),
                  };
                });
              }}
              style={{ ...selectStyle, width: 130 }}
            >
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          {s.period === 'monthly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Month</span>
              <select
                value={monthsForQuarter(s.quarter).includes(s.month) ? s.month : (monthsForQuarter(s.quarter)[0] || '')}
                onChange={e => set(prev => ({ ...prev, month: e.target.value }))}
                style={{ ...selectStyle, width: 150 }}
              >
                {monthsForQuarter(s.quarter).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

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

function ReportKpisSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  const updateKPI = (id: string, patch: Partial<KPI>) => set(prev => ({ ...prev, kpis: prev.kpis.map(k => k.id === id ? { ...k, ...patch } : k) }));
  const removeKPI = (id: string) => set(prev => ({ ...prev, kpis: prev.kpis.filter(k => k.id !== id) }));
  const addKPI = () => set(prev => ({ ...prev, kpis: [...prev.kpis, { id: uid(), label: 'New KPI', actual: '0', target: '0', format: 'number' }] }));

  return (
    <Card>
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
    </Card>
  );
}

function ReportNarrativeSection({ s, set }: { s: ReportState; set: ReportSetState }) {
  return (
    <Card>
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

  const preparedBy = s.authors[0] || 'James Turner';
  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const preparedByKey = normalize(preparedBy);
  const visibleGoals = useMemo(
    () => asanaGoals.filter(g => g.owner && normalize(g.owner) === preparedByKey),
    [asanaGoals, preparedByKey]
  );

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
  const showOwnerEmpty = !showSkeleton && !showEmpty && !error && visibleGoals.length === 0;

  const renderOwnerEmpty = () => (
    <div style={{
      padding: '24px 18px',
      textAlign: 'center',
      color: TEXT_MUTED,
      fontSize: 12,
      border: '1px dashed rgba(120,170,255,0.18)',
      borderRadius: RADIUS,
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ fontWeight: 600, color: TEXT_PRIMARY }}>No goals found for {preparedBy}</div>
    </div>
  );

  return (
    <Card>
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={headerRight}>Goals</SectionTitle>
        {error && renderError()}
        {showSkeleton ? renderSkeleton() : showEmpty ? renderEmpty() : showOwnerEmpty ? renderOwnerEmpty() : (
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

  const filteredInits = useMemo(
    () => s.initiativeOwnerFilter === 'All' ? s.initiatives : s.initiatives.filter(init => init.owner === s.initiativeOwnerFilter),
    [s.initiatives, s.initiativeOwnerFilter],
  );
  const counts = useMemo(() => ({
    onTrack: filteredInits.filter(init => init.status === 'On Track').length,
    atRisk: filteredInits.filter(init => init.status === 'At Risk').length,
    offTrack: filteredInits.filter(init => init.status === 'Off Track').length,
  }), [filteredInits]);

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: TEXT_PRIMARY, verticalAlign: 'middle', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  return (
    <Card>
      <div style={{ padding: '16px 18px' }}>
        <SectionTitle right={<Btn icon={Plus} variant="ghost" onClick={addInit}>Add Goal</Btn>}>Initiatives</SectionTitle>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Owner</span>
            <select value={s.initiativeOwnerFilter} onChange={e => set(prev => ({ ...prev, initiativeOwnerFilter: e.target.value }))} style={{ ...selectStyle, width: 180 }}>
              <option value="All">All Owners</option>
              {PEOPLE.map(person => <option key={person} value={person}>{person}</option>)}
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
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
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
                    <select value={init.owner} onChange={e => updateInit(init.id, { owner: e.target.value })} style={selectStyle}>
                      {PEOPLE.map(person => <option key={person} value={person}>{person}</option>)}
                    </select>
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
    <Card>
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
    <Card>
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

export function QuarterlyInsightsReportPage({ s, set, reset, print }: {
  s: ReportState;
  set: ReportSetState;
  reset: () => void;
  print: () => void;
}) {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, color: TEXT_PRIMARY }}>
      <ReportHeaderSection s={s} set={set} reset={reset} print={print} />
      <ReportKpisSection s={s} set={set} />
      <ReportNarrativeSection s={s} set={set} />
      <ReportGoalsSection s={s} set={set} />
      <ReportInitiativesSection s={s} set={set} />
      <ReportRisksSection s={s} set={set} print={print} />
      <ReportFooterSection s={s} print={print} />
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
      @media print {
        body { background: #ffffff !important; }
        .qir-no-print { display: none !important; }
      }
    `;
    document.head.appendChild(el);
  }, []);
  return null;
}
