import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink, RefreshCw, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
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

  const lastSync = goals.lastSyncedAt || portfolios.lastSyncedAt;

  // ── Goals filters ──
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
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

  const filtersActive = statusFilter !== 'all' || ownerFilter !== 'all' || dueFilter !== 'all';
  const selectStyle: React.CSSProperties = {
    fontSize: 10, padding: '3px 6px', borderRadius: 5,
    background: 'rgba(20,80,160,0.35)', color: '#d0eaff',
    border: '1px solid rgba(40,120,200,0.4)', outline: 'none', cursor: 'pointer',
  };

  return (
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
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="On Track">On Track</option>
                <option value="At Risk">At Risk</option>
                <option value="Behind">Behind</option>
                <option value="Achieved">Achieved</option>
              </select>
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
                  onClick={() => { setStatusFilter('all'); setOwnerFilter('all'); setDueFilter('all'); }}
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
                return (
                  <div key={g.id} style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(20,80,160,0.18)', border: '1px solid rgba(40,100,180,0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#e8f6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.url ? (
                            <a href={g.url} target="_blank" rel="noreferrer" style={{ color: '#e8f6ff', textDecoration: 'none' }}>
                              {g.title} <ExternalLink size={9} style={{ display: 'inline', opacity: 0.5 }} />
                            </a>
                          ) : g.title}
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
          <SectionLabel>Portfolios · Asana</SectionLabel>
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
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {portfolios.portfolios.map(p => {
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
  );
}