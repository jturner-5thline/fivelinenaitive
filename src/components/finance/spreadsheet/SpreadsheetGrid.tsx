import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SpreadsheetSheet, CellSelection, CellRange, CellFormat, MergedCell } from '@/hooks/useSpreadsheetWorkbook';
import { evaluateCell, isFormula } from '@/lib/formulaEngine';
import { evaluateConditionalFormat } from './ConditionalFormatDialog';
import { CellContextMenu } from './CellContextMenu';

interface SpreadsheetGridProps {
  sheet: SpreadsheetSheet;
  selectedCell: CellSelection;
  selectionRange: CellRange | null;
  onCellSelect: (cell: CellSelection) => void;
  onRangeSelect: (range: CellRange | null) => void;
  onCellChange: (row: number, col: number, value: string) => void;
  onColumnResize?: (col: number, width: number) => void;
  onPaste?: (startRow: number, startCol: number, data: string[][]) => void;
  onInsertRow?: () => void;
  onInsertColumn?: () => void;
  onDeleteRow?: () => void;
  onDeleteColumn?: () => void;
  onSort?: (direction: 'asc' | 'desc') => void;
  onMerge?: () => void;
  onUnmerge?: () => void;
  onAddComment?: () => void;
}

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 28;
const ROW_NUM_WIDTH = 40;

function getColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

function formatCellDisplay(value: string | number | null, format: CellFormat): string {
  if (value === null || value === undefined) return '';
  if (format.numberFormat && typeof value === 'number') {
    if (format.numberFormat === '$#,##0.00') return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (format.numberFormat === '0.0%') return `${(value * 100).toFixed(1)}%`;
    if (format.numberFormat === '#,##0') return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return String(value);
}

function isCellHiddenByMerge(row: number, col: number, mergedCells: MergedCell[]): MergedCell | null {
  for (const m of mergedCells) {
    if (row >= m.startRow && row <= m.endRow && col >= m.startCol && col <= m.endCol) {
      if (row === m.startRow && col === m.startCol) return null;
      return m;
    }
  }
  return null;
}

function getMergeSpan(row: number, col: number, mergedCells: MergedCell[]): { rowSpan: number; colSpan: number } | null {
  for (const m of mergedCells) {
    if (row === m.startRow && col === m.startCol) {
      return { rowSpan: m.endRow - m.startRow + 1, colSpan: m.endCol - m.startCol + 1 };
    }
  }
  return null;
}

// Smart auto-fill: detect patterns for numbers, dates, day names
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getAutoFillValue(sourceValue: string | number | null, offset: number): string {
  if (sourceValue === null || sourceValue === undefined) return '';
  const str = String(sourceValue);
  
  // Day names
  const dayIdx = DAYS.findIndex(d => d.toLowerCase() === str.toLowerCase());
  if (dayIdx >= 0) return DAYS[(dayIdx + offset) % 7];
  const dayShortIdx = DAYS_SHORT.findIndex(d => d.toLowerCase() === str.toLowerCase());
  if (dayShortIdx >= 0) return DAYS_SHORT[(dayShortIdx + offset) % 7];
  
  // Month names
  const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === str.toLowerCase());
  if (monthIdx >= 0) return MONTHS[(monthIdx + offset) % 12];
  const monthShortIdx = MONTHS_SHORT.findIndex(m => m.toLowerCase() === str.toLowerCase());
  if (monthShortIdx >= 0) return MONTHS_SHORT[(monthShortIdx + offset) % 12];

  // Numbers
  const num = typeof sourceValue === 'number' ? sourceValue : parseFloat(str);
  if (!isNaN(num) && str.trim() === String(num)) return String(num + offset);

  // Date patterns (MM/DD/YYYY)
  const dateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateMatch) {
    const d = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]));
    d.setDate(d.getDate() + offset);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  }

  return str; // repeat for text
}

export function SpreadsheetGrid({
  sheet, selectedCell, selectionRange,
  onCellSelect, onRangeSelect, onCellChange, onColumnResize, onPaste,
  onInsertRow, onInsertColumn, onDeleteRow, onDeleteColumn,
  onSort, onMerge, onUnmerge, onAddComment,
}: SpreadsheetGridProps) {
  const [editingCell, setEditingCell] = useState<CellSelection | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<CellSelection | null>(null);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [isFillDragging, setIsFillDragging] = useState(false);
  const [fillTarget, setFillTarget] = useState<CellSelection | null>(null);
  const [showValidationDropdown, setShowValidationDropdown] = useState(false);
  const [copiedRange, setCopiedRange] = useState<CellRange | null>(null);
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [resizingRow, setResizingRow] = useState<number | null>(null);
  const [resizeRowStartY, setResizeRowStartY] = useState(0);
  const [resizeRowStartHeight, setResizeRowStartHeight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const maxCols = useMemo(() => Math.max(...sheet.data.map(r => r.length), 1), [sheet.data]);
  const visibleRows = sheet.data.length;

  const evaluatedData = useMemo(() => {
    return sheet.data.map((row, r) => row.map((_, c) => evaluateCell(r, c, sheet.data)));
  }, [sheet.data]);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const isInRange = useCallback((row: number, col: number): boolean => {
    if (!selectionRange) return false;
    const minR = Math.min(selectionRange.startRow, selectionRange.endRow);
    const maxR = Math.max(selectionRange.startRow, selectionRange.endRow);
    const minC = Math.min(selectionRange.startCol, selectionRange.endCol);
    const maxC = Math.max(selectionRange.startCol, selectionRange.endCol);
    return row >= minR && row <= maxR && col >= minC && col <= maxC;
  }, [selectionRange]);

  const isInCopiedRange = useCallback((row: number, col: number): boolean => {
    if (!copiedRange) return false;
    const minR = Math.min(copiedRange.startRow, copiedRange.endRow);
    const maxR = Math.max(copiedRange.startRow, copiedRange.endRow);
    const minC = Math.min(copiedRange.startCol, copiedRange.endCol);
    const maxC = Math.max(copiedRange.startCol, copiedRange.endCol);
    return row >= minR && row <= maxR && col >= minC && col <= maxC;
  }, [copiedRange]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const oldValue = sheet.data[editingCell.row]?.[editingCell.col];
    const oldStr = oldValue !== null && oldValue !== undefined ? String(oldValue) : '';
    if (editValue !== oldStr) onCellChange(editingCell.row, editingCell.col, editValue);
    setEditingCell(null);
    setEditValue('');
    setShowValidationDropdown(false);
  }, [editingCell, editValue, sheet.data, onCellChange]);

  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (editingCell) commitEdit();
    onCellSelect({ row, col });
    if (e.shiftKey) {
      onRangeSelect({ startRow: selectedCell.row, startCol: selectedCell.col, endRow: row, endCol: col });
    } else {
      onRangeSelect(null);
    }
  }, [editingCell, commitEdit, onCellSelect, onRangeSelect, selectedCell]);

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    const value = sheet.data[row]?.[col];
    setEditingCell({ row, col });
    setEditValue(value !== null && value !== undefined ? String(value) : '');
    const validation = sheet.validations[`${row}-${col}`];
    if (validation?.type === 'list') setShowValidationDropdown(true);
  }, [sheet.data, sheet.validations]);

  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ row, col });
    handleCellClick(row, col, e);
  }, [handleCellClick]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (isFillDragging) { setFillTarget({ row, col }); return; }
    if (!isDragging || !dragStart) return;
    onRangeSelect({ startRow: dragStart.row, startCol: dragStart.col, endRow: row, endCol: col });
  }, [isDragging, isFillDragging, dragStart, onRangeSelect]);

  const handleMouseUp = useCallback(() => {
    if (isFillDragging && fillTarget) {
      const sourceRow = selectedCell.row;
      const sourceCol = selectedCell.col;
      const sourceValue = sheet.data[sourceRow]?.[sourceCol];

      const startR = Math.min(sourceRow, fillTarget.row);
      const endR = Math.max(sourceRow, fillTarget.row);
      const startC = Math.min(sourceCol, fillTarget.col);
      const endC = Math.max(sourceCol, fillTarget.col);

      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          if (r === sourceRow && c === sourceCol) continue;
          const offset = (r - sourceRow) + (c - sourceCol);
          onCellChange(r, c, getAutoFillValue(sourceValue, offset));
        }
      }
      setIsFillDragging(false);
      setFillTarget(null);
      return;
    }
    setIsDragging(false);
    setDragStart(null);
  }, [isFillDragging, fillTarget, selectedCell, sheet.data, onCellChange]);

  useEffect(() => {
    if (isDragging || isFillDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging, isFillDragging, handleMouseUp]);

  const handleFillHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFillDragging(true);
  }, []);

  // Copy/paste with marching ants
  const handleCopy = useCallback(() => {
    const range = selectionRange || { startRow: selectedCell.row, startCol: selectedCell.col, endRow: selectedCell.row, endCol: selectedCell.col };
    const minR = Math.min(range.startRow, range.endRow);
    const maxR = Math.max(range.startRow, range.endRow);
    const minC = Math.min(range.startCol, range.endCol);
    const maxC = Math.max(range.startCol, range.endCol);
    const lines: string[] = [];
    for (let r = minR; r <= maxR; r++) {
      const cells: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        const val = evaluatedData[r]?.[c];
        cells.push(val !== null && val !== undefined ? String(val) : '');
      }
      lines.push(cells.join('\t'));
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedRange({ startRow: minR, startCol: minC, endRow: maxR, endCol: maxC });
  }, [selectionRange, selectedCell, evaluatedData]);

  const handlePasteAction = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const rows = text.split('\n').map(line => line.split('\t'));
      if (onPaste) {
        onPaste(selectedCell.row, selectedCell.col, rows);
      } else {
        rows.forEach((row, rOffset) => {
          row.forEach((cell, cOffset) => {
            onCellChange(selectedCell.row + rOffset, selectedCell.col + cOffset, cell);
          });
        });
      }
      setCopiedRange(null);
    } catch { }
  }, [selectedCell, onCellChange, onPaste]);

  const handleCut = useCallback(() => {
    handleCopy();
    if (selectionRange) {
      const minR = Math.min(selectionRange.startRow, selectionRange.endRow);
      const maxR = Math.max(selectionRange.startRow, selectionRange.endRow);
      const minC = Math.min(selectionRange.startCol, selectionRange.endCol);
      const maxC = Math.max(selectionRange.startCol, selectionRange.endCol);
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) onCellChange(r, c, '');
      }
    } else {
      onCellChange(selectedCell.row, selectedCell.col, '');
    }
  }, [handleCopy, selectionRange, selectedCell, onCellChange]);

  const handleDelete = useCallback(() => {
    if (selectionRange) {
      const minR = Math.min(selectionRange.startRow, selectionRange.endRow);
      const maxR = Math.max(selectionRange.startRow, selectionRange.endRow);
      const minC = Math.min(selectionRange.startCol, selectionRange.endCol);
      const maxC = Math.max(selectionRange.startCol, selectionRange.endCol);
      for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) onCellChange(r, c, '');
    } else {
      onCellChange(selectedCell.row, selectedCell.col, '');
    }
  }, [selectionRange, selectedCell, onCellChange]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !editingCell) {
      if (e.key === 'c') { e.preventDefault(); handleCopy(); return; }
      if (e.key === 'v') { e.preventDefault(); handlePasteAction(); return; }
      if (e.key === 'x') { e.preventDefault(); handleCut(); return; }
    }
    if (editingCell) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); onCellSelect({ row: Math.min(editingCell.row + 1, visibleRows - 1), col: editingCell.col }); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit(); onCellSelect({ row: editingCell.row, col: Math.min(editingCell.col + 1, maxCols - 1) }); }
      else if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); setShowValidationDropdown(false); }
      return;
    }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); onCellSelect({ row: Math.max(0, selectedCell.row - 1), col: selectedCell.col }); onRangeSelect(null); break;
      case 'ArrowDown': case 'Enter': e.preventDefault(); onCellSelect({ row: Math.min(visibleRows - 1, selectedCell.row + 1), col: selectedCell.col }); onRangeSelect(null); break;
      case 'ArrowLeft': e.preventDefault(); onCellSelect({ row: selectedCell.row, col: Math.max(0, selectedCell.col - 1) }); onRangeSelect(null); break;
      case 'ArrowRight': case 'Tab': e.preventDefault(); onCellSelect({ row: selectedCell.row, col: Math.min(maxCols - 1, selectedCell.col + 1) }); onRangeSelect(null); break;
      case 'Delete': case 'Backspace': e.preventDefault(); handleDelete(); break;
      case 'F2': e.preventDefault(); handleCellDoubleClick(selectedCell.row, selectedCell.col); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { setEditingCell(selectedCell); setEditValue(e.key); }
        break;
    }
  }, [editingCell, commitEdit, selectedCell, visibleRows, maxCols, onCellSelect, onRangeSelect, handleCellDoubleClick, handleCopy, handlePasteAction, handleCut, handleDelete]);

  // Column resize
  const handleResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setResizingCol(col); setResizeStartX(e.clientX); setResizeStartWidth(sheet.colWidths[col] || 100);
  }, [sheet.colWidths]);

  useEffect(() => {
    if (resizingCol === null) return;
    const handleMove = (e: MouseEvent) => { onColumnResize?.(resizingCol, Math.max(40, resizeStartWidth + e.clientX - resizeStartX)); };
    const handleUp = () => setResizingCol(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizingCol, resizeStartX, resizeStartWidth, onColumnResize]);

  // Row resize
  const handleRowResizeStart = useCallback((row: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setResizingRow(row); setResizeRowStartY(e.clientY); setResizeRowStartHeight(rowHeights[row] || ROW_HEIGHT);
  }, [rowHeights]);

  useEffect(() => {
    if (resizingRow === null) return;
    const handleMove = (e: MouseEvent) => {
      setRowHeights(prev => ({ ...prev, [resizingRow]: Math.max(16, resizeRowStartHeight + e.clientY - resizeRowStartY) }));
    };
    const handleUp = () => setResizingRow(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizingRow, resizeRowStartY, resizeRowStartHeight]);

  // Select entire row/col
  const handleRowHeaderClick = useCallback((row: number) => {
    onCellSelect({ row, col: 0 });
    onRangeSelect({ startRow: row, startCol: 0, endRow: row, endCol: maxCols - 1 });
  }, [onCellSelect, onRangeSelect, maxCols]);

  const handleColHeaderClick = useCallback((col: number) => {
    onCellSelect({ row: 0, col });
    onRangeSelect({ startRow: 0, startCol: col, endRow: visibleRows - 1, endCol: col });
  }, [onCellSelect, onRangeSelect, visibleRows]);

  const fillHandleCell = selectionRange
    ? { row: Math.max(selectionRange.startRow, selectionRange.endRow), col: Math.max(selectionRange.startCol, selectionRange.endCol) }
    : selectedCell;

  const frozenRows = sheet.frozenRows || 0;
  const frozenCols = sheet.frozenCols || 0;

  const getRowH = (r: number) => rowHeights[r] || ROW_HEIGHT;

  return (
    <CellContextMenu
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePasteAction}
      onDelete={handleDelete}
      onInsertRow={() => onInsertRow?.()}
      onInsertColumn={() => onInsertColumn?.()}
      onDeleteRow={() => onDeleteRow?.()}
      onDeleteColumn={() => onDeleteColumn?.()}
      onSortAsc={() => onSort?.('asc')}
      onSortDesc={() => onSort?.('desc')}
      onMerge={() => onMerge?.()}
      onUnmerge={() => onUnmerge?.()}
      onAddComment={() => onAddComment?.()}
      hasRangeSelection={!!selectionRange}
    >
      <div
        ref={gridRef}
        className="flex-1 overflow-auto focus:outline-none select-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Marching ants + freeze pane CSS */}
        <style>{`
          @keyframes marching-ants {
            0% { background-position: 0 0, 100% 0, 0 100%, 0 0; }
            100% { background-position: 20px 0, calc(100% - 20px) 0, 0 calc(100% - 20px), 0 20px; }
          }
          .marching-ants {
            background-image: linear-gradient(90deg, hsl(var(--primary)) 50%, transparent 50%),
                              linear-gradient(90deg, hsl(var(--primary)) 50%, transparent 50%),
                              linear-gradient(0deg, hsl(var(--primary)) 50%, transparent 50%),
                              linear-gradient(0deg, hsl(var(--primary)) 50%, transparent 50%);
            background-size: 10px 2px, 10px 2px, 2px 10px, 2px 10px;
            background-position: 0 0, 100% 100%, 0 100%, 100% 0;
            background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
            animation: marching-ants 0.5s linear infinite;
          }
          .freeze-border-right { border-right: 2.5px solid hsl(var(--primary) / 0.5) !important; }
          .freeze-border-bottom { border-bottom: 2.5px solid hsl(var(--primary) / 0.5) !important; }
        `}</style>
        <table className="border-collapse text-xs w-max min-w-full" style={{ userSelect: isDragging || isFillDragging || resizingCol !== null || resizingRow !== null ? 'none' : undefined }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                className="sticky left-0 z-20 bg-muted/80 border border-border text-center text-muted-foreground font-normal text-[10px]"
                style={{ width: ROW_NUM_WIDTH, height: HEADER_HEIGHT }}
              />
              {Array.from({ length: maxCols }).map((_, colIndex) => {
                const isColSelected = selectedCell.col === colIndex;
                const isColInRange = selectionRange && colIndex >= Math.min(selectionRange.startCol, selectionRange.endCol) && colIndex <= Math.max(selectionRange.startCol, selectionRange.endCol);
                return (
                  <th
                    key={colIndex}
                    className={cn(
                      "border border-border text-center font-medium relative cursor-pointer transition-colors text-[10px]",
                      isColSelected || isColInRange
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted",
                      colIndex < frozenCols && "sticky z-[15]",
                    )}
                    style={{
                      minWidth: sheet.colWidths[colIndex] || 100,
                      height: HEADER_HEIGHT,
                      left: colIndex < frozenCols ? ROW_NUM_WIDTH + sheet.colWidths.slice(0, colIndex).reduce((a, b) => a + (b || 100), 0) : undefined,
                    }}
                    onClick={() => handleColHeaderClick(colIndex)}
                  >
                    {getColumnLabel(colIndex)}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 z-10"
                      onMouseDown={(e) => handleResizeStart(colIndex, e)}
                      onDoubleClick={() => onColumnResize?.(colIndex, 100)} // auto-fit reset
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheet.data.map((row, rowIndex) => {
              const isRowSelected = selectedCell.row === rowIndex;
              const isRowInRange = selectionRange && rowIndex >= Math.min(selectionRange.startRow, selectionRange.endRow) && rowIndex <= Math.max(selectionRange.startRow, selectionRange.endRow);
              const rh = getRowH(rowIndex);

              return (
                <tr key={rowIndex} className={cn(rowIndex < frozenRows && "sticky z-[8]")} style={rowIndex < frozenRows ? { top: HEADER_HEIGHT + Array.from({ length: rowIndex }).reduce<number>((s, _, i) => s + getRowH(i), 0) } : undefined}>
                  <td
                    className={cn(
                      "sticky left-0 z-10 border border-border text-center font-medium cursor-pointer transition-colors text-[10px] relative",
                      isRowSelected || isRowInRange
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted"
                    )}
                    style={{ width: ROW_NUM_WIDTH, height: rh }}
                    onClick={() => handleRowHeaderClick(rowIndex)}
                  >
                    {rowIndex + 1}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/40 z-10"
                      onMouseDown={(e) => handleRowResizeStart(rowIndex, e)}
                    />
                  </td>
                  {Array.from({ length: maxCols }).map((_, colIndex) => {
                    const hiddenByMerge = isCellHiddenByMerge(rowIndex, colIndex, sheet.mergedCells);
                    if (hiddenByMerge) return null;

                    const mergeSpan = getMergeSpan(rowIndex, colIndex, sheet.mergedCells);
                    const displayValue = evaluatedData[rowIndex]?.[colIndex] ?? null;
                    const isSelected = selectedCell.row === rowIndex && selectedCell.col === colIndex;
                    const isRanged = isInRange(rowIndex, colIndex);
                    const isCopied = isInCopiedRange(rowIndex, colIndex);
                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                    const format = sheet.formats[`${rowIndex}-${colIndex}`] || {};
                    const showFillHandle = isSelected && !isEditing && fillHandleCell.row === rowIndex && fillHandleCell.col === colIndex;
                    const hasComments = (sheet.comments[`${rowIndex}-${colIndex}`] || []).length > 0;
                    const validation = sheet.validations[`${rowIndex}-${colIndex}`];
                    const condFormat = evaluateConditionalFormat(displayValue, sheet.conditionalFormats);
                    const effectiveBg = condFormat?.bgColor || format.bgColor || undefined;
                    const effectiveFontColor = condFormat?.fontColor || format.fontColor || undefined;

                    return (
                      <td
                        key={colIndex}
                        className={cn(
                          "border bg-background relative transition-none",
                          isSelected
                            ? "ring-2 ring-primary z-[5] border-primary"
                            : "border-border",
                          isRanged && !isSelected && "bg-primary/8",
                          isCopied && "marching-ants",
                          !isEditing && "cursor-cell",
                          format.borderTop && "border-t-2 border-t-foreground",
                          format.borderBottom && "border-b-2 border-b-foreground",
                          format.borderLeft && "border-l-2 border-l-foreground",
                          format.borderRight && "border-r-2 border-r-foreground",
                          colIndex < frozenCols && "sticky z-[6]",
                          frozenCols > 0 && colIndex === frozenCols - 1 && "freeze-border-right",
                          frozenRows > 0 && rowIndex === frozenRows - 1 && "freeze-border-bottom",
                        )}
                        style={{
                          minWidth: sheet.colWidths[colIndex] || 100,
                          height: mergeSpan ? rh * mergeSpan.rowSpan : rh,
                          backgroundColor: effectiveBg,
                          left: colIndex < frozenCols ? ROW_NUM_WIDTH + sheet.colWidths.slice(0, colIndex).reduce((a, b) => a + (b || 100), 0) : undefined,
                        }}
                        rowSpan={mergeSpan?.rowSpan}
                        colSpan={mergeSpan?.colSpan}
                        onMouseDown={(e) => handleMouseDown(rowIndex, colIndex, e)}
                        onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                        onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                      >
                        {isEditing ? (
                          <div className="relative">
                            <input
                              ref={inputRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              className="w-full h-full border-0 outline-none bg-background px-1.5 text-xs font-mono"
                              style={{
                                fontWeight: format.bold ? 'bold' : undefined,
                                fontStyle: format.italic ? 'italic' : undefined,
                                textDecoration: format.underline ? 'underline' : undefined,
                                textAlign: format.align || 'left',
                                color: effectiveFontColor,
                              }}
                            />
                            {showValidationDropdown && validation?.type === 'list' && validation.options && (
                              <div className="absolute top-full left-0 z-50 bg-background border rounded shadow-lg max-h-32 overflow-y-auto min-w-[120px]">
                                {validation.options.map((opt, i) => (
                                  <button key={i} className="w-full text-left px-2 py-1 text-xs hover:bg-muted transition-colors"
                                    onMouseDown={(e) => { e.preventDefault(); setEditValue(opt); onCellChange(rowIndex, colIndex, opt); setEditingCell(null); setShowValidationDropdown(false); }}>
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            className="w-full h-full px-1.5 flex items-center overflow-hidden whitespace-nowrap"
                            style={{
                              fontWeight: format.bold ? 'bold' : undefined,
                              fontStyle: format.italic ? 'italic' : undefined,
                              textDecoration: format.underline ? 'underline' : undefined,
                              textAlign: format.align || (typeof displayValue === 'number' ? 'right' : 'left'),
                              color: typeof displayValue === 'string' && displayValue.startsWith('#') && displayValue.includes('!')
                                ? 'hsl(var(--destructive))'
                                : effectiveFontColor,
                              fontSize: format.fontSize ? `${format.fontSize}px` : undefined,
                              justifyContent: format.align === 'center' ? 'center' : format.align === 'right' || (!format.align && typeof displayValue === 'number') ? 'flex-end' : 'flex-start',
                            }}
                          >
                            {formatCellDisplay(displayValue, format)}
                            {validation?.type === 'list' && <span className="ml-auto text-muted-foreground text-[8px]">▼</span>}
                          </div>
                        )}
                        {hasComments && (
                          <div className="absolute top-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-t-[6px] border-t-primary" title="Has comments" />
                        )}
                        {showFillHandle && (
                          <div
                            className="absolute -bottom-[3px] -right-[3px] w-[7px] h-[7px] bg-primary rounded-sm border-2 border-background cursor-crosshair z-10"
                            onMouseDown={handleFillHandleMouseDown}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CellContextMenu>
  );
}
