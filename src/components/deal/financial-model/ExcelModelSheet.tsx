import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ParsedSheet } from '@/hooks/useExcelModelParser';
import type { MappingSuggestion } from '@/hooks/useMappingSuggestions';

interface ExcelModelSheetProps {
  sheet: ParsedSheet;
  onCellChange?: (row: number, col: number, value: string) => void;
  readOnly?: boolean;
  suggestions?: MappingSuggestion[];
  onAcceptSuggestion?: (rowIdx: number) => void;
  onRejectSuggestion?: (rowIdx: number) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  is: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/20' },
  bs: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
  checklist: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
};

function ConfidenceDot({ value }: { value: number }) {
  const color = value >= 0.85 ? 'bg-emerald-500' : value >= 0.7 ? 'bg-amber-500' : 'bg-muted-foreground/50';
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color)} />;
}

export function ExcelModelSheet({
  sheet,
  onCellChange,
  readOnly = true,
  suggestions = [],
  onAcceptSuggestion,
  onRejectSuggestion,
}: ExcelModelSheetProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestionMap = new Map<number, MappingSuggestion>();
  suggestions.forEach(s => {
    if (s.status !== 'rejected') suggestionMap.set(s.rowIdx, s);
  });

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

  const isNumericCell = (value: string | number | null): boolean => {
    if (value === null || value === undefined) return false;
    const str = String(value).replace(/[$,()%-]/g, '').trim();
    return !isNaN(parseFloat(str)) && isFinite(parseFloat(str));
  };

  const isHeaderRow = (rowIndex: number): boolean => {
    if (rowIndex === 0) return true;
    const row = sheet.data[rowIndex];
    if (!row) return false;
    return row.every(cell => !isNumericCell(cell));
  };

  return (
    <div className="h-full overflow-auto bg-card/40 backdrop-blur-md rounded-lg border border-border/50">
      <table className="border-collapse text-sm w-max min-w-full font-sans">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 bg-secondary/80 backdrop-blur-sm border-b border-r border-border/30 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground w-12">
              
            </th>
            {Array.from({ length: maxCols }).map((_, colIndex) => (
              <th
                key={colIndex}
                className="bg-secondary/80 backdrop-blur-sm border-b border-r border-border/30 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
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
            const suggestion = suggestionMap.get(rowIndex);
            const catColors = suggestion ? CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.is : null;

            return (
              <tr key={rowIndex} className="group">
                <td className={cn(
                  "sticky left-0 z-10 backdrop-blur-sm border-b border-r border-border/20 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground w-12",
                  suggestion ? "bg-primary/5" : "bg-secondary/60",
                )}>
                  <div className="flex items-center justify-center gap-1">
                    {rowIndex + 1}
                    {suggestion && <ConfidenceDot value={suggestion.confidence} />}
                  </div>
                </td>
                {Array.from({ length: maxCols }).map((_, colIndex) => {
                  const cellValue = row[colIndex];
                  const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                  const isNumeric = isNumericCell(cellValue);
                  const isFirstCol = colIndex === 0 && suggestion;
                  
                  return (
                    <td
                      key={colIndex}
                      className={cn(
                        "border-b border-r border-border/15 px-2 py-1 bg-transparent text-foreground/90",
                        !readOnly && "hover:bg-primary/5 cursor-cell transition-colors duration-150",
                        isEditing && "p-0 ring-1 ring-primary/50 bg-card",
                        isHeader && !suggestion && "bg-secondary/30 font-medium",
                        isNumeric && "text-right tabular-nums",
                        suggestion && !isEditing && catColors?.bg,
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
                          className="h-full w-full border-0 rounded-none bg-transparent focus-visible:ring-1 focus-visible:ring-primary text-sm px-2 py-1"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={cn("block truncate text-[13px]", isNumeric && "flex-1")}>
                            {cellValue !== null && cellValue !== undefined ? String(cellValue) : ''}
                          </span>
                          {isFirstCol && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[8px] h-4 px-1.5 shrink-0 cursor-default",
                                    catColors?.bg, catColors?.text, catColors?.border,
                                  )}
                                >
                                  <Sparkles className="h-2 w-2 mr-0.5" />
                                  {suggestion!.suggestedField}
                                  <span className="ml-1 opacity-70">{Math.round(suggestion!.confidence * 100)}%</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[200px]">
                                <p className="text-xs">{suggestion!.reason}</p>
                                {(onAcceptSuggestion || onRejectSuggestion) && (
                                  <div className="flex gap-1 mt-1.5">
                                    {onAcceptSuggestion && (
                                      <Button size="sm" className="h-5 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onAcceptSuggestion(rowIndex); }}>
                                        Accept
                                      </Button>
                                    )}
                                    {onRejectSuggestion && (
                                      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onRejectSuggestion(rowIndex); }}>
                                        Dismiss
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
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
