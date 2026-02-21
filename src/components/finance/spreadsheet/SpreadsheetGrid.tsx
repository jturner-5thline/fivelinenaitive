import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SpreadsheetSheet, CellSelection, CellRange, CellFormat } from '@/hooks/useSpreadsheetWorkbook';

interface SpreadsheetGridProps {
  sheet: SpreadsheetSheet;
  selectedCell: CellSelection;
  selectionRange: CellRange | null;
  onCellSelect: (cell: CellSelection) => void;
  onRangeSelect: (range: CellRange | null) => void;
  onCellChange: (row: number, col: number, value: string) => void;
  onColumnResize?: (col: number, width: number) => void;
}

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 28;
const ROW_NUM_WIDTH = 48;

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
    if (format.numberFormat === '$#,##0.00') {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (format.numberFormat === '0.0%') {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (format.numberFormat === '#,##0') {
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
  }
  
  return String(value);
}

export function SpreadsheetGrid({
  sheet,
  selectedCell,
  selectionRange,
  onCellSelect,
  onRangeSelect,
  onCellChange,
  onColumnResize,
}: SpreadsheetGridProps) {
  const [editingCell, setEditingCell] = useState<CellSelection | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<CellSelection | null>(null);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const maxCols = useMemo(() => Math.max(...sheet.data.map(r => r.length), 1), [sheet.data]);
  const visibleRows = sheet.data.length;

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const isInRange = useCallback((row: number, col: number): boolean => {
    if (!selectionRange) return false;
    const minR = Math.min(selectionRange.startRow, selectionRange.endRow);
    const maxR = Math.max(selectionRange.startRow, selectionRange.endRow);
    const minC = Math.min(selectionRange.startCol, selectionRange.endCol);
    const maxC = Math.max(selectionRange.startCol, selectionRange.endCol);
    return row >= minR && row <= maxR && col >= minC && col <= maxC;
  }, [selectionRange]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const oldValue = sheet.data[editingCell.row]?.[editingCell.col];
    const oldStr = oldValue !== null && oldValue !== undefined ? String(oldValue) : '';
    if (editValue !== oldStr) {
      // Try to parse as number
      const num = parseFloat(editValue);
      if (!isNaN(num) && editValue.trim() === String(num)) {
        onCellChange(editingCell.row, editingCell.col, editValue);
      } else {
        onCellChange(editingCell.row, editingCell.col, editValue);
      }
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, sheet.data, onCellChange]);

  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (editingCell) commitEdit();
    onCellSelect({ row, col });
    
    if (e.shiftKey) {
      onRangeSelect({
        startRow: selectedCell.row,
        startCol: selectedCell.col,
        endRow: row,
        endCol: col,
      });
    } else {
      onRangeSelect(null);
    }
  }, [editingCell, commitEdit, onCellSelect, onRangeSelect, selectedCell]);

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    const value = sheet.data[row]?.[col];
    setEditingCell({ row, col });
    setEditValue(value !== null && value !== undefined ? String(value) : '');
  }, [sheet.data]);

  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ row, col });
    handleCellClick(row, col, e);
  }, [handleCellClick]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (!isDragging || !dragStart) return;
    onRangeSelect({
      startRow: dragStart.row,
      startCol: dragStart.col,
      endRow: row,
      endCol: col,
    });
  }, [isDragging, dragStart, onRangeSelect]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging, handleMouseUp]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editingCell) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
        const nextRow = Math.min(editingCell.row + 1, visibleRows - 1);
        onCellSelect({ row: nextRow, col: editingCell.col });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit();
        const nextCol = Math.min(editingCell.col + 1, maxCols - 1);
        onCellSelect({ row: editingCell.row, col: nextCol });
      } else if (e.key === 'Escape') {
        setEditingCell(null);
        setEditValue('');
      }
      return;
    }

    // Navigation
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        onCellSelect({ row: Math.max(0, selectedCell.row - 1), col: selectedCell.col });
        onRangeSelect(null);
        break;
      case 'ArrowDown':
      case 'Enter':
        e.preventDefault();
        onCellSelect({ row: Math.min(visibleRows - 1, selectedCell.row + 1), col: selectedCell.col });
        onRangeSelect(null);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onCellSelect({ row: selectedCell.row, col: Math.max(0, selectedCell.col - 1) });
        onRangeSelect(null);
        break;
      case 'ArrowRight':
      case 'Tab':
        e.preventDefault();
        onCellSelect({ row: selectedCell.row, col: Math.min(maxCols - 1, selectedCell.col + 1) });
        onRangeSelect(null);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onCellChange(selectedCell.row, selectedCell.col, '');
        break;
      case 'F2':
        e.preventDefault();
        handleCellDoubleClick(selectedCell.row, selectedCell.col);
        break;
      default:
        // Start typing to enter edit mode
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          setEditingCell(selectedCell);
          setEditValue(e.key);
        }
        break;
    }
  }, [editingCell, commitEdit, selectedCell, visibleRows, maxCols, onCellSelect, onRangeSelect, onCellChange, handleCellDoubleClick]);

  // Ctrl shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        // undo handled by parent
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Column resize
  const handleResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(col);
    setResizeStartX(e.clientX);
    setResizeStartWidth(sheet.colWidths[col] || 100);
  }, [sheet.colWidths]);

  useEffect(() => {
    if (resizingCol === null) return;
    
    const handleMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(40, resizeStartWidth + diff);
      onColumnResize?.(resizingCol, newWidth);
    };
    
    const handleUp = () => setResizingCol(null);
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizingCol, resizeStartX, resizeStartWidth, onColumnResize]);

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-auto focus:outline-none select-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <table className="border-collapse text-xs w-max min-w-full" style={{ userSelect: isDragging ? 'none' : undefined }}>
        <thead className="sticky top-0 z-10">
          <tr>
            {/* Corner cell */}
            <th className="sticky left-0 z-20 bg-muted border border-border text-center text-muted-foreground font-medium" style={{ width: ROW_NUM_WIDTH, height: HEADER_HEIGHT }}>
            </th>
            {Array.from({ length: maxCols }).map((_, colIndex) => (
              <th
                key={colIndex}
                className={cn(
                  "bg-muted border border-border text-center text-muted-foreground font-medium relative",
                  selectedCell.col === colIndex && "bg-primary/10 text-primary"
                )}
                style={{ minWidth: sheet.colWidths[colIndex] || 100, height: HEADER_HEIGHT }}
              >
                {getColumnLabel(colIndex)}
                {/* Resize handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10"
                  onMouseDown={(e) => handleResizeStart(colIndex, e)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {/* Row number */}
              <td
                className={cn(
                  "sticky left-0 z-10 bg-muted border border-border text-center text-muted-foreground font-medium",
                  selectedCell.row === rowIndex && "bg-primary/10 text-primary"
                )}
                style={{ width: ROW_NUM_WIDTH, height: ROW_HEIGHT }}
              >
                {rowIndex + 1}
              </td>
              {Array.from({ length: maxCols }).map((_, colIndex) => {
                const cellValue = row[colIndex];
                const isSelected = selectedCell.row === rowIndex && selectedCell.col === colIndex;
                const isRanged = isInRange(rowIndex, colIndex);
                const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                const format = sheet.formats[`${rowIndex}-${colIndex}`] || {};

                return (
                  <td
                    key={colIndex}
                    className={cn(
                      "border border-border bg-background relative",
                      isSelected && "ring-2 ring-primary ring-inset z-[5]",
                      isRanged && !isSelected && "bg-primary/5",
                      !isEditing && "cursor-cell"
                    )}
                    style={{
                      minWidth: sheet.colWidths[colIndex] || 100,
                      height: ROW_HEIGHT,
                      backgroundColor: format.bgColor || undefined,
                    }}
                    onMouseDown={(e) => handleMouseDown(rowIndex, colIndex, e)}
                    onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                    onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                  >
                    {isEditing ? (
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
                          color: format.fontColor || undefined,
                        }}
                      />
                    ) : (
                      <div
                        className="w-full h-full px-1.5 flex items-center overflow-hidden whitespace-nowrap"
                        style={{
                          fontWeight: format.bold ? 'bold' : undefined,
                          fontStyle: format.italic ? 'italic' : undefined,
                          textDecoration: format.underline ? 'underline' : undefined,
                          textAlign: format.align || (typeof cellValue === 'number' ? 'right' : 'left'),
                          color: format.fontColor || undefined,
                          fontSize: format.fontSize ? `${format.fontSize}px` : undefined,
                          justifyContent: format.align === 'center' ? 'center' : format.align === 'right' || (!format.align && typeof cellValue === 'number') ? 'flex-end' : 'flex-start',
                        }}
                      >
                        {formatCellDisplay(cellValue, format)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
