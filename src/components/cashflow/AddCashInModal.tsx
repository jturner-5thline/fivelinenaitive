import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { fmtShort } from './formatters';
import { computeTotalFee } from '@/lib/fees';

interface Deal {
  id: string;
  company: string;
  stage: string | null;
  status: string | null;
  value: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  success_fee_percent: number | null;
}

interface RowState {
  retainerEnabled: boolean;
  retainerAmt: number;
  milestoneEnabled: boolean;
  milestoneAmt: number;
  closingEnabled: boolean;
  closingAmt: number;
  date: string;
}

type SortKey = 'company' | 'stage' | 'status' | 'value';
type SortDir = 'asc' | 'desc';

interface AddCashInModalProps {
  open: boolean;
  onClose: () => void;
  onItemsAdded: () => void;
}

const EXCLUDED_STAGES = [
  'on-hold', 'On Hold', 'On Hold / Pause', 'On Hold or In Review',
  'closed-lost', 'Closed lost', 'Closed Out / Not a Fit',
  'closed-won', 'Closed won', 'Closed / Won',
  'Do Not Contact / Dead Deal', 'Not a Fit; Do Not Contact',
  'Company Opted Out', 'Client Lost', 'Dropped Client',
  'Past Client', 'No Lender Interest', 'Unqualified',
  'Clients Churned', 'Terminated', 'Deal/Diligence Paused/On Hold',
];

const STATUS_COLORS: Record<string, string> = {
  'on-track': '#22c55e',
  'at-risk': '#eab308',
  'off-track': '#ef4444',
  'active': '#22c55e',
};

function statusLabel(s: string | null) {
  if (!s) return '—';
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function stageLabel(s: string | null) {
  if (!s) return '—';
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function AddCashInModal({ open, onClose, onItemsAdded }: AddCashInModalProps) {
  const { company } = useCompany();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [sortKey, setSortKey] = useState<SortKey>('company');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showStageFilter, setShowStageFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Fetch deals
  useEffect(() => {
    if (!open || !company?.id) return;
    setLoading(true);
    supabase
      .from('deal_pipelines')
      .select('id')
      .eq('company_id', company.id)
      .eq('is_default', true)
      .limit(1)
      .single()
      .then(({ data: pipeline }) => {
        let query = supabase
          .from('deals')
          .select('id, company, stage, status, value, retainer_fee, milestone_fee, success_fee_percent')
          .eq('company_id', company.id)
          .not('status', 'in', '("on-hold","archived")')
          .not('stage', 'in', `(${EXCLUDED_STAGES.map(s => `"${s}"`).join(',')})`)
          .order('company', { ascending: true });
        if (pipeline?.id) query = query.eq('pipeline_id', pipeline.id);
        query.then(({ data, error }) => {
          const d = (!error && data ? data : []) as Deal[];
          setDeals(d);
          // Initialize row state for all deals
          const init: Record<string, RowState> = {};
          d.forEach(deal => {
            const retainer = Number(deal.retainer_fee) || 0;
            const milestone = Number(deal.milestone_fee) || 0;
            const value = Number(deal.value) || 0;
            const sfPct = Number(deal.success_fee_percent);
            // Closing Fee = deal.value × normalized success_fee_percent ONLY.
            // Never derived from total_fee — Closing Fees must always reflect
            // the Success Fee. If success_fee_percent is missing/invalid → 0.
            const closingAmt = computeTotalFee(value, sfPct);
            init[deal.id] = {
              retainerEnabled: false,
              retainerAmt: retainer,
              milestoneEnabled: false,
              milestoneAmt: milestone,
              closingEnabled: false,
              closingAmt: closingAmt,
              date: todayStr,
            };
          });
          setRows(init);
          setLoading(false);
        });
      });
  }, [open, company?.id, todayStr]);

  // Distinct stages/statuses for filter options
  const distinctStages = useMemo(() => [...new Set(deals.map(d => d.stage).filter(Boolean))] as string[], [deals]);
  const distinctStatuses = useMemo(() => [...new Set(deals.map(d => d.status).filter(Boolean))] as string[], [deals]);

  // Filter + search + sort
  const filtered = useMemo(() => {
    let result = [...deals];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => d.company?.toLowerCase().includes(q) || d.stage?.toLowerCase().includes(q));
    }
    if (stageFilter.length > 0) result = result.filter(d => d.stage && stageFilter.includes(d.stage));
    if (statusFilter.length > 0) result = result.filter(d => d.status && statusFilter.includes(d.status));
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'company': cmp = (a.company || '').localeCompare(b.company || ''); break;
        case 'stage': cmp = (a.stage || '').localeCompare(b.stage || ''); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
        case 'value': cmp = (a.value || 0) - (b.value || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [deals, searchQuery, stageFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }, [sortKey]);

  const updateRow = useCallback((id: string, patch: Partial<RowState>) => {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // Bulk toggle a fee column for all visible deals
  const bulkToggleFee = useCallback((feeKey: 'retainerEnabled' | 'milestoneEnabled' | 'closingEnabled') => {
    const visibleIds = filtered.map(d => d.id);
    const allEnabled = visibleIds.every(id => rows[id]?.[feeKey]);
    setRows(prev => {
      const next = { ...prev };
      visibleIds.forEach(id => { if (next[id]) next[id] = { ...next[id], [feeKey]: !allEnabled }; });
      return next;
    });
  }, [filtered, rows]);

  // Summary stats
  const summary = useMemo(() => {
    let feeCount = 0;
    let total = 0;
    const dealIds = new Set<string>();
    Object.entries(rows || {}).forEach(([id, r]) => {
      if (r.retainerEnabled && r.retainerAmt > 0) { feeCount++; total += r.retainerAmt; dealIds.add(id); }
      if (r.milestoneEnabled && r.milestoneAmt > 0) { feeCount++; total += r.milestoneAmt; dealIds.add(id); }
      if (r.closingEnabled && r.closingAmt > 0) { feeCount++; total += r.closingAmt; dealIds.add(id); }
    });
    return { dealCount: dealIds.size, feeCount, total };
  }, [rows]);

  const handleSave = useCallback(async () => {
    if (!company?.id) return;
    setSaving(true);
    const items: Array<{ company_id: string; deal_id: string; deal_name: string; fee_type: string; amount: number; target_date: string }> = [];
    Object.entries(rows || {}).forEach(([id, r]) => {
      const deal = deals.find(d => d.id === id);
      if (!deal) return;
      if (r.retainerEnabled && r.retainerAmt > 0) items.push({ company_id: company.id, deal_id: id, deal_name: deal.company, fee_type: 'retainer', amount: r.retainerAmt, target_date: r.date });
      if (r.milestoneEnabled && r.milestoneAmt > 0) items.push({ company_id: company.id, deal_id: id, deal_name: deal.company, fee_type: 'milestone', amount: r.milestoneAmt, target_date: r.date });
      if (r.closingEnabled && r.closingAmt > 0) items.push({ company_id: company.id, deal_id: id, deal_name: deal.company, fee_type: 'closing', amount: r.closingAmt, target_date: r.date });
    });
    if (items.length === 0) { setSaving(false); return; }
    const { error } = await supabase.from('cashflow_cash_in_items').insert(items);
    setSaving(false);
    if (!error) { onItemsAdded(); onClose(); setRows({}); setSearchQuery(''); setStageFilter([]); setStatusFilter([]); }
  }, [company?.id, rows, deals, onItemsAdded, onClose]);

  if (!open) return null;

  const hasFilters = stageFilter.length > 0 || statusFilter.length > 0;
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={11} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  };

  const allRetainer = filtered.length > 0 && filtered.every(d => rows[d.id]?.retainerEnabled);
  const allMilestone = filtered.length > 0 && filtered.every(d => rows[d.id]?.milestoneEnabled);
  const allClosing = filtered.length > 0 && filtered.every(d => rows[d.id]?.closingEnabled);

  const s = {
    overlay: { position: 'fixed' as const, inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    dialog: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, width: '92vw', maxWidth: 1200, height: '82vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))' },
    title: { fontSize: 16, fontWeight: 700, color: 'hsl(var(--foreground))' },
    toolbar: { display: 'flex', gap: 8, padding: '12px 20px', alignItems: 'center', flexWrap: 'wrap' as const, borderBottom: '1px solid hsl(var(--border))' },
    input: { background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '6px 10px 6px 30px', fontSize: 12, color: 'hsl(var(--foreground))', outline: 'none', width: 220 },
    filterBtn: { background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '5px 10px', fontSize: 11, color: 'hsl(var(--muted-foreground))', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
    filterBtnActive: { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
    dropdown: { position: 'absolute' as const, top: '100%', left: 0, marginTop: 4, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 8, zIndex: 10, minWidth: 180, maxHeight: 200, overflowY: 'auto' as const, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' },
    table: { flex: 1, overflowY: 'auto' as const, overflowX: 'auto' as const, minHeight: 0 },
    th: { padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, color: 'hsl(var(--muted-foreground))', borderBottom: '2px solid hsl(var(--border))', whiteSpace: 'nowrap' as const, cursor: 'pointer', userSelect: 'none' as const, position: 'sticky' as const, top: 0, background: 'hsl(var(--card))', zIndex: 2 },
    thCheck: { padding: '8px 10px', borderBottom: '2px solid hsl(var(--border))', position: 'sticky' as const, top: 0, background: 'hsl(var(--card))', zIndex: 2, textAlign: 'center' as const, minWidth: 110 },
    td: { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' as const, color: 'hsl(var(--foreground))' },
    tdCenter: { padding: '6px 10px', borderBottom: '1px solid hsl(var(--border))', textAlign: 'center' as const, minWidth: 110 },
    feeInput: { background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: 'hsl(var(--foreground))', width: 70, outline: 'none', textAlign: 'right' as const },
    dateInput: { background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: 'hsl(var(--foreground))', width: 130, outline: 'none' },
    footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid hsl(var(--border))' },
    footerStats: { fontSize: 12, color: 'hsl(var(--muted-foreground))' },
    btnGhost: { background: 'none', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '7px 16px', fontSize: 12, color: 'hsl(var(--muted-foreground))', cursor: 'pointer' },
    btnPrimary: { background: 'hsl(var(--primary))', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 600, color: 'hsl(var(--primary-foreground))', cursor: 'pointer' },
    dot: (color: string) => ({ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 5, flexShrink: 0 }),
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>Add Cash-In from Deals</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* Toolbar: search + filters */}
        <div style={s.toolbar}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))' }} />
            <input style={s.input} placeholder="Search deals..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus />
          </div>

          {/* Stage filter */}
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...s.filterBtn, ...(stageFilter.length > 0 ? s.filterBtnActive : {}) }}
              onClick={() => { setShowStageFilter(v => !v); setShowStatusFilter(false); }}
            >
              <Filter size={11} /> Stage {stageFilter.length > 0 && `(${stageFilter.length})`}
            </button>
            {showStageFilter && (
              <div style={s.dropdown}>
                {distinctStages.map(st => (
                  <label key={st} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 11, cursor: 'pointer', color: 'hsl(var(--foreground))' }}>
                    <input type="checkbox" checked={stageFilter.includes(st)} onChange={() => setStageFilter(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])} />
                    {stageLabel(st)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Status filter */}
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...s.filterBtn, ...(statusFilter.length > 0 ? s.filterBtnActive : {}) }}
              onClick={() => { setShowStatusFilter(v => !v); setShowStageFilter(false); }}
            >
              <Filter size={11} /> Status {statusFilter.length > 0 && `(${statusFilter.length})`}
            </button>
            {showStatusFilter && (
              <div style={s.dropdown}>
                {distinctStatuses.map(st => (
                  <label key={st} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 11, cursor: 'pointer', color: 'hsl(var(--foreground))' }}>
                    <input type="checkbox" checked={statusFilter.includes(st)} onChange={() => setStatusFilter(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])} />
                    <span style={s.dot(STATUS_COLORS[st] || '#888')} />
                    {statusLabel(st)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button style={{ ...s.filterBtn, fontSize: 10 }} onClick={() => { setStageFilter([]); setStatusFilter([]); }}>
              Clear Filters
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
            {filtered.length} deal{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div style={s.table} onClick={() => { setShowStageFilter(false); setShowStatusFilter(false); }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Loading deals...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
              {searchQuery || hasFilters ? 'No deals match filters' : 'No active deals found'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...s.th, cursor: 'default', width: 30 }}></th>
                  <th style={s.th} onClick={() => toggleSort('company')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Deal Name <SortIcon col="company" /></span>
                  </th>
                  <th style={s.th} onClick={() => toggleSort('stage')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Stage <SortIcon col="stage" /></span>
                  </th>
                  <th style={s.th} onClick={() => toggleSort('status')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Status <SortIcon col="status" /></span>
                  </th>
                  <th style={s.th} onClick={() => toggleSort('value')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Deal Size <SortIcon col="value" /></span>
                  </th>
                  <th style={s.thCheck}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <input type="checkbox" checked={allRetainer} onChange={() => bulkToggleFee('retainerEnabled')} style={{ accentColor: 'hsl(var(--primary))' }} />
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Retainer</span>
                    </div>
                  </th>
                  <th style={s.thCheck}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <input type="checkbox" checked={allMilestone} onChange={() => bulkToggleFee('milestoneEnabled')} style={{ accentColor: 'hsl(var(--primary))' }} />
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Milestone</span>
                    </div>
                  </th>
                  <th style={s.thCheck}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <input type="checkbox" checked={allClosing} onChange={() => bulkToggleFee('closingEnabled')} style={{ accentColor: 'hsl(var(--primary))' }} />
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>Closing</span>
                    </div>
                  </th>
                  <th style={{ ...s.th, cursor: 'default' }}>Target Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(deal => {
                  const r = rows[deal.id];
                  if (!r) return null;
                  const anyEnabled = r.retainerEnabled || r.milestoneEnabled || r.closingEnabled;
                  const rowBg = anyEnabled ? 'hsl(var(--primary) / 0.04)' : 'transparent';

                  return (
                    <tr key={deal.id} style={{ background: rowBg, transition: 'background 0.15s' }}>
                      <td style={s.td}>
                        <span style={s.dot(STATUS_COLORS[deal.status || ''] || '#888')} />
                      </td>
                      <td style={{ ...s.td, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {deal.company || 'Unnamed'}
                      </td>
                      <td style={{ ...s.td, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                        {stageLabel(deal.stage)}
                      </td>
                      <td style={{ ...s.td, fontSize: 11 }}>
                        {statusLabel(deal.status)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {deal.value ? fmtShort(deal.value) : '—'}
                      </td>

                      {/* Retainer */}
                      <td style={s.tdCenter}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28 }}>
                          <input type="checkbox" checked={r.retainerEnabled} onChange={e => updateRow(deal.id, { retainerEnabled: e.target.checked })} style={{ accentColor: 'hsl(var(--primary))', margin: 0, flexShrink: 0 }} />
                          {r.retainerEnabled ? (
                            <input type="number" style={s.feeInput} value={r.retainerAmt || ''} onChange={e => updateRow(deal.id, { retainerAmt: parseFloat(e.target.value) || 0 })} />
                          ) : (
                            <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', minWidth: 40, textAlign: 'right' as const }}>{r.retainerAmt > 0 ? fmtShort(r.retainerAmt) : '—'}</span>
                          )}
                        </div>
                      </td>

                      {/* Milestone */}
                      <td style={s.tdCenter}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28 }}>
                          <input type="checkbox" checked={r.milestoneEnabled} onChange={e => updateRow(deal.id, { milestoneEnabled: e.target.checked })} style={{ accentColor: 'hsl(var(--primary))', margin: 0, flexShrink: 0 }} />
                          {r.milestoneEnabled ? (
                            <input type="number" style={s.feeInput} value={r.milestoneAmt || ''} onChange={e => updateRow(deal.id, { milestoneAmt: parseFloat(e.target.value) || 0 })} />
                          ) : (
                            <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', minWidth: 40, textAlign: 'right' as const }}>{r.milestoneAmt > 0 ? fmtShort(r.milestoneAmt) : '—'}</span>
                          )}
                        </div>
                      </td>

                      {/* Closing */}
                      <td style={s.tdCenter}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28 }}>
                          <input type="checkbox" checked={r.closingEnabled} onChange={e => updateRow(deal.id, { closingEnabled: e.target.checked })} style={{ accentColor: 'hsl(var(--primary))', margin: 0, flexShrink: 0 }} />
                          {r.closingEnabled ? (
                            <input type="number" style={s.feeInput} value={r.closingAmt || ''} onChange={e => updateRow(deal.id, { closingAmt: parseFloat(e.target.value) || 0 })} />
                          ) : (
                            <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', minWidth: 40, textAlign: 'right' as const }}>{r.closingAmt > 0 ? fmtShort(r.closingAmt) : '—'}</span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td style={s.td}>
                        {anyEnabled ? (
                          <input type="date" style={s.dateInput} value={r.date} onChange={e => updateRow(deal.id, { date: e.target.value })} />
                        ) : (
                          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.footerStats}>
            {summary.dealCount} deal{summary.dealCount !== 1 ? 's' : ''} · {summary.feeCount} fee{summary.feeCount !== 1 ? 's' : ''} selected · <strong>{fmtShort(summary.total)}</strong> total
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btnGhost} onClick={onClose}>Cancel</button>
            <button
              style={{ ...s.btnPrimary, opacity: summary.feeCount === 0 || saving ? 0.5 : 1 }}
              onClick={handleSave}
              disabled={summary.feeCount === 0 || saving}
            >
              {saving ? 'Saving...' : `Add ${summary.feeCount} Item${summary.feeCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
