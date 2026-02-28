import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitialSheetState, getColumnLabel, type SheetState, type CellData } from './repModelData';

interface EditChange {
  row: number;
  col: number;
  oldCell: CellData;
}

const COL_WIDTHS: Record<number, number> = {
  0: 180, // Name
  1: 60,  // TEAM
  2: 30, 3: 30, 4: 200, // spacer + metric label
};
const DEFAULT_COL_WIDTH = 110;

function getColWidth(col: number): number {
  return COL_WIDTHS[col] ?? DEFAULT_COL_WIDTH;
}

export function RepPerformanceModelGrid() {
  const [sheetState, setSheetState] = useState<SheetState>(() => getInitialSheetState());
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [undoStack, setUndoStack] = useState<EditChange[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellClick = useCallback((row: number, col: number) => {
    const cell = sheetState.rows[row]?.cells[col];
    if (!cell) return;
    // Don't edit header rows (first 3 rows and header band cells)
    if (row < 3) return;
    if (cell.headerBand && cell.type === 'string') return;
    
    setEditingCell({ row, col });
    setEditValue(cell.formattedValue);
  }, [sheetState]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    const oldCell = { ...sheetState.rows[row].cells[col] };
    
    if (editValue !== oldCell.formattedValue) {
      // Determine new cell type and formatting
      let newCell: CellData;
      const trimmed = editValue.trim();
      
      if (trimmed === '') {
        newCell = { rawValue: null, formattedValue: '', type: 'empty' };
      } else if (trimmed.endsWith('%') || (oldCell.type === 'percent' && !isNaN(parseFloat(trimmed)))) {
        const numVal = parseFloat(trimmed.replace('%', ''));
        const fmt = trimmed.endsWith('%') ? trimmed : `${numVal}%`;
        newCell = { rawValue: numVal / 100, formattedValue: fmt, type: 'percent' };
      } else if (trimmed.startsWith('$') || oldCell.type === 'currency') {
        newCell = { rawValue: trimmed, formattedValue: trimmed, type: 'currency' };
      } else if (!isNaN(parseFloat(trimmed))) {
        newCell = { rawValue: parseFloat(trimmed), formattedValue: trimmed, type: 'number' };
      } else {
        newCell = { rawValue: trimmed, formattedValue: trimmed, type: 'string' };
      }
      
      // Preserve styling
      newCell.bold = oldCell.bold;
      newCell.italic = oldCell.italic;
      newCell.headerBand = oldCell.headerBand;

      setSheetState(prev => {
        const newRows = [...prev.rows];
        const newCells = [...newRows[row].cells];
        newCells[col] = newCell;
        newRows[row] = { cells: newCells };
        return { ...prev, rows: newRows };
      });

      setUndoStack(prev => [...prev.slice(-9), { row, col, oldCell }]);
    }
    
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, sheetState]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      if (editingCell) {
        const nextCol = editingCell.col + 1;
        if (nextCol < sheetState.colCount) {
          setTimeout(() => handleCellClick(editingCell.row, nextCol), 0);
        }
      }
    }
  }, [commitEdit, editingCell, sheetState.colCount, handleCellClick]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setSheetState(prev => {
      const newRows = [...prev.rows];
      const newCells = [...newRows[last.row].cells];
      newCells[last.col] = last.oldCell;
      newRows[last.row] = { cells: newCells };
      return { ...prev, rows: newRows };
    });
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack]);

  const handleReset = useCallback(() => {
    setSheetState(getInitialSheetState());
    setUndoStack([]);
    setEditingCell(null);
  }, []);

  const handleExportCSV = useCallback(() => {
    const csvRows: string[] = [];
    for (const row of sheetState.rows) {
      const csvCells = row.cells.map(cell => {
        const val = cell.formattedValue;
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      // Trim trailing empty cells
      let lastNonEmpty = csvCells.length - 1;
      while (lastNonEmpty >= 0 && csvCells[lastNonEmpty] === '') lastNonEmpty--;
      if (lastNonEmpty >= 0) {
        csvRows.push(csvCells.slice(0, lastNonEmpty + 1).join(','));
      }
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rep_performance_model.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [sheetState]);

  // Memoize total width for performance
  const totalWidth = useMemo(() => {
    let w = 40; // row number column
    for (let i = 0; i < sheetState.colCount; i++) {
      w += getColWidth(i);
    }
    return w;
  }, [sheetState.colCount]);

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Rep Performance & Pipeline Model</CardTitle>
            <CardDescription>Interactive view mirroring the team's Google Sheet with live-editable metrics.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoStack.length === 0}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Undo ({undoStack.length})
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div 
          ref={gridRef}
          className="overflow-auto border-t border-border"
          style={{ maxHeight: '70vh' }}
        >
          <table 
            className="border-collapse text-xs"
            style={{ width: totalWidth, minWidth: '100%' }}
          >
            {/* Column header row */}
            <thead className="sticky top-0 z-20">
              <tr>
                <th 
                  className="sticky left-0 z-30 bg-muted border border-border px-1 py-0.5 text-center text-[10px] font-medium text-muted-foreground"
                  style={{ width: 40, minWidth: 40 }}
                >
                  
                </th>
                {Array.from({ length: sheetState.colCount }).map((_, colIndex) => (
                  <th
                    key={colIndex}
                    className="bg-muted border border-border px-1 py-0.5 text-center text-[10px] font-medium text-muted-foreground whitespace-nowrap"
                    style={{ width: getColWidth(colIndex), minWidth: getColWidth(colIndex) }}
                  >
                    {getColumnLabel(colIndex)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheetState.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="group">
                  {/* Row number */}
                  <td 
                    className="sticky left-0 z-10 bg-muted border border-border px-1 py-0.5 text-center text-[10px] font-medium text-muted-foreground"
                    style={{ width: 40, minWidth: 40 }}
                  >
                    {rowIndex + 1}
                  </td>
                  {row.cells.map((cell, colIndex) => {
                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                    const isNumeric = cell.type === 'number' || cell.type === 'currency' || cell.type === 'percent';
                    
                    return (
                      <td
                        key={colIndex}
                        className={cn(
                          "border border-border/50 px-1.5 py-0.5 bg-background transition-colors",
                          "hover:bg-muted/30 cursor-cell",
                          isEditing && "p-0 bg-background ring-2 ring-primary ring-inset",
                          cell.headerBand && "bg-muted/60",
                          cell.bold && "font-semibold",
                          cell.italic && "italic text-muted-foreground",
                          isNumeric && "text-right font-mono",
                          cell.type === 'empty' && "bg-background",
                        )}
                        style={{ 
                          width: getColWidth(colIndex), 
                          minWidth: getColWidth(colIndex),
                          maxWidth: getColWidth(colIndex),
                        }}
                        onClick={() => handleCellClick(rowIndex, colIndex)}
                      >
                        {isEditing ? (
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            className="h-5 w-full border-0 rounded-none focus-visible:ring-0 text-xs px-1.5 py-0 bg-background"
                          />
                        ) : (
                          <span className="block truncate text-[11px] leading-tight">
                            {cell.formattedValue}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
