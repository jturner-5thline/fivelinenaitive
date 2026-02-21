import { useMemo } from 'react';
import { SpreadsheetSheet, CellRange, CellSelection } from '@/hooks/useSpreadsheetWorkbook';
import { evaluateCell, isFormula } from '@/lib/formulaEngine';
import { getCellRef } from './FormulaBar';

interface StatusBarProps {
  sheet: SpreadsheetSheet;
  selectedCell: CellSelection;
  selectionRange: CellRange | null;
  currentRawValue: string | number | null;
}

export function StatusBar({ sheet, selectedCell, selectionRange, currentRawValue }: StatusBarProps) {
  const stats = useMemo(() => {
    const range = selectionRange || {
      startRow: selectedCell.row, startCol: selectedCell.col,
      endRow: selectedCell.row, endCol: selectedCell.col,
    };
    const minR = Math.min(range.startRow, range.endRow);
    const maxR = Math.max(range.startRow, range.endRow);
    const minC = Math.min(range.startCol, range.endCol);
    const maxC = Math.max(range.startCol, range.endCol);

    const nums: number[] = [];
    let count = 0;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const val = evaluateCell(r, c, sheet.data);
        if (val !== null && val !== undefined && val !== '') {
          count++;
          const n = typeof val === 'number' ? val : parseFloat(String(val));
          if (!isNaN(n)) nums.push(n);
        }
      }
    }

    if (nums.length === 0) return { count, sum: null, avg: null, min: null, max: null };

    const sum = nums.reduce((a, b) => a + b, 0);
    return {
      count,
      sum,
      avg: sum / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    };
  }, [sheet.data, selectedCell, selectionRange]);

  const currentCellRef = getCellRef(selectedCell.row, selectedCell.col);

  return (
    <div className="flex items-center justify-between px-3 py-1 border-t bg-muted/40 text-[10px] text-muted-foreground select-none">
      <div className="flex items-center gap-3">
        <span className="font-medium">{currentCellRef}</span>
        {isFormula(currentRawValue) && <span className="text-primary font-medium">ƒx</span>}
        {sheet.frozenRows ? <span>Frozen: {sheet.frozenRows}R</span> : null}
        {sheet.frozenCols ? <span>{sheet.frozenCols}C</span> : null}
        {sheet.mergedCells.length > 0 && <span>Merged: {sheet.mergedCells.length}</span>}
      </div>
      <div className="flex items-center gap-4">
        {stats.count > 1 && (
          <>
            <span>Count: <b className="text-foreground">{stats.count}</b></span>
            {stats.sum !== null && (
              <>
                <span>Sum: <b className="text-foreground">{stats.sum.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></span>
                <span>Average: <b className="text-foreground">{stats.avg!.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></span>
                <span>Min: <b className="text-foreground">{stats.min!.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></span>
                <span>Max: <b className="text-foreground">{stats.max!.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></span>
              </>
            )}
          </>
        )}
        <span>{sheet.name}</span>
      </div>
    </div>
  );
}
