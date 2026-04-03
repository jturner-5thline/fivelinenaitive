import { memo } from 'react';
import type { SidebarData } from './types';
import { fmtShort } from './formatters';

interface SidebarItem {
  id?: string;
  name: string;
  amount: number;
  date: string;
}

interface WeeklySidebarProps {
  data: SidebarData;
  dbItems: SidebarItem[];
  isAdmin: boolean;
  onEditItem: (index: number, field: string, value: string | number) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  onRemoveDbItem: (id: string) => void;
  onNoteEdit: (index: number, value: string) => void;
  onNoteRemove: (index: number) => void;
  onNoteAdd: () => void;
}

export const WeeklySidebar = memo(function WeeklySidebar({
  data, dbItems, isAdmin, onEditItem, onRemoveItem, onAddItem, onRemoveDbItem,
  onNoteEdit, onNoteRemove, onNoteAdd,
}: WeeklySidebarProps) {
  const cashInItems = Array.isArray(data?.cash_in_next_8_weeks) ? data.cash_in_next_8_weeks : [];
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  const dbEntries = dbItems || [];
  const manualTotal = cashInItems.reduce((s, i) => s + i.amount, 0);
  const dbTotal = dbEntries.reduce((s, i) => s + i.amount, 0);
  const total = manualTotal + dbTotal;

  return (
    <div className="cf-weekly-sidebar">
      <div className="cf-sidebar-card">
        <div className="cf-sidebar-title">Cash-In: Next 8 Weeks</div>
        <div className="cf-sidebar-total">{fmtShort(total)}</div>

        {/* DB-backed deal items */}
        {dbEntries.map((item) => (
          <div key={item.id} className="cf-pipeline-item">
            <span className="cf-pipeline-name" style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>
              {item.name}
            </span>
            <span className="cf-pipeline-amount">{fmtShort(item.amount)}</span>
            <span className="cf-pipeline-date">
              {new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {isAdmin && item.id && (
              <button
                className="cf-row-remove"
                style={{ opacity: 1, fontSize: '12px' }}
                onClick={() => onRemoveDbItem(item.id!)}
              >×</button>
            )}
          </div>
        ))}

        {/* Manual items */}
        {cashInItems.map((item, i) => (
          <div key={`manual-${i}`} className="cf-pipeline-item">
            {isAdmin ? (
              <input
                className="cf-pipeline-name"
                value={item.name}
                onChange={e => onEditItem(i, 'name', e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  padding: 0,
                  width: '100%',
                }}
              />
            ) : (
              <span className="cf-pipeline-name">{item.name}</span>
            )}
            <span className="cf-pipeline-amount">{fmtShort(item.amount)}</span>
            <span className="cf-pipeline-date">
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {isAdmin && (
              <button
                className="cf-row-remove"
                style={{ opacity: 1, fontSize: '12px' }}
                onClick={() => onRemoveItem(i)}
              >×</button>
            )}
          </div>
        ))}

        {isAdmin && (
          <button className="cf-btn cf-btn-ghost" onClick={onAddItem} style={{ fontSize: '11px', marginTop: 8 }}>
            + Add Item
          </button>
        )}
      </div>

      <div className="cf-sidebar-card">
        <div className="cf-sidebar-title">Notes & Key Items</div>
        {notes.map((note, i) => (
          <div key={i} className="cf-note-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            {isAdmin ? (
              <>
                <textarea
                  value={note}
                  onChange={e => onNoteEdit(i, e.target.value)}
                  rows={2}
                  style={{
                    flex: 1,
                    background: 'var(--color-surface-offset)',
                    border: '1px solid var(--color-divider)',
                    borderRadius: '4px',
                    color: 'var(--color-text)',
                    fontSize: 'var(--text-xs)',
                    padding: '4px 6px',
                    resize: 'vertical',
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: 1.4,
                  }}
                />
                <button
                  className="cf-row-remove"
                  style={{ opacity: 1, fontSize: '12px', flexShrink: 0, marginTop: '2px' }}
                  onClick={() => onNoteRemove(i)}
                >×</button>
              </>
            ) : (
              <span>{note}</span>
            )}
          </div>
        ))}
        {isAdmin && (
          <button className="cf-btn cf-btn-ghost" onClick={onNoteAdd} style={{ fontSize: '11px', marginTop: 8 }}>
            + Add Note
          </button>
        )}
      </div>
    </div>
  );
});
