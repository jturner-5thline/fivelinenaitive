import { useState, useCallback, useRef, memo } from 'react';
import { ChevronDown, ChevronRight, Upload } from 'lucide-react';
import type { DailyData, DailyRowStructure, RecurringTag } from './types';
import { fmt } from './formatters';
import { useGridWheelPassthrough } from './useGridWheelPassthrough';

interface DailySourceTabProps {
  data: DailyData;
  rowStructure: DailyRowStructure;
  recurringTags: RecurringTag[];
  isAdmin: boolean;
  onCellEdit: (rowKey: string, colIdx: number, value: number) => void;
  onRowRemove: (rowKey: string) => void;
  onRowAdd: (section: string, label: string, entity: string) => void;
  onRowRename: (rowKey: string, newLabel: string) => void;
  onRecurringTag: (rowKey: string, frequency: string, date: string) => void;
  onImportExcel?: () => void;
  isImportLoading?: boolean;
}

interface EditingCell {
  rowKey: string;
  colIdx: number;
}

export const DailySourceTab = memo(function DailySourceTab({
  data, rowStructure, recurringTags, isAdmin,
  onCellEdit, onRowRemove, onRowAdd, onRowRename, onImportExcel, isImportLoading,
}: DailySourceTabProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addRowSection, setAddRowSection] = useState<string | null>(null);
  const [newRowName, setNewRowName] = useState('');
  const [newRowEntity, setNewRowEntity] = useState('5LC');
  const inputRef = useRef<HTMLInputElement>(null);
  const gridWrapRef = useGridWheelPassthrough<HTMLDivElement>();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleCellClick = useCallback((rowKey: string, colIdx: number, currentVal: number) => {
    if (!isAdmin) return;
    const meta = rowStructure.rows.find(r => `row_${r.row_num}` === rowKey);
    if (meta?.is_total || meta?.is_protected) return;
    setEditingCell({ rowKey, colIdx });
    setEditValue(currentVal === 0 ? '' : currentVal.toString());
    setTimeout(() => inputRef.current?.select(), 10);
  }, [isAdmin, rowStructure]);

  const commitCellEdit = useCallback(() => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    onCellEdit(editingCell.rowKey, editingCell.colIdx, val);
    setEditingCell(null);
  }, [editingCell, editValue, onCellEdit]);

  const handleLabelDblClick = useCallback((rowKey: string, label: string) => {
    if (!isAdmin) return;
    const meta = rowStructure.rows.find(r => `row_${r.row_num}` === rowKey);
    if (meta?.is_protected) return;
    setEditingLabel(rowKey);
    setEditValue(label);
  }, [isAdmin, rowStructure]);

  const commitLabelEdit = useCallback(() => {
    if (!editingLabel) return;
    onRowRename(editingLabel, editValue);
    setEditingLabel(null);
  }, [editingLabel, editValue, onRowRename]);

  const handleAddRow = useCallback(() => {
    if (!addRowSection || !newRowName.trim()) return;
    onRowAdd(addRowSection, newRowName.trim(), newRowEntity);
    setAddRowSection(null);
    setNewRowName('');
  }, [addRowSection, newRowName, newRowEntity, onRowAdd]);

  // Group rows by section for rendering
  const sections: { key: string; label: string; cssClass: string; rows: string[]; addable: boolean }[] = [
    { key: 'balance_begin', label: 'BEGINNING / ENDING BANK BALANCES', cssClass: 'balance', rows: [], addable: false },
    { key: 'balance_end', label: '', cssClass: 'balance', rows: [], addable: false },
    { key: 'receipts', label: '( + ) CASH RECEIPTS', cssClass: 'receipts', rows: [], addable: true },
    { key: 'disbursements', label: '( – ) CASH DISBURSEMENTS', cssClass: 'disbursements', rows: [], addable: true },
    { key: 'transfers', label: '( + )/( – ) INTERNAL TRANSFERS', cssClass: 'transfers', rows: [], addable: true },
    { key: 'summary', label: 'SUMMARY', cssClass: 'summary', rows: [], addable: false },
  ];

  rowStructure.rows.forEach(meta => {
    const section = sections.find(s => s.key === meta.section);
    if (section) section.rows.push(`row_${meta.row_num}`);
  });

  // Also include any dynamically added rows
  const knownKeys = new Set(rowStructure.rows.map(r => `row_${r.row_num}`));
  Object.keys(data.rows).forEach(key => {
    if (!knownKeys.has(key)) {
      // Guess section from row number
      const num = parseInt(key.replace('row_', ''));
      if (num >= 27 && num < 38) sections[2].rows.push(key);
      else if (num >= 40 && num < 59) sections[3].rows.push(key);
      else if (num >= 61 && num < 68) sections[4].rows.push(key);
    }
  });

  const visibleDates = data.dates.slice(0, 30); // Show first 30 days for performance
  const dateIndices = visibleDates.map((_, i) => i);

  const getRecurring = (rowKey: string) => recurringTags.find(t => t.rowKey === rowKey);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDayOfWeek = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div className="cf-main">
      <div ref={gridWrapRef} className="cf-table-card">
      <div className="cf-grid-wrap">
        <table className="cf-grid">
          <thead>
            <tr>
              <th className="cf-label-col">Account</th>
              {visibleDates.map((d, i) => (
                <th key={i}>
                  <div>{getDayOfWeek(d)}</div>
                  <div>{formatDate(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(section => {
              if (!section.label && section.key === 'balance_end') return null; // merged with balance_begin
              const sectionRows = section.key === 'balance_begin'
                ? [...sections[0].rows, ...sections[1].rows]
                : section.rows;

              return (
                <SectionBlock
                  key={section.key}
                  sectionLabel={section.label}
                  cssClass={section.cssClass}
                  rowKeys={sectionRows}
                  data={data}
                  rowStructure={rowStructure}
                  dateIndices={dateIndices}
                  editingCell={editingCell}
                  editingLabel={editingLabel}
                  editValue={editValue}
                  inputRef={inputRef}
                  isAdmin={isAdmin}
                  getRecurring={getRecurring}
                  onCellClick={handleCellClick}
                  onEditValueChange={setEditValue}
                  onCommitCell={commitCellEdit}
                  onCancelCell={() => setEditingCell(null)}
                  onLabelDblClick={handleLabelDblClick}
                  onCommitLabel={commitLabelEdit}
                  onCancelLabel={() => setEditingLabel(null)}
                  onRowRemove={onRowRemove}
                  addable={section.addable}
                  onAddRow={() => setAddRowSection(section.key)}
                  dateCount={visibleDates.length}
                  collapsed={collapsedSections[section.cssClass]}
                  onToggleCollapse={() => toggleSection(section.cssClass)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Add Row Dialog */}
      {addRowSection && (
        <div className="cf-overlay" onClick={() => setAddRowSection(null)}>
          <div className="cf-dialog" onClick={e => e.stopPropagation()}>
            <div className="cf-dialog-title">Add Row</div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Row Name</label>
            <input className="cf-input" value={newRowName} onChange={e => setNewRowName(e.target.value)} placeholder="Row name" autoFocus />
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block', marginTop: 12, marginBottom: 4 }}>Entity</label>
            <select className="cf-select" value={newRowEntity} onChange={e => setNewRowEntity(e.target.value)}>
              <option value="5LC">5LC</option>
              <option value="5LCA">5LCA</option>
              <option value="5LFS">5LFS</option>
              <option value="5LT">5LT</option>
              <option value="ALL">ALL</option>
            </select>
            <div className="cf-dialog-actions">
              <button className="cf-btn cf-btn-ghost" onClick={() => setAddRowSection(null)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" onClick={handleAddRow}>Add Row</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

interface SectionBlockProps {
  sectionLabel: string;
  cssClass: string;
  rowKeys: string[];
  data: DailyData;
  rowStructure: DailyRowStructure;
  dateIndices: number[];
  editingCell: EditingCell | null;
  editingLabel: string | null;
  editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isAdmin: boolean;
  getRecurring: (key: string) => RecurringTag | undefined;
  onCellClick: (rowKey: string, colIdx: number, val: number) => void;
  onEditValueChange: (v: string) => void;
  onCommitCell: () => void;
  onCancelCell: () => void;
  onLabelDblClick: (rowKey: string, label: string) => void;
  onCommitLabel: () => void;
  onCancelLabel: () => void;
  onRowRemove: (key: string) => void;
  addable: boolean;
  onAddRow: () => void;
  dateCount: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function SectionBlock({
  sectionLabel, cssClass, rowKeys, data, rowStructure, dateIndices,
  editingCell, editingLabel, editValue, inputRef, isAdmin, getRecurring,
  onCellClick, onEditValueChange, onCommitCell, onCancelCell,
  onLabelDblClick, onCommitLabel, onCancelLabel, onRowRemove,
  addable, onAddRow, dateCount, collapsed, onToggleCollapse,
}: SectionBlockProps) {
  if (!sectionLabel) return null;
  const isCollapsible = cssClass === 'receipts' || cssClass === 'disbursements';

  return (
    <>
      {/* Section header */}
      <tr
        className={`cf-section-header ${cssClass}`}
        style={isCollapsible ? { cursor: 'pointer' } : undefined}
        onClick={isCollapsible ? onToggleCollapse : undefined}
      >
        <td className="cf-label-col" colSpan={dateCount + 1} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isCollapsible && (collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
          {sectionLabel}
        </td>
      </tr>
      {/* Data rows */}
      {rowKeys.map(rowKey => {
        const row = data.rows[rowKey];
        if (!row) return null;
        const meta = rowStructure.rows.find(r => `row_${r.row_num}` === rowKey);
        const isTotal = meta?.is_total ?? false;
        const isProtected = meta?.is_protected ?? false;
        const indent = meta?.indent ?? false;
        const recurring = getRecurring(rowKey);

        // Hide detail rows when collapsed (keep totals visible)
        if (!isTotal && collapsed) return null;

        return (
          <tr key={rowKey} className={`${isTotal ? 'cf-total-row' : ''} ${indent ? 'cf-indent' : ''}`}>
            <td className="cf-label-col">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {editingLabel === rowKey ? (
                  <input
                    className="cf-cell-input"
                    style={{ textAlign: 'left', width: '180px' }}
                    value={editValue}
                    onChange={e => onEditValueChange(e.target.value)}
                    onBlur={onCommitLabel}
                    onKeyDown={e => { if (e.key === 'Enter') onCommitLabel(); if (e.key === 'Escape') onCancelLabel(); }}
                    autoFocus
                  />
                ) : (
                  <span onDoubleClick={() => onLabelDblClick(rowKey, row.label)} style={{ cursor: isProtected ? 'default' : 'text' }}>
                    {row.label}
                  </span>
                )}
                {row.entity !== 'ALL' && (
                  <span style={{ fontSize: '9px', color: 'var(--color-text-faint)', fontWeight: 400 }}>
                    {row.entity}
                  </span>
                )}
                {recurring && (
                  <span className="cf-recurring-badge" title={`Recurring: ${recurring.frequency}`}>↻</span>
                )}
                {isAdmin && !isProtected && (
                  <button className="cf-row-remove" onClick={() => onRowRemove(rowKey)}>×</button>
                )}
              </span>
            </td>
            {dateIndices.map(colIdx => {
              const val = row.values[colIdx] || 0;
              const isEditing = editingCell?.rowKey === rowKey && editingCell?.colIdx === colIdx;
              const editable = isAdmin && !isTotal && !isProtected;

              return (
                <td
                  key={colIdx}
                  className={`${val > 0 ? 'cf-val-pos' : val < 0 ? 'cf-val-neg' : ''} ${editable ? 'cf-editable' : ''}`}
                  onClick={() => editable && onCellClick(rowKey, colIdx, val)}
                >
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      className="cf-cell-input"
                      value={editValue}
                      onChange={e => onEditValueChange(e.target.value)}
                      onBlur={onCommitCell}
                      onKeyDown={e => {
                        if (e.key === 'Enter') onCommitCell();
                        if (e.key === 'Escape') onCancelCell();
                        if (e.key === 'Tab') { e.preventDefault(); onCommitCell(); }
                      }}
                      autoFocus
                    />
                  ) : (
                    fmt(val)
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
      {/* Add Row button */}
      {addable && isAdmin && (
        <tr>
          <td className="cf-label-col" colSpan={dateCount + 1}>
            <button className="cf-btn cf-btn-ghost" onClick={onAddRow} style={{ fontSize: '11px' }}>+ Add Row</button>
          </td>
        </tr>
      )}
    </>
  );
}
