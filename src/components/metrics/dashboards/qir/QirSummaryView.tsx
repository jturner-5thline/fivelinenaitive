import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAsanaGoals, type AsanaGoalRow } from '@/hooks/useAsanaGoals';
import { useAsanaPortfolioProjects, type AsanaPortfolioProjectRow } from '@/hooks/useAsanaPortfolioProjects';
import { KpiDrillDownDialog, type KpiLike } from './KpiDrillDownDialog';
import { InsightsDrilldownDrawer, type DrilldownColumn, type DrilldownContext } from '../../insights/InsightsDrilldownDrawer';
import type { ReportState, KPI, Risk } from '../QuarterlyInsightsReport';

/* Local visual tokens — mirror QuarterlyInsightsReport.tsx for consistency. */
const SURFACE = 'rgba(16,28,52,0.75)';
const SURFACE_BORDER = '1px solid rgba(80,140,255,0.18)';
const SHEEN = 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.00) 55%)';
const RADIUS = 8;
const RADIUS_PILL = 9999;
const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="glass-module"
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

function Pill({ tone, children }: { tone: 'pos' | 'neu' | 'neg' | 'info'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    pos: { background: 'rgba(40,190,120,0.15)', color: '#4de8a0', border: '1px solid rgba(40,190,120,0.28)' },
    neu: { background: 'rgba(220,170,40,0.13)', color: '#f0c84a', border: '1px solid rgba(220,170,40,0.25)' },
    neg: { background: 'rgba(220,80,80,0.15)', color: '#f08585', border: '1px solid rgba(220,80,80,0.28)' },
    info: { background: 'rgba(60,140,210,0.15)', color: '#7cc8f0', border: '1px solid rgba(60,150,220,0.25)' },
  };
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '2px 8px', borderRadius: RADIUS_PILL, ...styles[tone] }}>
      {children}
    </span>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_LABEL, margin: 0 }}>{title}</h3>
      {action}
    </div>
  );
}

function ViewAllBtn({ onClick, label = 'View all' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'transparent', border: '1px solid rgba(120,170,255,0.18)',
        color: TEXT_MUTED, borderRadius: 8, padding: '4px 10px',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {label} <ExternalLink size={11} />
    </button>
  );
}

function formatKPI(value: string, format: KPI['format']): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.trunc(n));
  }
  if (format === 'percent') return `${n.toFixed(1)}%`;
  return n.toLocaleString();
}

function deriveStatus(actual: string, target: string): 'Above Plan' | 'On Plan' | 'Off Plan' {
  const a = Number(actual);
  const t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || t === 0) return 'On Plan';
  const r = a / t;
  if (r >= 1.02) return 'Above Plan';
  if (r >= 0.95) return 'On Plan';
  return 'Off Plan';
}

function statusTone(s: string): 'pos' | 'neu' | 'neg' {
  if (s === 'Above Plan' || s === 'Achieved' || s === 'On Track') return 'pos';
  if (s === 'On Plan' || s === 'At Risk' || s === 'On Hold') return 'neu';
  return 'neg';
}

/* ── Summary view ──────────────────────────────────────────────────────── */

export function QirSummaryView({ s, reportLabel }: { s: ReportState; reportLabel: string }) {
  const [drillKpi, setDrillKpi] = useState<KpiLike | null>(null);
  const [goalsDrill, setGoalsDrill] = useState<DrilldownContext | null>(null);
  const [initDrill, setInitDrill] = useState<DrilldownContext | null>(null);
  const [risksDrill, setRisksDrill] = useState<DrilldownContext | null>(null);

  /* Goals from Asana, filtered by Prepared By + report year (mirrors detail view). */
  const { goals: asanaGoals } = useAsanaGoals();
  const preparedBy = s.authors[0] || 'James Turner';
  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const preparedByKey = normalize(preparedBy);
  const activeYear = useMemo<number | null>(() => {
    const fromQuarter = /(\d{4})/.exec(s.quarter || '');
    if (fromQuarter) return parseInt(fromQuarter[1], 10);
    const fromMonth = /(\d{4})/.exec(s.month || '');
    if (fromMonth) return parseInt(fromMonth[1], 10);
    return null;
  }, [s.quarter, s.month]);
  const goalYear = (g: AsanaGoalRow): number | null => {
    const tp = (g.timePeriod || '').trim();
    const yr = /\b(20\d{2})\b/.exec(tp);
    if (yr) return parseInt(yr[1], 10);
    const fy = /fy\s*'?\s*(\d{2,4})/i.exec(tp);
    if (fy) return fy[1].length === 2 ? 2000 + parseInt(fy[1], 10) : parseInt(fy[1], 10);
    if (g.due) {
      const m = /^(\d{4})/.exec(g.due);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  };
  const ownerGoals = useMemo(
    () => asanaGoals.filter(g => {
      if (!g.owner || g.owner === '—') return false;
      const ownerKey = normalize(g.owner);
      const ownerMatches =
        ownerKey === preparedByKey ||
        ownerKey.includes(preparedByKey) ||
        preparedByKey.includes(ownerKey);
      if (!ownerMatches) return false;
      if (activeYear == null) return true;
      const y = goalYear(g);
      return y === activeYear;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asanaGoals, preparedByKey, activeYear],
  );
  const goalCounts = useMemo(() => {
    const c = { 'On Track': 0, 'At Risk': 0, 'Off Track': 0, 'Achieved': 0, 'Behind': 0, 'Other': 0 };
    for (const g of ownerGoals) {
      const k = (g.status || 'Other') as keyof typeof c;
      if (k in c) c[k] += 1; else c.Other += 1;
    }
    return c;
  }, [ownerGoals]);

  /* Initiatives — default portfolio for summary parity. */
  const DEFAULT_PORTFOLIO_GID = '1212153276296114';
  const { projects } = useAsanaPortfolioProjects(DEFAULT_PORTFOLIO_GID);
  const ownedInitiatives = useMemo(
    () => projects.filter(p => {
      const matches = (n?: string | null) => n && normalize(n) === preparedByKey;
      if (matches(p.owner)) return true;
      for (const c of p.ownerCandidates || []) if (matches(c.name)) return true;
      return false;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, preparedByKey],
  );
  const initCounts = useMemo(() => ({
    onTrack: ownedInitiatives.filter(p => p.status === 'On Track').length,
    atRisk: ownedInitiatives.filter(p => p.status === 'At Risk').length,
    offTrack: ownedInitiatives.filter(p => p.status === 'Off Track').length,
  }), [ownedInitiatives]);

  /* Top open risks: first N non-empty risks. */
  const openRisks = useMemo(() => s.risks.filter(r => r.description?.trim()), [s.risks]);
  const topRisks = openRisks.slice(0, 3);

  const visibleKpis = s.kpis.slice(0, 5);
  const reportTitle = reportLabel;
  // Narrative may now be rich-text HTML — render via sanitized HTML when it
  // contains tags, otherwise fall back to the legacy plain-text snippet.
  const isHtmlNarrative = /<\/?[a-z][\s\S]*>/i.test((s.narrative || '').trim());
  const narrativeFirstPara = isHtmlNarrative
    ? (s.narrative || '')
    : ((s.narrative || '').split(/\n\s*\n/)[0] || s.narrative || '');

  /* Drill rows */
  const goalsDrillRows = ownerGoals;
  const goalsDrillColumns: DrilldownColumn<AsanaGoalRow>[] = [
    { key: 'title', label: 'Goal', render: g => g.title },
    { key: 'owner', label: 'Owner', width: 140, render: g => g.owner || '—' },
    { key: 'status', label: 'Status', width: 110, render: g => <Pill tone={statusTone(g.status)}>{g.status}</Pill> },
    { key: 'period', label: 'Period', width: 100, render: g => g.timePeriod || '—' },
    { key: 'progress', label: 'Progress', width: 100, align: 'right', render: g => g.progressDisplay || (g.progressPercent != null ? `${Math.round(g.progressPercent)}%` : '—') },
  ];
  const initDrillColumns: DrilldownColumn<AsanaPortfolioProjectRow>[] = [
    { key: 'name', label: 'Initiative', render: p => p.name },
    { key: 'owner', label: 'Owner', width: 140, render: p => p.owner || '—' },
    { key: 'status', label: 'Status', width: 120, render: p => <Pill tone={statusTone(p.status)}>{p.status}</Pill> },
    { key: 'due', label: 'Due', width: 100, render: p => p.dueOn || '—' },
  ];
  const risksDrillColumns: DrilldownColumn<Risk>[] = [
    { key: 'description', label: 'Risk', render: r => r.description || <span style={{ color: TEXT_LABEL }}>—</span> },
    { key: 'mitigation', label: 'Mitigation', render: r => r.mitigation || <span style={{ color: TEXT_LABEL }}>—</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header strip */}
      <Card>
        <div style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: TEXT_LABEL, marginBottom: 6 }}>
            Executive Summary
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-.3px' }}>
            {reportTitle}
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>
            Prepared by {preparedBy} · {s.preparedDate}
          </div>
        </div>
      </Card>

      {/* Narrative */}
      <Card>
        <div style={{ padding: '20px 22px' }}>
          <SectionHeader title="Narrative Summary" />
          {isHtmlNarrative ? (
            <div
              className="insights-narrative-prose"
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: TEXT_PRIMARY,
                maxHeight: 220,
                overflow: 'hidden',
                maskImage: narrativeFirstPara.length > 600 ? 'linear-gradient(to bottom, #000 70%, transparent 100%)' : undefined,
              }}
              dangerouslySetInnerHTML={{ __html: narrativeFirstPara }}
            />
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: TEXT_PRIMARY,
                whiteSpace: 'pre-wrap',
                maxHeight: 220,
                overflow: 'hidden',
                maskImage: narrativeFirstPara.length > 600 ? 'linear-gradient(to bottom, #000 70%, transparent 100%)' : undefined,
              }}
            >
              {narrativeFirstPara}
            </div>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <Card>
        <div style={{ padding: '20px 22px' }}>
          <SectionHeader title="Key Performance Indicators" />
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            }}
          >
            {visibleKpis.map(kpi => {
              const status = deriveStatus(kpi.actual, kpi.target);
              const tone = status === 'Above Plan' ? 'pos' : status === 'On Plan' ? 'neu' : 'neg';
              return (
                <button
                  key={kpi.id}
                  type="button"
                  onClick={() => setDrillKpi(kpi as unknown as KpiLike)}
                  style={{
                    textAlign: 'left',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: RADIUS,
                    padding: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(120,170,255,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>
                    {kpi.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                    {formatKPI(kpi.actual, kpi.format)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 10, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>
                      Target {formatKPI(kpi.target, kpi.format)}
                    </span>
                    <Pill tone={tone}>{status}</Pill>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Goals + Initiatives row */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <div style={{ padding: '20px 22px' }}>
            <SectionHeader
              title="Goals"
              action={
                <ViewAllBtn onClick={() => setGoalsDrill({ sourceId: 'goals:all', sourceLabel: 'Goals · All', selection: `${ownerGoals.length} goal${ownerGoals.length === 1 ? '' : 's'}`, filters: [{ label: 'Owner', value: preparedBy }] })} />
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'On Track', tone: 'pos' as const, count: goalCounts['On Track'] + goalCounts['Achieved'] },
                { key: 'At Risk', tone: 'neu' as const, count: goalCounts['At Risk'] },
                { key: 'Off Track', tone: 'neg' as const, count: goalCounts['Off Track'] + goalCounts['Behind'] },
              ].map(row => (
                <div
                  key={row.key}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: RADIUS,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Pill tone={row.tone}>{row.key}</Pill>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                    {row.count}
                  </div>
                </div>
              ))}
              {ownerGoals.length === 0 && (
                <div style={{ fontSize: 12, color: TEXT_LABEL, padding: 8 }}>No goals owned by {preparedBy}.</div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px 22px' }}>
            <SectionHeader
              title="Initiatives"
              action={
                <ViewAllBtn onClick={() => setInitDrill({ sourceId: 'init:all', sourceLabel: 'Initiatives · All', selection: `${ownedInitiatives.length} initiative${ownedInitiatives.length === 1 ? '' : 's'}`, filters: [{ label: 'Owner', value: preparedBy }] })} />
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'On Track', tone: 'pos' as const, count: initCounts.onTrack },
                { key: 'At Risk', tone: 'neu' as const, count: initCounts.atRisk },
                { key: 'Off Track', tone: 'neg' as const, count: initCounts.offTrack },
              ].map(row => (
                <div
                  key={row.key}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: RADIUS,
                  }}
                >
                  <Pill tone={row.tone}>{row.key}</Pill>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                    {row.count}
                  </div>
                </div>
              ))}
              {ownedInitiatives.length === 0 && (
                <div style={{ fontSize: 12, color: TEXT_LABEL, padding: 8 }}>No initiatives owned by {preparedBy}.</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Top risks */}
      <Card>
        <div style={{ padding: '20px 22px' }}>
          <SectionHeader
            title="Top Open Risks"
            action={openRisks.length > topRisks.length ? (
              <ViewAllBtn
                label={`View all (${openRisks.length})`}
                onClick={() => setRisksDrill({ sourceId: 'risks:all', sourceLabel: 'Open Risks · All', selection: `${openRisks.length} risk${openRisks.length === 1 ? '' : 's'}` })}
              />
            ) : null}
          />
          {topRisks.length === 0 ? (
            <div style={{ fontSize: 13, color: TEXT_LABEL, padding: '8px 0' }}>No open risks recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topRisks.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: RADIUS,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_LABEL, letterSpacing: '.08em', marginTop: 2 }}>R{i + 1}</span>
                    <div style={{ fontSize: 13, color: TEXT_PRIMARY, lineHeight: 1.45, flex: 1 }}>{r.description}</div>
                  </div>
                  {r.mitigation && (
                    <div style={{ fontSize: 12, color: TEXT_MUTED, paddingLeft: 28 }}>
                      <span style={{ color: TEXT_LABEL, fontWeight: 600, marginRight: 6 }}>Mitigation:</span>
                      {r.mitigation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <KpiDrillDownDialog
        kpi={drillKpi}
        open={!!drillKpi}
        onClose={() => setDrillKpi(null)}
        period={s.period}
        quarter={s.quarter}
        month={s.month}
        reportLabel={reportLabel}
      />
      <InsightsDrilldownDrawer
        open={!!goalsDrill}
        context={goalsDrill}
        onClose={() => setGoalsDrill(null)}
        columns={goalsDrillColumns}
        rows={goalsDrillRows}
        emptyHint="No goals match this selection."
      />
      <InsightsDrilldownDrawer
        open={!!initDrill}
        context={initDrill}
        onClose={() => setInitDrill(null)}
        columns={initDrillColumns}
        rows={ownedInitiatives}
        rowHref={(p) => p.permalink_url || null}
        emptyHint="No initiatives match this selection."
      />
      <InsightsDrilldownDrawer
        open={!!risksDrill}
        context={risksDrill}
        onClose={() => setRisksDrill(null)}
        columns={risksDrillColumns}
        rows={openRisks}
        emptyHint="No open risks recorded."
      />
    </div>
  );
}