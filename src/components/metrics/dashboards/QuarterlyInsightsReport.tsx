import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Printer, RotateCcw } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────
   Quarterly Insights Report — 3 carousel pages embedded inside the existing
   ManagementReviewCarousel. Visual language matches the platform's Liquid
   Glass executive dashboards (deep-navy translucent surfaces, subtle accent
   borders, compact uppercase micro-labels, tabular numeric KPI values).
   All state is in-memory only. No backend, no localStorage.
   ───────────────────────────────────────────────────────────────────── */

/* ── Shared design tokens (match Weekly Rundown / KeyMetricsPage) ──── */
const SURFACE = 'rgba(16,28,52,0.75)';
const SURFACE_BORDER = '1px solid rgba(80,140,255,0.18)';
const SHEEN = 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.00) 55%)';
const RADIUS = 12;
const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';
const INPUT_BG = 'rgba(10,18,36,0.6)';
const INPUT_BORDER = '1px solid rgba(120,170,255,0.18)';

const PEOPLE = [
  'James Turner','John Moffitt','Florencia Fustinoni','Scott Williams',
  'Mark Kaleniecki','Chandler Minaldi','Paz Pina','McKenzie Clark',
  'Hayden Krug','Jennifer Rivera','Tyler Robinson','Kris Lawless',
  'Niki Heikali','Siddhi Bhangale','Gaby Good',
];
const PRIMARY_AUTHORS = ['James Turner','Scott Williams','John Moffitt'];
const QUARTERS = ['Q1 2026','Q2 2026','Q3 2026','Q4 2026','Q1 2027','Q2 2027','Q3 2027','Q4 2027'];

/* ── Primitives ──────────────────────────────────────────────────────── */
function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      position: 'relative', overflow: 'hidden', borderRadius: RADIUS,
      background: SURFACE, border: SURFACE_BORDER,
      backdropFilter: 'blur(20px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
      ...style,
    }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', background: SHEEN }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_LABEL, margin: 0 }}>{children}</h3>
      {right}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: INPUT_BG, border: INPUT_BORDER, borderRadius: 8,
  padding: '6px 10px', fontSize: 12, color: TEXT_PRIMARY, width: '100%',
  outline: 'none', fontVariantNumeric: 'tabular-nums',
};
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' };

function Btn({ children, onClick, variant = 'default', icon: Icon, ariaLabel }: {
  children?: React.ReactNode; onClick?: () => void; variant?: 'default' | 'ghost' | 'danger';
  icon?: React.ElementType; ariaLabel?: string;
}) {
  const variants: Record<string, React.CSSProperties> = {
    default: { background: 'rgba(40,90,150,0.35)', border: '1px solid rgba(80,150,220,0.25)', color: '#cfe6ff' },
    ghost:   { background: 'transparent', border: '1px solid rgba(120,170,255,0.18)', color: TEXT_MUTED },
    danger:  { background: 'transparent', border: '1px solid rgba(220,80,80,0.25)', color: 'rgba(240,140,140,0.85)' },
  };
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 30, padding: children ? '0 12px' : 0, width: children ? undefined : 30, justifyContent: 'center',
        borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'background .2s, border-color .2s', ...variants[variant],
      }}
      onMouseEnter={e => { e.currentTarget.style.background = variant === 'default' ? 'rgba(40,110,180,0.55)' : 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = variants[variant].background as string; }}
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

function Pill({ tone, children }: { tone: 'pos' | 'neu' | 'neg' | 'info'; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    pos:  { background: 'rgba(40,190,120,0.15)', color: '#4de8a0', border: '1px solid rgba(40,190,120,0.28)' },
    neu:  { background: 'rgba(220,170,40,0.13)', color: '#f0c84a', border: '1px solid rgba(220,170,40,0.25)' },
    neg:  { background: 'rgba(220,80,80,0.15)',  color: '#f08585', border: '1px solid rgba(220,80,80,0.28)' },
    info: { background: 'rgba(60,140,210,0.15)', color: '#7cc8f0', border: '1px solid rgba(60,150,220,0.25)' },
  };
  return <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20, ...s[tone] }}>{children}</span>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      fontSize: 11, fontWeight: 500, color: '#cfe2f7',
      background: 'rgba(40,90,150,0.25)', border: '1px solid rgba(80,150,220,0.22)', borderRadius: 999,
    }}>{children}</span>
  );
}

/* ── Shared report state (lives at carousel scope so pages share data) ─ */
export type KPIFormat = 'currency' | 'percent' | 'number';
export interface KPI { id: string; label: string; actual: string; target: string; format: KPIFormat; }
export interface Goal { id: string; title: string; owner: string; status: string; due: string; }
export interface Initiative { id: string; title: string; status: string; progress: number; owner: string; }
export interface Risk { id: string; description: string; mitigation: string; }

export interface ReportState {
  period: 'monthly' | 'quarterly';
  quarter: string;
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
  preparedDate: '04/28/2026',
  authors: PRIMARY_AUTHORS,
  kpis: [
    { id: 'k1', label: 'Revenue',       actual: '4250000', target: '4000000', format: 'currency' },
    { id: 'k2', label: 'Pipeline',      actual: '18500000', target: '20000000', format: 'currency' },
    { id: 'k3', label: 'Custom Metric', actual: '92', target: '85', format: 'percent' },
  ],
  narrative:
`Q1 2026 closed with revenue 6.3% above plan, driven by stronger-than-expected execution in Debt Capital Markets and continued momentum from the FinServ advisory practice. Two strategic mandates closed inside quarter, contributing meaningful fee income and establishing reference accounts in our priority verticals.

Operationally, the Naitive platform reached internal feature parity for deal management, document intelligence, and lender matching. Adoption across the Debt and FinServ teams now sits at 100% for active engagements, materially shortening turnaround on lender outreach and write-up production.

Looking forward, our Q2 focus is sustaining pipeline velocity, hardening the agentic deal-ops layer, and converting the FinServ pipeline from indication-of-interest to signed engagements. We remain disciplined on opex while continuing to invest in the platform and senior origination capacity.`,
  goals: [
    { id: 'g1', title: 'Close 8 Debt mandates by quarter-end',                      owner: 'James Turner',       status: 'On Track', due: '2026-06-30' },
    { id: 'g2', title: 'Launch FinServ outbound channel — Asana: ABC-1042',          owner: 'Scott Williams',     status: 'On Track', due: '2026-05-15' },
    { id: 'g3', title: 'Ship Naitive Agent v2 to internal users',                    owner: 'John Moffitt',       status: 'At Risk',  due: '2026-06-15' },
    { id: 'g4', title: 'Operationalize lender-tier scoring across all desks',        owner: 'Mark Kaleniecki',    status: 'On Track', due: '2026-05-30' },
    { id: 'g5', title: 'Stand up Q2 2026 pipeline review cadence',                   owner: 'Florencia Fustinoni', status: 'Achieved', due: '2026-04-15' },
    { id: 'g6', title: 'Hire 2 senior originators',                                  owner: 'Chandler Minaldi',   status: 'Behind',   due: '2026-06-30' },
  ],
  initiatives: [
    { id: 'i1', title: 'Naitive Agent Platform — Asana Portfolio: AGT-2026',         status: 'On Track',  progress: 72, owner: 'John Moffitt' },
    { id: 'i2', title: 'FinServ Go-To-Market — Asana Project: FSV-Q2',                status: 'At Risk',   progress: 41, owner: 'Scott Williams' },
    { id: 'i3', title: 'Lender Directory Expansion (T1/T2)',                          status: 'On Track',  progress: 88, owner: 'Mark Kaleniecki' },
  ],
  initiativeOwnerFilter: 'All',
  risks: [
    { id: 'r1', description: 'Concentration risk: top 3 mandates represent ~58% of forecast Q2 fee revenue.',
              mitigation: 'Accelerate FinServ pipeline conversion; stagger close dates; build secondary lender coverage.' },
    { id: 'r2', description: 'Senior originator capacity constrained ahead of Q2 push.',
              mitigation: 'Active retained search; backfill with contractor coverage on 2 named accounts through May.' },
    { id: 'r3', description: 'Agentic deal-ops still requires human approval gates — slows latency on long-tail tasks.',
              mitigation: 'Define low-risk auto-execute scope; ship guarded auto-mode for internal users only in Q2.' },
    { id: 'r4', description: '', mitigation: '' },
  ],
};

/* Deep clone seed each reset (avoid mutation) */
const cloneSeed = (): ReportState => JSON.parse(JSON.stringify(SEED));

/* ── Hook used by the carousel to share state across the 3 pages ───── */
export function useQuarterlyReportState() {
  const [state, setState] = useState<ReportState>(cloneSeed);
  const reset = () => setState(cloneSeed());
  const print = () => { try { window.print(); } catch {} };
  return { state, setState, reset, print };
}

/* ── Helpers ───────────────────────────────────────────────────────── */
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
  const a = Number(actual); const t = Number(target);
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

/* ═════════════════ PAGE 1 — OVERVIEW ═════════════════ */
export function QuarterlyReportOverview({ s, set, reset, print }: {
  s: ReportState; set: React.Dispatch<React.SetStateAction<ReportState>>; reset: () => void; print: () => void;
}) {
  const updateKPI = (id: string, patch: Partial<KPI>) =>
    set(p => ({ ...p, kpis: p.kpis.map(k => k.id === id ? { ...k, ...patch } : k) }));
  const removeKPI = (id: string) => set(p => ({ ...p, kpis: p.kpis.filter(k => k.id !== id) }));
  const addKPI = () => set(p => ({ ...p, kpis: [...p.kpis, { id: uid(), label: 'New KPI', actual: '0', target: '0', format: 'number' }] }));

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, color: TEXT_PRIMARY }}>
      {/* Report header */}
      <Card>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: TEXT_LABEL }}>
                5th Line Capital Advisors
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: TEXT_PRIMARY, letterSpacing: '-.2px' }}>
                Quarterly Insights Report — {s.quarter}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn icon={RotateCcw} variant="ghost" onClick={reset}>Reset</Btn>
              <Btn icon={Printer} onClick={print}>Print / Export</Btn>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            {/* Period toggle */}
            <div style={{ display: 'inline-flex', borderRadius: 8, border: INPUT_BORDER, overflow: 'hidden' }}>
              {(['monthly','quarterly'] as const).map(p => (
                <button key={p} onClick={() => set(prev => ({ ...prev, period: p }))} style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                  background: s.period === p ? 'rgba(40,110,180,0.55)' : 'transparent',
                  color: s.period === p ? '#e8f4ff' : TEXT_MUTED,
                  border: 'none', cursor: 'pointer',
                }}>{p}</button>
              ))}
            </div>

            {s.period === 'quarterly' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Quarter</span>
                <select value={s.quarter} onChange={e => set(p => ({ ...p, quarter: e.target.value }))} style={{ ...selectStyle, width: 130 }}>
                  {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Date Prepared</span>
              <input value={s.preparedDate} onChange={e => set(p => ({ ...p, preparedDate: e.target.value }))} style={{ ...inputStyle, width: 120 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL, marginRight: 4 }}>Prepared By</span>
              {s.authors.map(a => <Chip key={a}>{a}</Chip>)}
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <Card>
        <div style={{ padding: '16px 18px' }}>
          <SectionTitle right={<Btn icon={Plus} variant="ghost" onClick={addKPI}>Add KPI</Btn>}>KPIs</SectionTitle>
          <div style={{ display: 'grid', gap: 10 }}>
            {s.kpis.map(k => {
              const status = deriveStatus(k.actual, k.target);
              const tone = status === 'Above Plan' ? 'pos' : status === 'On Plan' ? 'neu' : 'neg';
              return (
                <div key={k.id} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(160px,1.4fr) auto minmax(110px,1fr) minmax(110px,1fr) 110px 30px',
                  gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <input value={k.label} onChange={e => updateKPI(k.id, { label: e.target.value })} placeholder="Metric label" style={inputStyle} />
                  <Pill tone={tone}>{status}</Pill>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Actual</span>
                    <input value={k.actual} onChange={e => updateKPI(k.id, { actual: e.target.value })} style={inputStyle} />
                    <span style={{ fontSize: 11, color: '#dde8f8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatKPI(k.actual, k.format)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>Target</span>
                    <input value={k.target} onChange={e => updateKPI(k.id, { target: e.target.value })} style={inputStyle} />
                    <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatKPI(k.target, k.format)}</span>
                  </div>
                  <select value={k.format} onChange={e => updateKPI(k.id, { format: e.target.value as KPIFormat })} style={selectStyle}>
                    <option value="currency">$ Currency</option>
                    <option value="percent">% Percent</option>
                    <option value="number"># Number</option>
                  </select>
                  <Btn icon={Trash2} variant="danger" ariaLabel="Remove KPI" onClick={() => removeKPI(k.id)} />
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Narrative */}
      <Card>
        <div style={{ padding: '16px 18px' }}>
          <SectionTitle>Summary / Quarterly Narrative Update</SectionTitle>
          <textarea
            value={s.narrative}
            onChange={e => set(p => ({ ...p, narrative: e.target.value }))}
            style={{
              ...inputStyle, minHeight: 220, lineHeight: 1.6, fontSize: 13,
              padding: 14, resize: 'vertical', whiteSpace: 'pre-wrap', fontFamily: 'inherit',
            }}
          />
        </div>
      </Card>
    </div>
  );
}

/* ═════════════════ PAGE 2 — GOALS & INITIATIVES ═════════════════ */
export function QuarterlyReportGoals({ s, set }: { s: ReportState; set: React.Dispatch<React.SetStateAction<ReportState>>; }) {
  const updateGoal = (id: string, patch: Partial<Goal>) =>
    set(p => ({ ...p, goals: p.goals.map(g => g.id === id ? { ...g, ...patch } : g) }));
  const removeGoal = (id: string) => set(p => ({ ...p, goals: p.goals.filter(g => g.id !== id) }));
  const addGoal = () => set(p => ({ ...p, goals: [...p.goals, { id: uid(), title: '', owner: PEOPLE[0], status: 'On Track', due: '' }] }));

  const updateInit = (id: string, patch: Partial<Initiative>) =>
    set(p => ({ ...p, initiatives: p.initiatives.map(i => i.id === id ? { ...i, ...patch } : i) }));
  const removeInit = (id: string) => set(p => ({ ...p, initiatives: p.initiatives.filter(i => i.id !== id) }));
  const addInit = () => set(p => ({ ...p, initiatives: [...p.initiatives, { id: uid(), title: '', status: 'On Track', progress: 0, owner: PEOPLE[0] }] }));

  const filteredInits = useMemo(
    () => s.initiativeOwnerFilter === 'All' ? s.initiatives : s.initiatives.filter(i => i.owner === s.initiativeOwnerFilter),
    [s.initiatives, s.initiativeOwnerFilter]
  );
  const counts = useMemo(() => ({
    onTrack: filteredInits.filter(i => i.status === 'On Track').length,
    atRisk:  filteredInits.filter(i => i.status === 'At Risk').length,
    offTrack: filteredInits.filter(i => i.status === 'Off Track').length,
  }), [filteredInits]);

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: TEXT_PRIMARY, verticalAlign: 'middle', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, color: TEXT_PRIMARY }}>
      {/* Goals */}
      <Card>
        <div style={{ padding: '16px 18px' }}>
          <SectionTitle right={<Btn icon={Plus} variant="ghost" onClick={addGoal}>Add Row</Btn>}>Goals</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 36 }}>#</th>
                  <th style={thStyle}>Title</th>
                  <th style={{ ...thStyle, width: 170 }}>Owner</th>
                  <th style={{ ...thStyle, width: 130 }}>Status</th>
                  <th style={{ ...thStyle, width: 140 }}>Due Date</th>
                  <th style={{ ...thStyle, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {s.goals.map((g, idx) => (
                  <tr key={g.id}>
                    <td style={{ ...tdStyle, color: TEXT_LABEL, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                    <td style={tdStyle}>
                      <input value={g.title} onChange={e => updateGoal(g.id, { title: e.target.value })} placeholder="Goal title or Asana link" style={inputStyle} />
                    </td>
                    <td style={tdStyle}>
                      <select value={g.owner} onChange={e => updateGoal(g.id, { owner: e.target.value })} style={selectStyle}>
                        {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <select value={g.status} onChange={e => updateGoal(g.id, { status: e.target.value })} style={selectStyle}>
                          {['On Track','At Risk','Behind','Achieved'].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <Pill tone={statusTone(g.status)}>{g.status}</Pill>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <input type="date" value={g.due} onChange={e => updateGoal(g.id, { due: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={tdStyle}>
                      <Btn icon={Trash2} variant="danger" ariaLabel="Remove goal" onClick={() => removeGoal(g.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Initiatives */}
      <Card>
        <div style={{ padding: '16px 18px' }}>
          <SectionTitle right={<Btn icon={Plus} variant="ghost" onClick={addInit}>Add Goal</Btn>}>Initiatives</SectionTitle>

          {/* Filter row + counters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>Owner</span>
              <select value={s.initiativeOwnerFilter} onChange={e => set(p => ({ ...p, initiativeOwnerFilter: e.target.value }))} style={{ ...selectStyle, width: 180 }}>
                <option value="All">All Owners</option>
                {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
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
                {filteredInits.map(i => (
                  <tr key={i.id}>
                    <td style={tdStyle}>
                      <input value={i.title} onChange={e => updateInit(i.id, { title: e.target.value })} placeholder="Initiative or Asana portfolio link" style={inputStyle} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <select value={i.status} onChange={e => updateInit(i.id, { status: e.target.value })} style={selectStyle}>
                          {['On Track','At Risk','Off Track'].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <Pill tone={statusTone(i.status)}>{i.status}</Pill>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" min={0} max={100} value={i.progress}
                          onChange={e => updateInit(i.id, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                          style={{ ...inputStyle, width: 60 }} />
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${i.progress}%`, height: '100%',
                            background: i.status === 'Off Track' ? 'linear-gradient(90deg,#a23838,#f08585)'
                                       : i.status === 'At Risk'  ? 'linear-gradient(90deg,#a37a16,#f0c84a)'
                                                                  : 'linear-gradient(90deg,#1a8552,#4de8a0)',
                            transition: 'width .3s',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>{i.progress}%</span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <select value={i.owner} onChange={e => updateInit(i.id, { owner: e.target.value })} style={selectStyle}>
                        {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <Btn icon={Trash2} variant="danger" ariaLabel="Remove initiative" onClick={() => removeInit(i.id)} />
                    </td>
                  </tr>
                ))}
                {filteredInits.length === 0 && (
                  <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: TEXT_LABEL, padding: 20 }}>No initiatives match the selected owner.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═════════════════ PAGE 3 — RISKS & EXPORT VIEW ═════════════════ */
export function QuarterlyReportRisks({ s, set, print }: {
  s: ReportState; set: React.Dispatch<React.SetStateAction<ReportState>>; print: () => void;
}) {
  const updateRisk = (id: string, patch: Partial<Risk>) =>
    set(p => ({ ...p, risks: p.risks.map(r => r.id === id ? { ...r, ...patch } : r) }));
  const removeRisk = (id: string) => set(p => ({ ...p, risks: p.risks.filter(r => r.id !== id) }));
  const addRisk = () => set(p => ({ ...p, risks: [...p.risks, { id: uid(), description: '', mitigation: '' }] }));

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(140,175,200,0.5)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid rgba(255,255,255,0.04)' };
  const taStyle: React.CSSProperties = { ...inputStyle, minHeight: 70, lineHeight: 1.5, padding: 10, resize: 'vertical', fontFamily: 'inherit' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, color: TEXT_PRIMARY }}>
      <Card>
        <div style={{ padding: '16px 18px' }}>
          <SectionTitle right={
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn icon={Plus} variant="ghost" onClick={addRisk}>Add Risk</Btn>
              <Btn icon={Printer} onClick={print}>Print / Export</Btn>
            </div>
          }>Open Risks</SectionTitle>
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
                {s.risks.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, width: '50%' }}>
                      <textarea value={r.description} onChange={e => updateRisk(r.id, { description: e.target.value })} placeholder="Describe the risk…" style={taStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: '50%' }}>
                      <textarea value={r.mitigation} onChange={e => updateRisk(r.id, { mitigation: e.target.value })} placeholder="Mitigation plan…" style={taStyle} />
                    </td>
                    <td style={tdStyle}>
                      <Btn icon={Trash2} variant="danger" ariaLabel="Remove risk" onClick={() => removeRisk(r.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Export footer */}
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
    </div>
  );
}

/* ── Print stylesheet (scoped, injected once) ──────────────────────── */
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