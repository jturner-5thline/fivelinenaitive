import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink, RefreshCw, Loader2, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { useAsanaGoals } from '@/hooks/useAsanaGoals';
import { useAsanaPortfolios } from '@/hooks/useAsanaPortfolios';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

const ASANA_GOALS_URL = 'https://app.asana.com/0/goals';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[10px] ${className}`}
      style={{ background: 'rgba(10,60,110,0.55)', border: '1px solid rgba(40,120,200,0.28)' }}>
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(80,180,255,0.4),transparent)' }} />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(160,210,255,0.5)', marginBottom: 8 }}>{children}</div>;
}

const STATUS_COLOR: Record<string, string> = {
  'On Track': '#3de89a',
  'At Risk': '#ffb71e',
  'Behind': '#ff6b7a',
  'Achieved': '#4db8ff',
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || 'rgba(160,210,255,0.6)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 4,
      background: `${color}22`, color, border: `1px solid ${color}55`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {status}
    </span>
  );
}

function fallbackProgressFromStatus(status: string): number | null {
  // Used only when Asana doesn't return a numeric metric for the goal.
  switch (status) {
    case 'Achieved': return 100;
    case 'On Track': return 70;
    case 'At Risk': return 45;
    case 'Behind': return 20;
    default: return null;
  }
}

function formatMetric(n: number, unit: string | null): string {
  if (unit === 'currency') {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
    return `$${n.toLocaleString()}`;
  }
  if (unit === 'percentage') return `${n}%`;
  return n.toLocaleString();
}

function formatProgressSource(src: string | null): string {
  if (!src) return 'Manual';
  return src
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'rgba(160,210,255,0.5)' }}>{label}</span>
      <span style={{ fontSize: 10, color: '#e8f6ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</span>
    </div>
  );
}

function RefreshBtn({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 6, fontSize: 10, fontWeight: 600,
        background: 'rgba(40,120,200,0.25)', color: '#4db8ff',
        border: '1px solid rgba(40,120,200,0.45)', cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}>
      {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Refresh
    </button>
  );
}

export function AsanaGoalsPortfoliosSection() {
  const goals = useAsanaGoals();
  const portfolios = useAsanaPortfolios();
  const [openPortfolio, setOpenPortfolio] = useState<{ gid: string; name: string; url: string | null } | null>(null);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const toggleGoalExpanded = (id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [portfolioStatusFilter, setPortfolioStatusFilter] = useState<'all' | 'on' | 'at' | 'off'>('all');

  const lastSync = goals.lastSyncedAt || portfolios.lastSyncedAt;

  // ── Goals filters ──
  // Multi-select status filter: empty Set = "All"
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [dueFilter, setDueFilter] = useState<string>('all'); // all | overdue | 30d | 90d | none

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    goals.goals.forEach(g => g.owner && set.add(g.owner));
    return Array.from(set).sort();
  }, [goals.goals]);

  const filteredGoals = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return goals.goals.filter(g => {
      if (statusFilter.size > 0 && !statusFilter.has(g.status)) return false;
      if (ownerFilter !== 'all' && g.owner !== ownerFilter) return false;
      if (dueFilter !== 'all') {
        if (dueFilter === 'none') {
          if (g.due) return false;
        } else {
          if (!g.due) return false;
          const d = new Date(g.due);
          const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000);
          if (dueFilter === 'overdue' && diffDays >= 0) return false;
          if (dueFilter === '30d' && (diffDays < 0 || diffDays > 30)) return false;
          if (dueFilter === '90d' && (diffDays < 0 || diffDays > 90)) return false;
        }
      }
      return true;
    });
  }, [goals.goals, statusFilter, ownerFilter, dueFilter]);

  const filtersActive = statusFilter.size > 0 || ownerFilter !== 'all' || dueFilter !== 'all';

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const STATUS_OPTIONS = ['On Track', 'At Risk', 'Behind', 'Achieved'] as const;

  const filteredPortfolios = useMemo(() => {
    if (portfolioStatusFilter === 'all') return portfolios.portfolios;
    return portfolios.portfolios.filter(p => {
      if (portfolioStatusFilter === 'on') return p.onTrack > 0;
      if (portfolioStatusFilter === 'at') return p.atRisk > 0;
      if (portfolioStatusFilter === 'off') return p.offTrack > 0;
      return true;
    });
  }, [portfolios.portfolios, portfolioStatusFilter]);

  const selectStyle: React.CSSProperties = {
    fontSize: 10, padding: '3px 6px', borderRadius: 5,
    background: 'rgba(20,80,160,0.35)', color: '#d0eaff',
    border: '1px solid rgba(40,120,200,0.4)', outline: 'none', cursor: 'pointer',
    // Force the native dropdown panel to render in dark mode (no white bg).
    colorScheme: 'dark',
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    paddingRight: 18,
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%23d0eaff' d='M0 0l5 6 5-6z'/></svg>\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 6px center',
  };
  const optionStyle: React.CSSProperties = { background: '#0f1c34', color: '#d0eaff' };

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
      {/* GOALS */}
      <Card className="glass-module">
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <SectionLabel>Company Goals · Asana</SectionLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {lastSync && (
                <span style={{ fontSize: 9, color: 'rgba(160,210,255,0.5)' }}>
                  Updated {format(new Date(lastSync), 'MMM d, h:mm a')}
                </span>
              )}
              <RefreshBtn onClick={() => { void goals.refresh(); void portfolios.refresh(); }} busy={goals.loading || portfolios.loading} />
            </div>
          </div>

          {goals.goals.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <div role="group" aria-label="Filter by status" style={{ display: 'inline-flex', gap: 4 }}>
                {STATUS_OPTIONS.map(s => {
                  const active = statusFilter.has(s);
                  const color = STATUS_COLOR[s] || 'rgba(160,210,255,0.7)';
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStatus(s)}
                      aria-pressed={active}
                      title={active ? `Remove ${s}` : `Add ${s}`}
                      style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.4px',
                        padding: '3px 7px', borderRadius: 5, cursor: 'pointer',
                        background: active ? `${color}22` : 'rgba(20,80,160,0.25)',
                        color: active ? color : 'rgba(160,210,255,0.7)',
                        border: `1px solid ${active ? `${color}66` : 'rgba(40,120,200,0.3)'}`,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                      {s}
                    </button>
                  );
                })}
              </div>
              <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={selectStyle} aria-label="Filter by owner">
                <option value="all">All owners</option>
                {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={dueFilter} onChange={e => setDueFilter(e.target.value)} style={selectStyle} aria-label="Filter by due date">
                <option value="all">Any due date</option>
                <option value="overdue">Overdue</option>
                <option value="30d">Due in 30 days</option>
                <option value="90d">Due in 90 days</option>
                <option value="none">No due date</option>
              </select>
              {filtersActive && (
                <button
                  onClick={() => { setStatusFilter(new Set()); setOwnerFilter('all'); setDueFilter('all'); }}
                  style={{ ...selectStyle, color: '#4db8ff', cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(160,210,255,0.5)' }}>
                {filteredGoals.length} of {goals.goals.length}
              </span>
            </div>
          )}

          {goals.error ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#ff6b7a', fontSize: 11 }}>
                <AlertCircle size={14} /> Unable to load Asana Goals
              </div>
              <button onClick={() => void goals.refresh()}
                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6,
                  background: 'rgba(40,120,200,0.25)', color: '#4db8ff',
                  border: '1px solid rgba(40,120,200,0.45)', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : goals.loading && goals.goals.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(160,210,255,0.5)', fontSize: 11 }}>Loading goals…</div>
          ) : goals.goals.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(160,210,255,0.6)', fontSize: 11 }}>
              No active goals —{' '}
              <a href={ASANA_GOALS_URL} target="_blank" rel="noreferrer" style={{ color: '#4db8ff', textDecoration: 'underline' }}>
                create one in Asana
              </a>
            </div>
          ) : filteredGoals.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(160,210,255,0.6)', fontSize: 11 }}>
              No goals match the current filters
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {filteredGoals.map(g => {
                const realPct = g.progressPercent;
                const pct = realPct ?? fallbackProgressFromStatus(g.status);
                const isEstimate = realPct === null && pct !== null;
                const color = STATUS_COLOR[g.status] || '#4db8ff';
                const expanded = expandedGoals.has(g.id);
                const hasMetric = !!g.metric && (g.metric.currentValue !== null || g.metric.targetValue !== null || !!g.metric.currentDisplay);
                return (
                  <div key={g.id} style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(20,80,160,0.18)', border: '1px solid rgba(40,100,180,0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#e8f6ff' }}>
                          {hasMetric && (
                            <button
                              type="button"
                              onClick={() => toggleGoalExpanded(g.id)}
                              aria-expanded={expanded}
                              aria-label={expanded ? 'Collapse metric details' : 'Expand metric details'}
                              style={{ background: 'transparent', border: 'none', padding: 0, color: 'rgba(160,210,255,0.7)', cursor: 'pointer', display: 'inline-flex' }}
                            >
                              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            </button>
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                            {g.url ? (
                              <a href={g.url} target="_blank" rel="noreferrer" style={{ color: '#e8f6ff', textDecoration: 'none' }}>
                                {g.title} <ExternalLink size={9} style={{ display: 'inline', opacity: 0.5 }} />
                              </a>
                            ) : g.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(160,210,255,0.5)', marginTop: 2 }}>
                          {g.owner}{g.due ? ` · due ${g.due}` : ''}{g.timePeriod ? ` · ${g.timePeriod}` : ''}
                        </div>
                        {g.progressDisplay && (
                          <div style={{ fontSize: 9, color: 'rgba(160,210,255,0.7)', marginTop: 2 }}>
                            {g.progressDisplay}
                          </div>
                        )}
                      </div>
                      <StatusPill status={g.status} />
                    </div>
                    {pct !== null && (
                      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: 'rgba(40,100,180,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                        </div>
                        <span
                          style={{ fontSize: 9, color, fontWeight: 700, minWidth: 36, textAlign: 'right' }}
                          title={isEstimate ? 'Estimated from status (no Asana metric set)' : 'Live progress from Asana metric'}
                        >
                          {pct}%{isEstimate ? '*' : ''}
                        </span>
                      </div>
                    )}
                    {expanded && hasMetric && g.metric && (
                      <div style={{
                        marginTop: 6, padding: '6px 8px', borderRadius: 5,
                        background: 'rgba(10,50,100,0.35)', border: '1px solid rgba(40,120,200,0.25)',
                        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, fontSize: 9,
                      }}>
                        <MetricCell label="Current" value={
                          g.metric.currentDisplay
                            ?? (g.metric.currentValue !== null ? formatMetric(g.metric.currentValue, g.metric.unit) : '—')
                        } />
                        <MetricCell label="Target" value={
                          g.metric.targetValue !== null ? formatMetric(g.metric.targetValue, g.metric.unit) : '—'
                        } />
                        <MetricCell label="Source" value={formatProgressSource(g.metric.progressSource)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* PORTFOLIOS */}
      <Card className="glass-module">
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <SectionLabel>Portfolios · Asana</SectionLabel>
            {portfolios.portfolios.length > 0 && (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {([
                  { key: 'all', label: 'All', color: 'rgba(160,210,255,0.7)' },
                  { key: 'on', label: 'On track', color: STATUS_COLOR['On Track'] },
                  { key: 'at', label: 'At risk', color: STATUS_COLOR['At Risk'] },
                  { key: 'off', label: 'Off track', color: STATUS_COLOR['Behind'] },
                ] as const).map(opt => {
                  const active = portfolioStatusFilter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setPortfolioStatusFilter(opt.key)}
                      style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.4px',
                        padding: '3px 7px', borderRadius: 5, cursor: 'pointer',
                        background: active ? `${opt.color}22` : 'rgba(20,80,160,0.25)',
                        color: active ? opt.color : 'rgba(160,210,255,0.7)',
                        border: `1px solid ${active ? `${opt.color}66` : 'rgba(40,120,200,0.3)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {portfolios.error ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#ff6b7a', fontSize: 11 }}>
                <AlertCircle size={14} /> Unable to load Portfolios
              </div>
              <button onClick={() => void portfolios.refresh()}
                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6,
                  background: 'rgba(40,120,200,0.25)', color: '#4db8ff',
                  border: '1px solid rgba(40,120,200,0.45)', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : portfolios.loading && portfolios.portfolios.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(160,210,255,0.5)', fontSize: 11 }}>Loading portfolios…</div>
          ) : portfolios.portfolios.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(160,210,255,0.6)', fontSize: 11 }}>No portfolios available</div>
          ) : filteredPortfolios.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(160,210,255,0.6)', fontSize: 11 }}>
              No portfolios match this filter
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {filteredPortfolios.map(p => {
                const total = p.projectCount || 1;
                const onPct = Math.round((p.onTrack / total) * 100);
                const atPct = Math.round((p.atRisk / total) * 100);
                const offPct = Math.round((p.offTrack / total) * 100);
                return (
                  <div
                    key={p.gid}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenPortfolio({ gid: p.gid, name: p.name, url: p.permalink_url })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenPortfolio({ gid: p.gid, name: p.name, url: p.permalink_url }); }}
                    style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(20,80,160,0.18)', border: '1px solid rgba(40,100,180,0.25)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#e8f6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.permalink_url ? (
                          <a href={p.permalink_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#e8f6ff', textDecoration: 'none' }}>
                            {p.name} <ExternalLink size={9} style={{ display: 'inline', opacity: 0.5 }} />
                          </a>
                        ) : p.name}
                      </div>
                      <span style={{ fontSize: 9, color: 'rgba(160,210,255,0.6)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        {p.projectCount} projects <ChevronRight size={10} style={{ opacity: 0.6 }} />
                      </span>
                    </div>
                    {p.projectCount > 0 ? (
                      <>
                        <div style={{ marginTop: 5, display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'rgba(40,100,180,0.25)' }}>
                          <div style={{ width: `${onPct}%`, background: STATUS_COLOR['On Track'] }} />
                          <div style={{ width: `${atPct}%`, background: STATUS_COLOR['At Risk'] }} />
                          <div style={{ width: `${offPct}%`, background: STATUS_COLOR['Behind'] }} />
                        </div>
                        <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, fontSize: 9 }}>
                          <div style={{ color: STATUS_COLOR['On Track'], display: 'flex', justifyContent: 'space-between' }}>
                            <span>● On track</span><span style={{ fontWeight: 700 }}>{p.onTrack} · {onPct}%</span>
                          </div>
                          <div style={{ color: STATUS_COLOR['At Risk'], display: 'flex', justifyContent: 'space-between' }}>
                            <span>● At risk</span><span style={{ fontWeight: 700 }}>{p.atRisk} · {atPct}%</span>
                          </div>
                          <div style={{ color: STATUS_COLOR['Behind'], display: 'flex', justifyContent: 'space-between' }}>
                            <span>● Off track</span><span style={{ fontWeight: 700 }}>{p.offTrack} · {offPct}%</span>
                          </div>
                        </div>
                        {p.noStatus > 0 && (
                          <div style={{ marginTop: 2, fontSize: 9, color: 'rgba(160,210,255,0.45)' }}>
                            {p.noStatus} no status ({Math.round((p.noStatus / total) * 100)}%)
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ marginTop: 4, fontSize: 9, color: 'rgba(160,210,255,0.4)' }}>No active projects</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
      {openPortfolio && (
        <PortfolioGoalsDrawer
          portfolio={openPortfolio}
          onClose={() => setOpenPortfolio(null)}
        />
      )}
    </>
  );
}

interface PortfolioGoalRow {
  gid: string;
  name: string;
  due_on: string | null;
  permalink_url: string | null;
  owner?: { name?: string } | null;
  status?: string | null;
  progress_status?: string | null;
  current_status_update?: { status_type?: string } | null;
  metric?: { current_display_value?: string | null; current_number_value?: number | null; target_number_value?: number | null; initial_number_value?: number | null; unit?: string | null } | null;
  time_period?: { display_name?: string | null } | null;
}

function mapGoalStatus(raw: string | null | undefined): string {
  const v = (raw || '').toLowerCase();
  if (!v) return 'No status';
  if (v.includes('achieved') || v.includes('complete')) return 'Achieved';
  if (v.includes('on_track') || v === 'green') return 'On Track';
  if (v.includes('at_risk') || v === 'yellow') return 'At Risk';
  if (v.includes('off_track') || v.includes('behind') || v === 'red' || v.includes('missed')) return 'Behind';
  return 'No status';
}

function PortfolioGoalsDrawer({
  portfolio,
  onClose,
}: {
  portfolio: { gid: string; name: string; url: string | null };
  onClose: () => void;
}) {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<PortfolioGoalRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company?.id) return;
      setLoading(true);
      setError(null);
      setActivityLoading(true);
      setActivityError(null);
      try {
        const { data: integration, error: intErr } = await supabase
          .from('integrations')
          .select('id')
          .eq('type', 'asana')
          .eq('status', 'connected')
          .eq('company_id', company.id)
          .limit(1)
          .maybeSingle();
        if (intErr) throw intErr;
        if (!integration) throw new Error('Asana not connected');
        const [goalsRes, actRes] = await Promise.all([
          supabase.functions.invoke('asana-proxy', {
            body: { action: 'portfolio_goals', integration_id: integration.id, portfolio_gid: portfolio.gid },
          }),
          supabase.functions.invoke('asana-proxy', {
            body: { action: 'portfolio_activity', integration_id: integration.id, portfolio_gid: portfolio.gid, limit: 25 },
          }),
        ]);
        if (goalsRes.error) throw goalsRes.error;
        if (!goalsRes.data?.success) throw new Error(goalsRes.data?.error || 'Failed to load goals');
        if (!cancelled) setGoals(goalsRes.data.goals || []);

        if (actRes.error) {
          if (!cancelled) setActivityError(actRes.error.message);
        } else if (!actRes.data?.success) {
          if (!cancelled) setActivityError(actRes.data?.error || 'Failed to load activity');
        } else if (!cancelled) {
          setActivity(actRes.data.activity || []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load goals');
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id, portfolio.gid]);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[460px] sm:max-w-[460px] overflow-y-auto bg-[#061633] border-[rgba(40,120,200,0.3)]">
        <SheetHeader>
          <SheetTitle className="text-[#e8f6ff]">
            {portfolio.name}
            {portfolio.url && (
              <a href={portfolio.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#4db8ff' }}>
                <ExternalLink size={12} style={{ display: 'inline' }} />
              </a>
            )}
          </SheetTitle>
          <SheetDescription className="text-[rgba(160,210,255,0.6)] text-xs">
            Goals supporting this portfolio
          </SheetDescription>
        </SheetHeader>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(160,210,255,0.55)', fontSize: 12 }}>
              <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
              Loading goals…
            </div>
          ) : error ? (
            <div style={{ padding: 16, color: '#ff6b7a', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} /> {error}
            </div>
          ) : goals.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(160,210,255,0.55)', fontSize: 12 }}>
              No goals attached to this portfolio.
            </div>
          ) : (
            goals.map((g) => {
              const rawStatus = g.current_status_update?.status_type || g.progress_status || g.status || null;
              const status = mapGoalStatus(rawStatus);
              const color = STATUS_COLOR[status] || 'rgba(160,210,255,0.6)';
              const due = g.due_on ? format(new Date(g.due_on), 'MMM d, yyyy') : null;
              const m = g.metric;
              let pct: number | null = null;
              if (m && typeof m.current_number_value === 'number' && typeof m.target_number_value === 'number') {
                const start = typeof m.initial_number_value === 'number' ? m.initial_number_value : 0;
                const span = m.target_number_value - start;
                if (span !== 0) pct = Math.max(0, Math.min(100, Math.round(((m.current_number_value - start) / span) * 100)));
              }
              return (
                <div key={g.gid} style={{ padding: 10, borderRadius: 8, background: 'rgba(20,80,160,0.18)', border: '1px solid rgba(40,100,180,0.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e8f6ff' }}>
                        {g.permalink_url ? (
                          <a href={g.permalink_url} target="_blank" rel="noreferrer" style={{ color: '#e8f6ff', textDecoration: 'none' }}>
                            {g.name} <ExternalLink size={10} style={{ display: 'inline', opacity: 0.5 }} />
                          </a>
                        ) : g.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(160,210,255,0.55)', marginTop: 2 }}>
                        {g.owner?.name || '—'}
                        {due ? ` · due ${due}` : ''}
                        {g.time_period?.display_name ? ` · ${g.time_period.display_name}` : ''}
                      </div>
                      {m?.current_display_value && (
                        <div style={{ fontSize: 10, color: 'rgba(160,210,255,0.7)', marginTop: 2 }}>{m.current_display_value}</div>
                      )}
                    </div>
                    <StatusPill status={status} />
                  </div>
                  {pct !== null && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(40,100,180,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                      </div>
                      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <SectionLabel>Recent Activity</SectionLabel>
          {activityLoading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(160,210,255,0.55)', fontSize: 12 }}>
              <Loader2 size={12} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
              Loading activity…
            </div>
          ) : activityError ? (
            <div style={{ padding: 12, color: '#ff6b7a', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} /> {activityError}
            </div>
          ) : activity.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: 'rgba(160,210,255,0.5)', fontSize: 11 }}>
              No recent updates from Asana.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ position: 'absolute', top: 4, bottom: 4, left: 5, width: 1, background: 'rgba(40,120,200,0.3)' }} />
              {activity.map((a) => {
                const status = mapGoalStatus(a.status_type);
                const color = STATUS_COLOR[status] || 'rgba(160,210,255,0.5)';
                const when = a.created_at ? format(new Date(a.created_at), 'MMM d, h:mm a') : '';
                return (
                  <div key={a.id} style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: -13, top: 4, width: 9, height: 9, borderRadius: '50%',
                      background: color, boxShadow: `0 0 0 2px #061633`,
                    }} />
                    <div style={{ fontSize: 10, color: 'rgba(160,210,255,0.55)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.author || 'Asana'} · {when}
                      </span>
                      <StatusPill status={status} />
                    </div>
                    <div style={{ fontSize: 11, color: '#e8f6ff', marginTop: 2, fontWeight: 600 }}>
                      {a.goal_url ? (
                        <a href={a.goal_url} target="_blank" rel="noreferrer" style={{ color: '#e8f6ff', textDecoration: 'none' }}>
                          {a.goal_name} <ExternalLink size={9} style={{ display: 'inline', opacity: 0.5 }} />
                        </a>
                      ) : a.goal_name}
                    </div>
                    {(a.title || a.text) && (
                      <div style={{ fontSize: 10, color: 'rgba(200,225,255,0.75)', marginTop: 2, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {a.title ? <span style={{ fontWeight: 600 }}>{a.title}{a.text ? ' — ' : ''}</span> : null}
                        {a.text || ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface ActivityItem {
  id: string;
  created_at: string | null;
  author: string | null;
  status_type: string | null;
  title: string | null;
  text: string | null;
  goal_gid: string;
  goal_name: string;
  goal_url: string | null;
}