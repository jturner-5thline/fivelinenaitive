import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { format } from 'date-fns';
import { Search, X, ChevronDown, ChevronRight, Calendar, DollarSign } from 'lucide-react';
import { fmtShort } from './formatters';

interface Deal {
  id: string;
  company: string;
  stage: string | null;
  value: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  success_fee_percent: number | null;
  total_fee: number | null;
}

interface FeeSelection {
  enabled: boolean;
  amount: number;
  date: string;
}

interface DealSelection {
  deal: Deal;
  retainer: FeeSelection;
  milestone: FeeSelection;
  closing: FeeSelection;
}

interface AddCashInModalProps {
  open: boolean;
  onClose: () => void;
  onItemsAdded: () => void;
}

export function AddCashInModal({ open, onClose, onItemsAdded }: AddCashInModalProps) {
  const { company } = useCompany();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selections, setSelections] = useState<Record<string, DealSelection>>({});
  const [expandedDeals, setExpandedDeals] = useState<Set<string>>(new Set());

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  useEffect(() => {
    if (!open || !company?.id) return;
    setLoading(true);
    supabase
      .from('deals')
      .select('id, company, stage, value, retainer_fee, milestone_fee, success_fee_percent, total_fee')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .order('company', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setDeals(data as Deal[]);
        setLoading(false);
      });
  }, [open, company?.id]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return deals;
    const q = searchQuery.toLowerCase();
    return deals.filter(d =>
      d.company?.toLowerCase().includes(q) ||
      d.stage?.toLowerCase().includes(q)
    );
  }, [deals, searchQuery]);

  const toggleDealExpand = useCallback((dealId: string) => {
    setExpandedDeals(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) {
        next.delete(dealId);
        // Also remove selection
        setSelections(s => {
          const copy = { ...s };
          delete copy[dealId];
          return copy;
        });
      } else {
        next.add(dealId);
        // Initialize selection with deal defaults
        const deal = deals.find(d => d.id === dealId);
        if (deal) {
          setSelections(s => ({
            ...s,
            [dealId]: {
              deal,
              retainer: { enabled: false, amount: deal.retainer_fee || 0, date: todayStr },
              milestone: { enabled: false, amount: deal.milestone_fee || 0, date: todayStr },
              closing: { enabled: false, amount: deal.total_fee || 0, date: todayStr },
            },
          }));
        }
      }
      return next;
    });
  }, [deals, todayStr]);

  const updateFee = useCallback((dealId: string, feeType: 'retainer' | 'milestone' | 'closing', field: keyof FeeSelection, value: boolean | number | string) => {
    setSelections(prev => ({
      ...prev,
      [dealId]: {
        ...prev[dealId],
        [feeType]: { ...prev[dealId][feeType], [field]: value },
      },
    }));
  }, []);

  const selectedCount = useMemo(() => {
    return Object.values(selections).reduce((count, sel) => {
      return count + (sel.retainer.enabled ? 1 : 0) + (sel.milestone.enabled ? 1 : 0) + (sel.closing.enabled ? 1 : 0);
    }, 0);
  }, [selections]);

  const handleSave = useCallback(async () => {
    if (!company?.id) return;
    setSaving(true);

    const items: Array<{
      company_id: string;
      deal_id: string;
      deal_name: string;
      fee_type: string;
      amount: number;
      target_date: string;
    }> = [];

    for (const sel of Object.values(selections)) {
      if (sel.retainer.enabled && sel.retainer.amount > 0) {
        items.push({
          company_id: company.id,
          deal_id: sel.deal.id,
          deal_name: sel.deal.company,
          fee_type: 'retainer',
          amount: sel.retainer.amount,
          target_date: sel.retainer.date,
        });
      }
      if (sel.milestone.enabled && sel.milestone.amount > 0) {
        items.push({
          company_id: company.id,
          deal_id: sel.deal.id,
          deal_name: sel.deal.company,
          fee_type: 'milestone',
          amount: sel.milestone.amount,
          target_date: sel.milestone.date,
        });
      }
      if (sel.closing.enabled && sel.closing.amount > 0) {
        items.push({
          company_id: company.id,
          deal_id: sel.deal.id,
          deal_name: sel.deal.company,
          fee_type: 'closing',
          amount: sel.closing.amount,
          target_date: sel.closing.date,
        });
      }
    }

    if (items.length === 0) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('cashflow_cash_in_items').insert(items);
    setSaving(false);

    if (!error) {
      onItemsAdded();
      onClose();
      setSelections({});
      setExpandedDeals(new Set());
      setSearchQuery('');
    }
  }, [company?.id, selections, onItemsAdded, onClose]);

  if (!open) return null;

  const feeLabel = (type: string) => {
    switch (type) {
      case 'retainer': return 'Retainer Fee';
      case 'milestone': return 'Milestone Fee';
      case 'closing': return 'Closing / Success Fee';
      default: return type;
    }
  };

  return (
    <div className="cf-overlay" onClick={onClose}>
      <div
        className="cf-dialog"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 640, width: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="cf-dialog-title" style={{ margin: 0 }}>Add Cash-In from Deals</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="cf-input"
            placeholder="Search deals..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 30, width: '100%' }}
            autoFocus
          />
        </div>

        {/* Deal list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)', fontSize: 13 }}>
              Loading deals...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)', fontSize: 13 }}>
              {searchQuery ? 'No deals match your search' : 'No active deals found'}
            </div>
          ) : (
            filtered.map(deal => {
              const isExpanded = expandedDeals.has(deal.id);
              const sel = selections[deal.id];

              return (
                <div
                  key={deal.id}
                  style={{
                    border: '1px solid var(--color-divider)',
                    borderRadius: 8,
                    marginBottom: 8,
                    background: isExpanded ? 'var(--color-surface-offset)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Deal header row */}
                  <div
                    onClick={() => toggleDealExpand(deal.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
                        {deal.company || 'Unnamed Deal'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {deal.stage || 'No stage'} · {deal.value ? fmtShort(deal.value) : 'No value'}
                      </div>
                    </div>
                  </div>

                  {/* Fee selection panel */}
                  {isExpanded && sel && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(['retainer', 'milestone', 'closing'] as const).map(feeType => {
                        const fee = sel[feeType];
                        return (
                          <div
                            key={feeType}
                            style={{
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-divider)',
                              borderRadius: 6,
                              padding: '8px 10px',
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: fee.enabled ? 8 : 0 }}>
                              <input
                                type="checkbox"
                                checked={fee.enabled}
                                onChange={e => updateFee(deal.id, feeType, 'enabled', e.target.checked)}
                                style={{ accentColor: 'var(--color-accent)' }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
                                {feeLabel(feeType)}
                              </span>
                              {!fee.enabled && fee.amount > 0 && (
                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                                  {fmtShort(fee.amount)}
                                </span>
                              )}
                            </label>

                            {fee.enabled && (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <DollarSign size={10} /> Amount
                                  </label>
                                  <input
                                    type="number"
                                    className="cf-input"
                                    value={fee.amount || ''}
                                    onChange={e => updateFee(deal.id, feeType, 'amount', parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    style={{ width: '100%' }}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <Calendar size={10} /> Target Date
                                  </label>
                                  <input
                                    type="date"
                                    className="cf-input"
                                    value={fee.date}
                                    onChange={e => updateFee(deal.id, feeType, 'date', e.target.value)}
                                    style={{ width: '100%' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="cf-dialog-actions" style={{ marginTop: 12, borderTop: '1px solid var(--color-divider)', paddingTop: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {selectedCount} fee{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cf-btn cf-btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="cf-btn cf-btn-primary"
              onClick={handleSave}
              disabled={selectedCount === 0 || saving}
            >
              {saving ? 'Saving...' : `Add ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
