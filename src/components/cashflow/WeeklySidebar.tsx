import { memo } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { SidebarData } from './types';
import type { CellComment } from './cellComments/types';
import { fmtShort, fmtAbbrev } from './formatters';
import { authorDisplay, authorInitials, formatAbsoluteTime, formatRelativeTime } from './cellComments/formatAuthor';

export interface SidebarItem {
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
  cellComments?: CellComment[];
  currentUserId?: string | null;
  onCellCommentClick?: (comment: CellComment) => void;
  onCellCommentDelete?: (comment: CellComment) => void;
}

interface CashInPanelProps {
  data: SidebarData;
  dbItems: SidebarItem[];
  isAdmin: boolean;
  onEditItem: (index: number, field: string, value: string | number) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  onRemoveDbItem: (id: string) => void;
}

export const CashInPanel = memo(function CashInPanel({
  data, dbItems, isAdmin, onEditItem, onRemoveItem, onAddItem, onRemoveDbItem,
}: CashInPanelProps) {
  const cashInItems = Array.isArray(data?.cash_in_next_8_weeks) ? data.cash_in_next_8_weeks : [];
  const dbEntries = dbItems || [];
  const manualTotal = cashInItems.reduce((s, i) => s + i.amount, 0);
  const dbTotal = dbEntries.reduce((s, i) => s + i.amount, 0);
  const total = manualTotal + dbTotal;

  return (
    <div className="cf-sidebar-card" style={{ marginBottom: 0 }}>
      <div className="cf-sidebar-title">Cash-In: Next 8 Weeks</div>
      <div className="cf-sidebar-total">{fmtShort(total)}</div>

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
  );
});

export function computeCashInTotal(data: SidebarData, dbItems: SidebarItem[]): number {
  const cashInItems = Array.isArray(data?.cash_in_next_8_weeks) ? data.cash_in_next_8_weeks : [];
  const dbEntries = dbItems || [];
  const manualTotal = cashInItems.reduce((s, i) => s + i.amount, 0);
  const dbTotal = dbEntries.reduce((s, i) => s + i.amount, 0);
  return manualTotal + dbTotal;
}

interface NotesPanelProps {
  data: SidebarData;
  isAdmin: boolean;
  onNoteEdit: (index: number, value: string) => void;
  onNoteRemove: (index: number) => void;
  onNoteAdd: () => void;
  cellComments?: CellComment[];
  currentUserId?: string | null;
  onCellCommentClick?: (comment: CellComment) => void;
  onCellCommentDelete?: (comment: CellComment) => void;
}

export const NotesPanel = memo(function NotesPanel({
  data, isAdmin, onNoteEdit, onNoteRemove, onNoteAdd,
  cellComments = [], currentUserId, onCellCommentClick, onCellCommentDelete,
}: NotesPanelProps) {
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  const topLevelCellComments = cellComments
    .filter(c => !c.parent_comment_id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="cf-sidebar-card" style={{ marginBottom: 0 }}>
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

      <div className="cf-cell-comments-section">
        <div className="cf-cell-comments-title">
          <MessageSquare size={11} />
          Cell Comments
          <span style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--color-text-faint)' }}>
            {topLevelCellComments.length}
          </span>
        </div>
        {topLevelCellComments.length === 0 ? (
          <div style={{ fontSize: '10px', color: 'var(--color-text-faint)', fontStyle: 'italic' }}>
            Right-click any cell to add a comment.
          </div>
        ) : (
          topLevelCellComments.map((c) => {
            const canDelete = currentUserId === c.created_by;
            const valueLabel = c.cell_value_snapshot !== null && c.cell_value_snapshot !== 0
              ? fmtAbbrev(c.cell_value_snapshot)
              : '—';
            return (
              <div
                key={c.id}
                className="cf-cell-comment-card"
                role="button"
                tabIndex={0}
                onClick={() => onCellCommentClick?.(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCellCommentClick?.(c);
                  }
                }}
              >
                <div className="cf-cell-comment-header-row">
                  <span className="cf-cell-comment-pill">Cell</span>
                  <span style={{ fontWeight: 600 }}>{c.line_item_label}</span>
                  <span className="cf-cell-comment-meta-pill">
                    {formatWeekHeader(c.week_key, c.week_num, c.week_ending)}
                  </span>
                  <span className="cf-cell-comment-meta-pill">{valueLabel}</span>
                </div>
                <div
                  className="cf-cell-comment-body"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.content_html || '', { USE_PROFILES: { html: true } }) }}
                />
                <div className="cf-cell-comment-footer">
                  <span className="cf-cell-comment-author-avatar" aria-hidden>{authorInitials(c)}</span>
                  <span>— {authorDisplay(c)}</span>
                  <span title={formatAbsoluteTime(c.created_at)} style={{ marginLeft: 'auto' }}>
                    {formatRelativeTime(c.created_at)}
                  </span>
                  {canDelete && onCellCommentDelete && (
                    <button
                      type="button"
                      className="cf-row-remove"
                      style={{
                        opacity: 0.7,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        marginLeft: 4,
                        cursor: 'pointer',
                        color: 'var(--color-negative)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCellCommentDelete(c);
                      }}
                      aria-label="Delete comment"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

function formatWeekHeader(weekKey: string, weekNum: number | null, weekEnding: string | null): string {
  const dateSrc = weekEnding || weekKey;
  const d = new Date(dateSrc + 'T00:00:00');
  const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return weekNum ? `WK ${weekNum} – ${fmt}` : fmt;
}

export const WeeklySidebar = memo(function WeeklySidebar({
  data, dbItems, isAdmin, onEditItem, onRemoveItem, onAddItem, onRemoveDbItem,
  onNoteEdit, onNoteRemove, onNoteAdd,
  cellComments = [],
  currentUserId,
  onCellCommentClick,
  onCellCommentDelete,
}: WeeklySidebarProps) {
  const cashInItems = Array.isArray(data?.cash_in_next_8_weeks) ? data.cash_in_next_8_weeks : [];
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  const dbEntries = dbItems || [];
  const manualTotal = cashInItems.reduce((s, i) => s + i.amount, 0);
  const dbTotal = dbEntries.reduce((s, i) => s + i.amount, 0);
  const total = manualTotal + dbTotal;

  // Top-level (non-reply) cell comments, newest first
  const topLevelCellComments = cellComments
    .filter(c => !c.parent_comment_id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

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

        {/* === Cell Comments sub-section === */}
        <div className="cf-cell-comments-section">
          <div className="cf-cell-comments-title">
            <MessageSquare size={11} />
            Cell Comments
            <span style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--color-text-faint)' }}>
              {topLevelCellComments.length}
            </span>
          </div>
          {topLevelCellComments.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--color-text-faint)', fontStyle: 'italic' }}>
              Right-click any cell to add a comment.
            </div>
          ) : (
            topLevelCellComments.map((c) => {
              const canDelete = currentUserId === c.created_by;
              const valueLabel = c.cell_value_snapshot !== null && c.cell_value_snapshot !== 0
                ? fmtAbbrev(c.cell_value_snapshot)
                : '—';
              return (
                <div
                  key={c.id}
                  className="cf-cell-comment-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => onCellCommentClick?.(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCellCommentClick?.(c);
                    }
                  }}
                >
                  <div className="cf-cell-comment-header-row">
                    <span className="cf-cell-comment-pill">Cell</span>
                    <span style={{ fontWeight: 600 }}>{c.line_item_label}</span>
                    <span className="cf-cell-comment-meta-pill">
                      {formatWeekHeader(c.week_key, c.week_num, c.week_ending)}
                    </span>
                    <span className="cf-cell-comment-meta-pill">{valueLabel}</span>
                  </div>
                  <div
                    className="cf-cell-comment-body"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.content_html || '', { USE_PROFILES: { html: true } }) }}
                  />
                  <div className="cf-cell-comment-footer">
                    <span className="cf-cell-comment-author-avatar" aria-hidden>{authorInitials(c)}</span>
                    <span>— {authorDisplay(c)}</span>
                    <span title={formatAbsoluteTime(c.created_at)} style={{ marginLeft: 'auto' }}>
                      {formatRelativeTime(c.created_at)}
                    </span>
                    {canDelete && onCellCommentDelete && (
                      <button
                        type="button"
                        className="cf-row-remove"
                        style={{
                          opacity: 0.7,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          marginLeft: 4,
                          cursor: 'pointer',
                          color: 'var(--color-negative)',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCellCommentDelete(c);
                        }}
                        aria-label="Delete comment"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});
