import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ParsedSheet } from '@/hooks/useExcelModelParser';

interface ExcelModelSheetProps {
  sheet: ParsedSheet;
  onCellChange?: (row: number, col: number, value: string) => void;
  readOnly?: boolean;
}

export function ExcelModelSheet({ sheet, onCellChange, readOnly = true }: ExcelModelSheetProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (readOnly) return;
    
    const cellValue = sheet.data[row]?.[col];
    setEditingCell({ row, col });
    setEditValue(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
  }, [sheet.data, readOnly]);

  const handleCellBlur = useCallback(() => {
    if (!editingCell) return;
    
    const { row, col } = editingCell;
    const oldValue = sheet.data[row]?.[col];
    const oldValueStr = oldValue !== null && oldValue !== undefined ? String(oldValue) : '';
    
    if (editValue !== oldValueStr && onCellChange) {
      onCellChange(row, col, editValue);
    }
    
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, sheet.data, onCellChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellBlur();
      
      if (editingCell) {
        const nextRow = editingCell.row + 1;
        if (nextRow < sheet.data.length) {
          setTimeout(() => handleCellClick(nextRow, editingCell.col), 0);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur();
      
      if (editingCell) {
        const maxCols = Math.max(...sheet.data.map(r => r.length));
        const nextCol = editingCell.col + 1;
        if (nextCol < maxCols) {
          setTimeout(() => handleCellClick(editingCell.row, nextCol), 0);
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  }, [handleCellBlur, editingCell, sheet.data, handleCellClick]);

  const getColumnLabel = (index: number): string => {
    let label = '';
    let num = index;
    while (num >= 0) {
      label = String.fromCharCode(65 + (num % 26)) + label;
      num = Math.floor(num / 26) - 1;
    }
    return label;
  };

  const maxCols = Math.max(...sheet.data.map(r => r.length), 1);

  // Detect if a cell looks like a number for alignment
  const isNumericCell = (value: string | number | null): boolean => {
    if (value === null || value === undefined) return false;
    const str = String(value).replace(/[$,()%-]/g, '').trim();
    return !isNaN(parseFloat(str)) && isFinite(parseFloat(str));
  };

  // Detect if row is a header (first row or all text)
  const isHeaderRow = (rowIndex: number): boolean => {
    if (rowIndex === 0) return true;
    const row = sheet.data[rowIndex];
    if (!row) return false;
    return row.every(cell => !isNumericCell(cell));
  };

  return (
    <div className="h-full overflow-auto">
      <table className="border-collapse text-sm w-max min-w-full">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 bg-muted border border-border px-2 py-1 text-center text-xs font-medium text-muted-foreground w-12">
              
            </th>
            {Array.from({ length: maxCols }).map((_, colIndex) => (
              <th
                key={colIndex}
                className="bg-muted border border-border px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                style={{ minWidth: sheet.colWidths[colIndex] || 100 }}
              >
                {getColumnLabel(colIndex)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.data.map((row, rowIndex) => {
            const isHeader = isHeaderRow(rowIndex);
            return (
              <tr key={rowIndex} className="group">
                <td className="sticky left-0 z-10 bg-muted border border-border px-2 py-1 text-center text-xs font-medium text-muted-foreground w-12">
                  {rowIndex + 1}
                </td>
                {Array.from({ length: maxCols }).map((_, colIndex) => {
                  const cellValue = row[colIndex];
                  const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                  const isNumeric = isNumericCell(cellValue);
                  
                  return (
                    <td
                      key={colIndex}
                      className={cn(
                        "border border-border px-2 py-1 bg-background",
                        !readOnly && "hover:bg-muted/50 cursor-cell",
                        isEditing && "p-0 bg-background",
                        isHeader && "bg-slate-50 dark:bg-slate-900 font-medium",
                        isNumeric && "text-right font-mono"
                      )}
                      style={{ minWidth: sheet.colWidths[colIndex] || 100 }}
                      onClick={() => handleCellClick(rowIndex, colIndex)}
                    >
                      {isEditing ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={handleKeyDown}
                          className="h-full w-full border-0 rounded-none focus-visible:ring-2 focus-visible:ring-primary text-sm px-2 py-1"
                        />
                      ) : (
                        <span className="block truncate">
                          {cellValue !== null && cellValue !== undefined ? String(cellValue) : ''}
                        </span>
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
  );
}
