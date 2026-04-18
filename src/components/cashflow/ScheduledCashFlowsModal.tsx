import { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus } from 'lucide-react';
import {
  ACCOUNT_OPTIONS,
  CASH_IN_CATEGORIES,
  CASH_OUT_CATEGORIES,
  DAY_OF_WEEK_LABELS,
  type ScheduledCashFlow,
  type FrequencyType,
  type FlowType,
} from './scheduledCashFlows';

interface Props {
  open: boolean;
  initialEntries: ScheduledCashFlow[];
  onClose: () => void;
  onSave: (entries: ScheduledCashFlow[]) => Promise<boolean>;
}

type DraftEntry = Omit<ScheduledCashFlow, 'id' | 'company_id'> & { id?: string; _draftId: string };

function newDraft(): DraftEntry {
  const today = new Date().toISOString().slice(0, 10);
  return {
    _draftId: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    account: ACCOUNT_OPTIONS[0],
    category: CASH_IN_CATEGORIES[0],
    amount: 0,
    frequency_type: 'one_time',
    frequency_config: { one_time_date: today },
    flow_type: 'cash_in',
    start_date: today,
    end_date: null,
    notes: null,
  };
}

export function ScheduledCashFlowsModal({ open, initialEntries, onClose, onSave }: Props) {
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDrafts(
      initialEntries.map((e) => ({
        ...e,
        _draftId: e.id,
        frequency_config: e.frequency_config || {},
      }))
    );
  }, [open, initialEntries]);

  const updateRow = useCallback((draftId: string, patch: Partial<DraftEntry>) => {
    setDrafts((prev) => prev.map((d) => (d._draftId === draftId ? { ...d, ...patch } : d)));
  }, []);

  const updateConfig = useCallback((draftId: string, patch: Record<string, any>) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d._draftId === draftId
          ? { ...d, frequency_config: { ...(d.frequency_config || {}), ...patch } }
          : d
      )
    );
  }, []);

  const addRow = () => setDrafts((prev) => [...prev, newDraft()]);
  const deleteRow = (id: string) => setDrafts((prev) => prev.filter((d) => d._draftId !== id));

  const handleFlowChange = (draftId: string, flow: FlowType) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._draftId !== draftId) return d;
        const validCats = flow === 'cash_in' ? CASH_IN_CATEGORIES : CASH_OUT_CATEGORIES;
        const category = (validCats as readonly string[]).includes(d.category)
          ? d.category
          : validCats[0];
        return { ...d, flow_type: flow, category };
      })
    );
  };

  const handleFrequencyChange = (draftId: string, freq: FrequencyType) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._draftId !== draftId) return d;
        const today = new Date().toISOString().slice(0, 10);
        let cfg: Record<string, any> = {};
        if (freq === 'one_time') cfg = { one_time_date: d.frequency_config?.one_time_date || today };
        if (freq === 'weekly') cfg = { day_of_week: d.frequency_config?.day_of_week ?? 1 };
        if (freq === 'monthly_first' || freq === 'monthly_last')
          cfg = { ordinal_day_of_week: d.frequency_config?.ordinal_day_of_week ?? 1 };
        if (freq === 'monthly_day') cfg = { day_of_month: d.frequency_config?.day_of_month ?? 1 };
        return { ...d, frequency_type: freq, frequency_config: cfg };
      })
    );
  };

  const validate = (): { ok: boolean; error?: string } => {
    for (const d of drafts) {
      if (!d.account) return { ok: false, error: 'Account is required for all rows' };
      if (!d.category) return { ok: false, error: 'Category is required for all rows' };
      if (!(Number(d.amount) > 0)) return { ok: false, error: 'Amount must be greater than 0' };
      if (d.frequency_type === 'one_time' && !d.frequency_config?.one_time_date) {
        return { ok: false, error: 'One-time entries require a date' };
      }
      if (!d.start_date && d.frequency_type !== 'one_time') {
        return { ok: false, error: 'Recurring entries require a Start Date' };
      }
    }
    return { ok: true };
  };

  const handleSave = async () => {
    const v = validate();
    if (!v.ok) {
      alert(v.error);
      return;
    }
    setSaving(true);
    const entries: ScheduledCashFlow[] = drafts.map((d) => ({
      id: d.id || '',
      company_id: '',
      account: d.account,
      category: d.category,
      amount: Number(d.amount),
      frequency_type: d.frequency_type,
      frequency_config: d.frequency_config || {},
      flow_type: d.flow_type,
      start_date: d.start_date,
      end_date: d.end_date,
      notes: d.notes,
    }));
    const ok = await onSave(entries);
    setSaving(false);
    if (ok) onClose();
    else alert('Failed to save. Please try again.');
  };

  if (!open) return null;

  return (
    <div className="cf-overlay" onClick={onClose}>
      <div
        className="cf-dialog"
        style={{ maxWidth: 1200, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cf-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Configure Payments &amp; Revenue</span>
          <button className="cf-btn cf-btn-secondary" onClick={addRow}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Add Entry
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', marginTop: 12 }}>
          {drafts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-muted)' }}>
              No scheduled entries yet. Click "Add Entry" to create one.
            </div>
          ) : (
            <table className="cf-grid" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 160, textAlign: 'left' }}>Account</th>
                  <th style={{ minWidth: 200, textAlign: 'left' }}>Category</th>
                  <th style={{ minWidth: 120, textAlign: 'left' }}>Amount ($)</th>
                  <th style={{ minWidth: 320, textAlign: 'left' }}>Frequency</th>
                  <th style={{ minWidth: 140, textAlign: 'left' }}>Type</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const cats = d.flow_type === 'cash_in' ? CASH_IN_CATEGORIES : CASH_OUT_CATEGORIES;
                  return (
                    <tr key={d._draftId}>
                      <td>
                        <select
                          className="cf-select"
                          style={{ width: '100%' }}
                          value={d.account}
                          onChange={(e) => updateRow(d._draftId, { account: e.target.value })}
                        >
                          {ACCOUNT_OPTIONS.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="cf-select"
                          style={{ width: '100%' }}
                          value={d.category}
                          onChange={(e) => updateRow(d._draftId, { category: e.target.value })}
                        >
                          {cats.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="cf-input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={d.amount}
                          onChange={(e) => updateRow(d._draftId, { amount: Number(e.target.value) })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <select
                            className="cf-select"
                            value={d.frequency_type}
                            onChange={(e) => handleFrequencyChange(d._draftId, e.target.value as FrequencyType)}
                          >
                            <option value="one_time">1-Time</option>
                            <option value="weekly">Weekly on [Day of Week]</option>
                            <option value="monthly_first">Monthly — First [Day] of the month</option>
                            <option value="monthly_last">Monthly — Last [Day] of the month</option>
                            <option value="monthly_day">Monthly on the [X] day of the month</option>
                          </select>

                          {d.frequency_type === 'one_time' && (
                            <input
                              type="date"
                              className="cf-input"
                              value={d.frequency_config?.one_time_date || ''}
                              onChange={(e) => updateConfig(d._draftId, { one_time_date: e.target.value })}
                            />
                          )}

                          {d.frequency_type === 'weekly' && (
                            <select
                              className="cf-select"
                              value={d.frequency_config?.day_of_week ?? 1}
                              onChange={(e) => updateConfig(d._draftId, { day_of_week: Number(e.target.value) })}
                            >
                              {DAY_OF_WEEK_LABELS.map((label, idx) => (
                                <option key={idx} value={idx}>{label}</option>
                              ))}
                            </select>
                          )}

                          {(d.frequency_type === 'monthly_first' || d.frequency_type === 'monthly_last') && (
                            <select
                              className="cf-select"
                              value={d.frequency_config?.ordinal_day_of_week ?? 1}
                              onChange={(e) => updateConfig(d._draftId, { ordinal_day_of_week: Number(e.target.value) })}
                            >
                              {DAY_OF_WEEK_LABELS.map((label, idx) => (
                                <option key={idx} value={idx}>{label}</option>
                              ))}
                            </select>
                          )}

                          {d.frequency_type === 'monthly_day' && (
                            <input
                              type="number"
                              min={1}
                              max={31}
                              className="cf-input"
                              value={d.frequency_config?.day_of_month ?? 1}
                              onChange={(e) => updateConfig(d._draftId, { day_of_month: Math.min(31, Math.max(1, Number(e.target.value))) })}
                            />
                          )}

                          {d.frequency_type !== 'one_time' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                type="date"
                                className="cf-input"
                                title="Start date"
                                value={d.start_date || ''}
                                onChange={(e) => updateRow(d._draftId, { start_date: e.target.value })}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="date"
                                className="cf-input"
                                title="End date (optional)"
                                value={d.end_date || ''}
                                onChange={(e) => updateRow(d._draftId, { end_date: e.target.value || null })}
                                style={{ flex: 1 }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => handleFlowChange(d._draftId, 'cash_in')}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid var(--color-positive)',
                              background: d.flow_type === 'cash_in' ? 'var(--color-positive)' : 'transparent',
                              color: d.flow_type === 'cash_in' ? 'white' : 'var(--color-positive)',
                              cursor: 'pointer',
                            }}
                          >
                            Cash-In
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFlowChange(d._draftId, 'cash_out')}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid var(--color-negative)',
                              background: d.flow_type === 'cash_out' ? 'var(--color-negative)' : 'transparent',
                              color: d.flow_type === 'cash_out' ? 'white' : 'var(--color-negative)',
                              cursor: 'pointer',
                            }}
                          >
                            Cash-Out
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          className="cf-btn cf-btn-ghost"
                          onClick={() => deleteRow(d._draftId)}
                          title="Delete row"
                          style={{ padding: 6 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="cf-dialog-actions" style={{ marginTop: 12 }}>
          <button className="cf-btn cf-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cf-btn cf-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
