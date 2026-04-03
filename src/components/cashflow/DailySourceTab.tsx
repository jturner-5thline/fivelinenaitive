import { useState, useCallback, useRef, memo, useMemo } from 'react';
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

// Column virtualization config
const COL_WIDTH = 90;
const LABEL_COL_WIDTH = 200;
const OVERSCAN = 5;

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Virtualization state
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1000);

  const safeData = useMemo<DailyData>(() => ({
    dates: Array.isArray(data?.dates) ? data.dates : [],
    rows: data?.rows && typeof data.rows === 'object' ? data.rows : {},
  }), [data]);

  const safeRowStructure = useMemo<DailyRowStructure>(() => ({
    rows: Array.isArray(rowStructure?.rows) ? rowStructure.rows : [],
  }), [rowStructure]);

  const safeRecurringTags = recurringTags || [];

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  }, []);

  // Measure container width on mount/resize
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(node);
      setContainerWidth(node.clientWidth);
      // Store ref for gridWrapRef
      if (scrollContainerRef.current !== node) {
        (scrollContainerRef as any).current = node;
      }
    }
  }, []);

  // Combined ref
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    // Set gridWrapRef
    if (typeof gridWrapRef === 'function') {
      (gridWrapRef as any)(node);
    } else if (gridWrapRef) {
      (gridWrapRef as any).current = node;
    }
    containerRef(node);
  }, [gridWrapRef, containerRef]);

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleCellClick = useCallback((rowKey: string, colIdx: number, currentVal: number) => {
    if (!isAdmin) return;
    const meta = safeRowStructure.rows.find(r => `row_${r.row_num}` === rowKey);
    if (meta?.is_total || meta?.is_protected) return;
    setEditingCell({ rowKey, colIdx });
    setEditValue(currentVal === 0 ? '' : currentVal.toString());
    setTimeout(() => inputRef.current?.select(), 10);
  }, [isAdmin, safeRowStructure]);

  const commitCellEdit = useCallback(() => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    onCellEdit(editingCell.rowKey, editingCell.colIdx, val);
    setEditingCell(null);
  }, [editingCell, editValue, onCellEdit]);

  const handleLabelDblClick = useCallback((rowKey: string, label: string) => {
    if (!isAdmin) return;
    const meta = safeRowStructure.rows.find(r => `row_${r.row_num}` === rowKey);
    if (meta?.is_protected) return;
    setEditingLabel(rowKey);
    setEditValue(label);
  }, [isAdmin, safeRowStructure]);

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

  // Group rows by section
  const sections = useMemo(() => {
    const s: { key: string; label: string; cssClass: string; rows: string[]; addable: boolean }[] = [
      { key: 'balance_begin', label: 'BEGINNING / ENDING BANK BALANCES', cssClass: 'balance', rows: [], addable: false },
      { key: 'balance_end', label: '', cssClass: 'balance', rows: [], addable: false },
      { key: 'receipts', label: '( + ) CASH RECEIPTS', cssClass: 'receipts', rows: [], addable: true },
      { key: 'disbursements', label: '( – ) CASH DISBURSEMENTS', cssClass: 'disbursements', rows: [], addable: true },
      { key: 'transfers', label: '( + )/( – ) INTERNAL TRANSFERS', cssClass: 'transfers', rows: [], addable: true },
      { key: 'summary', label: 'SUMMARY', cssClass: 'summary', rows: [], addable: false },
    ];

    safeRowStructure.rows.forEach(meta => {
      const section = s.find(sec => sec.key === meta.section);
      if (section) section.rows.push(`row_${meta.row_num}`);
    });

    const knownKeys = new Set(safeRowStructure.rows.map(r => `row_${r.row_num}`));
    Object.keys(safeData.rows || {}).forEach(key => {
      if (!knownKeys.has(key)) {
        const num = parseInt(key.replace('row_', ''));
        if (num >= 27 && num < 38) s[2].rows.push(key);
        else if (num >= 40 && num < 59) s[3].rows.push(key);
        else if (num >= 61 && num < 68) s[4].rows.push(key);
      }
    });

    return s;
  }, [safeRowStructure, safeData.rows]);

  const totalDateCount = safeData.dates.length;

  // Compute visible column range for virtualization
  const { startCol, endCol, totalWidth } = useMemo(() => {
    const availableWidth = containerWidth - LABEL_COL_WIDTH;
    const tw = totalDateCount * COL_WIDTH;
    const start = Math.max(0, Math.floor((scrollLeft) / COL_WIDTH) - OVERSCAN);
    const visibleCount = Math.ceil(availableWidth / COL_WIDTH) + 2 * OVERSCAN;
    const end = Math.min(totalDateCount, start + visibleCount);
    return { startCol: start, endCol: end, totalWidth: tw };
  }, [scrollLeft, containerWidth, totalDateCount]);

  const visibleIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = startCol; i < endCol; i++) indices.push(i);
    return indices;
  }, [startCol, endCol]);

  const getRecurring = useCallback((rowKey: string) => safeRecurringTags.find(t => t.rowKey === rowKey), [safeRecurringTags]);

  const formatDate = useCallback((dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const getDayOfWeek = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
  }, []);

  // Pre-compute left offset for spacer columns
  const leftSpacer = startCol * COL_WIDTH;
  const rightSpacer = Math.max(0, (totalDateCount - endCol) * COL_WIDTH);

  return (
    <div className="cf-main">
      {isAdmin && onImportExcel && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
          <button
            className="cf-btn cf-btn-primary"
            onClick={onImportExcel}
            disabled={isImportLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Upload size={14} />
            {isImportLoading ? 'Importing…' : 'Import Excel'}
          </button>
        </div>
      )}
      <div ref={combinedRef} className="cf-table-card" onScroll={handleScroll} style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <table className="cf-grid" style={{ width: LABEL_COL_WIDTH + totalWidth, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: LABEL_COL_WIDTH }} />
            {leftSpacer > 0 && <col style={{ width: leftSpacer }} />}
            {visibleIndices.map(i => (
              <col key={i} style={{ width: COL_WIDTH }} />
            ))}
            {rightSpacer > 0 && <col style={{ width: rightSpacer }} />}
          </colgroup>
          <thead>
            <tr>
              <th className="cf-label-col" style={{ position: 'sticky', left: 0, zIndex: 2 }}>Account</th>
              {leftSpacer > 0 && <th />}
              {visibleIndices.map(i => (
                <th key={i}>
                  <div>{getDayOfWeek(safeData.dates[i])}</div>
                  <div>{formatDate(safeData.dates[i])}</div>
                </th>
              ))}
              {rightSpacer > 0 && <th />}
            </tr>
          </thead>
          <tbody>
            {sections.map(section => {
              if (!section.label && section.key === 'balance_end') return null;
              const sectionRows = section.key === 'balance_begin'
                ? [...sections[0].rows, ...sections[1].rows]
                : section.rows;

              return (
                <VirtualizedSectionBlock
                  key={section.key}
                  sectionLabel={section.label}
                  cssClass={section.cssClass}
                  rowKeys={sectionRows}
                  data={safeData}
                  rowStructure={safeRowStructure}
                  visibleIndices={visibleIndices}
                  leftSpacer={leftSpacer}
                  rightSpacer={rightSpacer}
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
                  totalColCount={totalDateCount + 1 + (leftSpacer > 0 ? 1 : 0) + (rightSpacer > 0 ? 1 : 0)}
                  collapsed={collapsedSections[section.cssClass]}
                  onToggleCollapse={() => toggleSection(section.cssClass)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

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

interface VirtualizedSectionBlockProps {
  sectionLabel: string;
  cssClass: string;
  rowKeys: string[];
  data: DailyData;
  rowStructure: DailyRowStructure;
  visibleIndices: number[];
  leftSpacer: number;
  rightSpacer: number;
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
  totalColCount: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const VirtualizedSectionBlock = memo(function VirtualizedSectionBlock({
  sectionLabel, cssClass, rowKeys, data, rowStructure, visibleIndices,
  leftSpacer, rightSpacer,
  editingCell, editingLabel, editValue, inputRef, isAdmin, getRecurring,
  onCellClick, onEditValueChange, onCommitCell, onCancelCell,
  onLabelDblClick, onCommitLabel, onCancelLabel, onRowRemove,
  addable, onAddRow, totalColCount, collapsed, onToggleCollapse,
}: VirtualizedSectionBlockProps) {
  if (!sectionLabel) return null;
  const isCollapsible = cssClass === 'receipts' || cssClass === 'disbursements';
  const rows = data.rows || {};
  const structureRows = rowStructure.rows || [];

  return (
    <>
      <tr
        className={`cf-section-header ${cssClass}`}
        style={isCollapsible ? { cursor: 'pointer' } : undefined}
        onClick={isCollapsible ? onToggleCollapse : undefined}
      >
        <td className="cf-label-col" colSpan={totalColCount} style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'sticky', left: 0 }}>
          {isCollapsible && (collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
          {sectionLabel}
        </td>
      </tr>
      {rowKeys.map(rowKey => {
        const row = rows[rowKey];
        if (!row) return null;
        const meta = structureRows.find(r => `row_${r.row_num}` === rowKey);
        const isTotal = meta?.is_total ?? false;
        const isProtected = meta?.is_protected ?? false;
        const indent = meta?.indent ?? false;
        const recurring = getRecurring(rowKey);

        if (!isTotal && collapsed) return null;

        return (
          <tr key={rowKey} className={`${isTotal ? 'cf-total-row' : ''} ${indent ? 'cf-indent' : ''}`}>
            <td className="cf-label-col" style={{ position: 'sticky', left: 0, zIndex: 1 }}>
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
            {leftSpacer > 0 && <td />}
            {visibleIndices.map(colIdx => {
              const val = row.values?.[colIdx] || 0;
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
            {rightSpacer > 0 && <td />}
          </tr>
        );
      })}
      {addable && isAdmin && (
        <tr>
          <td className="cf-label-col" colSpan={totalColCount}>
            <button className="cf-btn cf-btn-ghost" onClick={onAddRow} style={{ fontSize: '11px' }}>+ Add Row</button>
          </td>
        </tr>
      )}
    </>
  );
});
