import { memo } from 'react';
import type { SidebarData } from './types';
import { fmtShort } from './formatters';

interface WeeklySidebarProps {
  data: SidebarData;
  isAdmin: boolean;
  onEditItem: (index: number, field: string, value: string | number) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
}

export const WeeklySidebar = memo(function WeeklySidebar({
  data, isAdmin, onEditItem, onRemoveItem, onAddItem,
}: WeeklySidebarProps) {
  const total = data.cash_in_next_8_weeks.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="cf-weekly-sidebar">
      <div className="cf-sidebar-card">
        <div className="cf-sidebar-title">Cash-In: Next 8 Weeks</div>
        <div className="cf-sidebar-total">{fmtShort(total)}</div>
        {data.cash_in_next_8_weeks.map((item, i) => (
          <div key={i} className="cf-pipeline-item">
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
        {data.notes.map((note, i) => (
          <div key={i} className="cf-note-item">{note}</div>
        ))}
      </div>
    </div>
  );
});
