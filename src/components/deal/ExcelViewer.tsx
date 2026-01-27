import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { Loader2, Save, Undo2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ExcelViewerProps {
  fileUrl: string;
  fileName: string;
  onSave?: (workbook: XLSX.WorkBook) => Promise<void>;
  onDownload?: () => void;
  readOnly?: boolean;
}

interface CellEdit {
  sheet: string;
  row: number;
  col: number;
  oldValue: string;
  newValue: string;
}

interface SheetData {
  name: string;
  data: (string | number | null)[][];
  colWidths: number[];
}

export const ExcelViewer = forwardRef<HTMLDivElement, ExcelViewerProps>(function ExcelViewer({ 
  fileUrl, 
  fileName, 
  onSave, 
  onDownload,
  readOnly = false 
}, ref) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editHistory, setEditHistory] = useState<CellEdit[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Load Excel file
  useEffect(() => {
    const loadExcel = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        
        setWorkbook(wb);
        
        // Parse all sheets
        const parsedSheets: SheetData[] = wb.SheetNames.map(name => {
          const sheet = wb.Sheets[name];
          const jsonData = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { 
            header: 1,
            defval: null,
            raw: false
          });
          
          // Calculate column widths based on content
          const maxCols = Math.max(...jsonData.map(row => row.length), 1);
          const colWidths = Array(maxCols).fill(100);
          
          jsonData.forEach(row => {
            row.forEach((cell, colIndex) => {
              if (cell !== null) {
                const cellLength = String(cell).length;
                colWidths[colIndex] = Math.max(colWidths[colIndex], Math.min(cellLength * 8 + 20, 300));
              }
            });
          });
          
          return {
            name,
            data: jsonData,
            colWidths,
          };
        });
        
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
      // Record the edit
      setEditHistory(prev => [...prev, {
        sheet: activeSheet,
        row,
        col,
        oldValue: oldValueStr,
        newValue: editValue,
      }]);

      // Update the sheet data
      setSheets(prev => prev.map(sheet => {
        if (sheet.name !== activeSheet) return sheet;
        
        const newData = [...sheet.data];
        // Ensure the row exists
        while (newData.length <= row) {
          newData.push([]);
        }
        // Ensure the column exists
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
      
      // Move to next row
      if (editingCell && currentSheet) {
        const nextRow = editingCell.row + 1;
        if (nextRow < currentSheet.data.length) {
          setTimeout(() => handleCellClick(nextRow, editingCell.col), 0);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur();
      
      // Move to next column
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
    if (!workbook || !onSave) return;

    setIsSaving(true);
    try {
      // Update workbook with current sheet data
      sheets.forEach(sheet => {
        const ws = XLSX.utils.aoa_to_sheet(sheet.data);
        workbook.Sheets[sheet.name] = ws;
      });

      await onSave(workbook);
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
  }, [workbook, sheets, onSave]);

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

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate max-w-[200px]">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">• Unsaved changes</span>
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
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Undo
              </Button>
              {onSave && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Save
                </Button>
              )}
            </>
          )}
          {onDownload && (
            <Button variant="ghost" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* Sheet Tabs */}
      {sheets.length > 1 && (
        <div className="border-b bg-muted/20 overflow-x-auto">
          <div className="flex items-center p-1 gap-1 min-w-max">
            {sheets.map((sheet) => (
              <Button
                key={sheet.name}
                variant={activeSheet === sheet.name ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs whitespace-nowrap"
                onClick={() => setActiveSheet(sheet.name)}
              >
                {sheet.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Spreadsheet Grid */}
      <div className="flex-1 overflow-auto" ref={tableRef}>
        <table className="border-collapse text-sm w-max min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              {/* Row number header */}
              <th className="sticky left-0 z-20 bg-muted border border-border px-2 py-1 text-center text-xs font-medium text-muted-foreground w-12">
                
              </th>
              {/* Column headers */}
              {Array.from({ length: maxCols }).map((_, colIndex) => (
                <th
                  key={colIndex}
                  className="bg-muted border border-border px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                  style={{ minWidth: currentSheet.colWidths[colIndex] || 100 }}
                >
                  {getColumnLabel(colIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.data.map((row, rowIndex) => (
              <tr key={rowIndex} className="group">
                {/* Row number */}
                <td className="sticky left-0 z-10 bg-muted border border-border px-2 py-1 text-center text-xs font-medium text-muted-foreground w-12">
                  {rowIndex + 1}
                </td>
                {/* Cells */}
                {Array.from({ length: maxCols }).map((_, colIndex) => {
                  const cellValue = row[colIndex];
                  const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                  
                  return (
                    <td
                      key={colIndex}
                      className={cn(
                        "border border-border px-2 py-1 bg-background",
                        "hover:bg-muted/50 cursor-cell transition-colors",
                        isEditing && "p-0 bg-background"
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
        <span>
          {currentSheet.data.length} rows × {maxCols} columns
        </span>
        {editingCell && (
          <span>
            Editing: {getColumnLabel(editingCell.col)}{editingCell.row + 1}
          </span>
        )}
      </div>
    </div>
  );
});
