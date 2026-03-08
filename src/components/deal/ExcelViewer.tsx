import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Save, Undo2, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import ExcelJS from 'exceljs';
import { parseExcelFromUrl, ParsedSheet, createWorkbookFromSheets, workbookToBlob } from '@/lib/excelUtils';
import type { MappingSuggestion } from '@/hooks/useMappingSuggestions';

interface ExcelViewerProps {
  fileUrl: string;
  fileName: string;
  onSave?: (workbook: ExcelJS.Workbook) => Promise<void>;
  onDownload?: () => void;
  readOnly?: boolean;
  suggestions?: MappingSuggestion[];
  onAcceptSuggestion?: (rowIdx: number) => void;
  onRejectSuggestion?: (rowIdx: number) => void;
}

interface CellEdit {
  sheet: string;
  row: number;
  col: number;
  oldValue: string;
  newValue: string;
}

// Color map for suggestion categories
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  is: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/20' },
  bs: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
  checklist: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
};

function ConfidenceDot({ value }: { value: number }) {
  const color = value >= 0.85
    ? 'bg-emerald-500'
    : value >= 0.7
      ? 'bg-amber-500'
      : 'bg-muted-foreground/50';
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color)} />;
}

export function ExcelViewer({ 
  fileUrl, 
  fileName, 
  onSave, 
  onDownload,
  readOnly = false,
  suggestions = [],
  onAcceptSuggestion,
  onRejectSuggestion,
}: ExcelViewerProps) {
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editHistory, setEditHistory] = useState<CellEdit[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Build suggestions lookup
  const suggestionMap = new Map<number, MappingSuggestion>();
  suggestions.forEach(s => {
    if (s.status !== 'rejected') suggestionMap.set(s.rowIdx, s);
  });

  // Load Excel file
  useEffect(() => {
    const loadExcel = async () => {
      setIsLoading(true);
      try {
        const { sheets: parsedSheets, workbook: wb } = await parseExcelFromUrl(fileUrl);
        
        setWorkbook(wb);
        setSheets(parsedSheets);
        
        if (parsedSheets.length > 0) {
          setActiveSheet(parsedSheets[0].name);
        }
      } catch (error) {
        console.error('Error loading Excel file:', error);
        toast({
          title: 'Failed to load file',
          description: 'Could not parse the Excel file',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (fileUrl) {
      loadExcel();
    }
  }, [fileUrl]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const currentSheet = sheets.find(s => s.name === activeSheet);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (readOnly) return;
    
    const cellValue = currentSheet?.data[row]?.[col];
    setEditingCell({ row, col });
    setEditValue(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
  }, [currentSheet, readOnly]);

  const handleCellBlur = useCallback(() => {
    if (!editingCell || !currentSheet) {
      setEditingCell(null);
      return;
    }

    const { row, col } = editingCell;
    const oldValue = currentSheet.data[row]?.[col];
    const oldValueStr = oldValue !== null && oldValue !== undefined ? String(oldValue) : '';
    
    if (editValue !== oldValueStr) {
      setEditHistory(prev => [...prev, {
        sheet: activeSheet,
        row,
        col,
        oldValue: oldValueStr,
        newValue: editValue,
      }]);

      setSheets(prev => prev.map(sheet => {
        if (sheet.name !== activeSheet) return sheet;
        
        const newData = [...sheet.data];
        while (newData.length <= row) {
          newData.push([]);
        }
        while (newData[row].length <= col) {
          newData[row].push(null);
        }
        newData[row][col] = editValue || null;
        
        return { ...sheet, data: newData };
      }));

      setHasUnsavedChanges(true);
    }

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, currentSheet, activeSheet]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellBlur();
      
      if (editingCell && currentSheet) {
        const nextRow = editingCell.row + 1;
        if (nextRow < currentSheet.data.length) {
          setTimeout(() => handleCellClick(nextRow, editingCell.col), 0);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur();
      
      if (editingCell && currentSheet) {
        const nextCol = editingCell.col + 1;
        const maxCols = Math.max(...currentSheet.data.map(r => r.length));
        if (nextCol < maxCols) {
          setTimeout(() => handleCellClick(editingCell.row, nextCol), 0);
        } else if (editingCell.row + 1 < currentSheet.data.length) {
          setTimeout(() => handleCellClick(editingCell.row + 1, 0), 0);
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  }, [handleCellBlur, editingCell, currentSheet, handleCellClick]);

  const handleUndo = useCallback(() => {
    if (editHistory.length === 0) return;

    const lastEdit = editHistory[editHistory.length - 1];
    
    setSheets(prev => prev.map(sheet => {
      if (sheet.name !== lastEdit.sheet) return sheet;
      
      const newData = [...sheet.data];
      newData[lastEdit.row][lastEdit.col] = lastEdit.oldValue || null;
      
      return { ...sheet, data: newData };
    }));

    setEditHistory(prev => prev.slice(0, -1));
    setHasUnsavedChanges(editHistory.length > 1);
  }, [editHistory]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      const updatedWorkbook = createWorkbookFromSheets(sheets);
      await onSave(updatedWorkbook);
      setHasUnsavedChanges(false);
      setEditHistory([]);
      toast({ title: 'Saved', description: 'Changes saved successfully' });
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Save failed',
        description: 'Could not save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [sheets, onSave]);

  const getColumnLabel = (index: number): string => {
    let label = '';
    let num = index;
    while (num >= 0) {
      label = String.fromCharCode(65 + (num % 26)) + label;
      num = Math.floor(num / 26) - 1;
    }
    return label;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentSheet) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No data to display
      </div>
    );
  }

  const maxCols = Math.max(...currentSheet.data.map(r => r.length), 1);
  const hasSuggestions = suggestionMap.size > 0;

  return (
    <div className="h-full flex flex-col bg-card/40 backdrop-blur-md rounded-lg border border-border/50">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-card/30 backdrop-blur-sm rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate max-w-[200px] text-foreground">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="text-xs text-warning">• Unsaved changes</span>
          )}
          {hasSuggestions && (
            <Badge variant="outline" className="text-[9px] h-5 gap-1 bg-primary/5 text-primary border-primary/20">
              <Sparkles className="h-2.5 w-2.5" />
              {suggestionMap.size} AI suggestion{suggestionMap.size > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={editHistory.length === 0}
                className="h-7 text-xs"
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                Undo
              </Button>
              {onSave && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || isSaving}
                  className="h-7 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  Save
                </Button>
              )}
            </>
          )}
          {onDownload && (
            <Button variant="ghost" size="sm" onClick={onDownload} className="h-7 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* Sheet Tabs */}
      {sheets.length > 1 && (
        <div className="border-b border-border/30 bg-card/20 overflow-x-auto">
          <div className="flex items-center px-2 py-1 gap-1 min-w-max">
            {sheets.map((sheet) => (
              <button
                key={sheet.name}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition-all duration-200 whitespace-nowrap",
                  activeSheet === sheet.name
                    ? "bg-primary/15 text-primary font-medium border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}
                onClick={() => setActiveSheet(sheet.name)}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spreadsheet Grid */}
      <div className="flex-1 overflow-auto" ref={tableRef}>
        <table className="border-collapse text-sm w-max min-w-full font-sans">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-secondary/80 backdrop-blur-sm border-b border-r border-border/30 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground w-12">
                
              </th>
              {Array.from({ length: maxCols }).map((_, colIndex) => (
                <th
                  key={colIndex}
                  className="bg-secondary/80 backdrop-blur-sm border-b border-r border-border/30 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
                  style={{ minWidth: currentSheet.colWidths[colIndex] || 100 }}
                >
                  {getColumnLabel(colIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.data.map((row, rowIndex) => {
              const suggestion = suggestionMap.get(rowIndex);
              const catColors = suggestion ? CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.is : null;

              return (
                <tr
                  key={rowIndex}
                  className={cn(
                    "group",
                    suggestion && "relative",
                    suggestion && suggestion.status === 'accepted' && "bg-emerald-500/5",
                  )}
                >
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
                    const isFirstCol = colIndex === 0 && suggestion;
                    
                    return (
                      <td
                        key={colIndex}
                        className={cn(
                          "border-b border-r border-border/15 px-2 py-1 bg-transparent text-foreground/90",
                          "hover:bg-primary/5 cursor-cell transition-colors duration-150",
                          isEditing && "p-0 ring-1 ring-primary/50 bg-card",
                          suggestion && !isEditing && catColors?.bg,
                        )}
                        style={{ minWidth: currentSheet.colWidths[colIndex] || 100 }}
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
                            <span className="block truncate text-[13px]">
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

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/30 bg-card/20 text-[11px] text-muted-foreground rounded-b-lg">
        <span>
          {currentSheet.data.length} rows × {maxCols} columns
        </span>
        <div className="flex items-center gap-3">
          {hasSuggestions && (
            <span className="text-primary/80">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {suggestionMap.size} suggested mapping{suggestionMap.size > 1 ? 's' : ''}
            </span>
          )}
          {editingCell && (
            <span className="text-primary/80">
              Editing: {getColumnLabel(editingCell.col)}{editingCell.row + 1}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
