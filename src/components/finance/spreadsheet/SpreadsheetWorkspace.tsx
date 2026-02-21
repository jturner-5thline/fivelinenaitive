import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  FileSpreadsheet, Upload, Download, Plus, Sparkles,
  FileDown, FileUp, Save, FolderOpen, ChevronDown,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpreadsheetWorkbook } from '@/hooks/useSpreadsheetWorkbook';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { FormulaBar, getCellRef } from './FormulaBar';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { SheetTabs } from './SheetTabs';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface SpreadsheetWorkspaceProps {
  className?: string;
}

export function SpreadsheetWorkspace({ className }: SpreadsheetWorkspaceProps) {
  const wb = useSpreadsheetWorkbook();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with empty workbook if none loaded
  useEffect(() => {
    if (!wb.workbook) {
      wb.createNewWorkbook();
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await wb.importFromFile(file);
      toast.success('File imported', { description: `${file.name} loaded successfully` });
    } catch (err) {
      toast.error('Import failed', { description: err instanceof Error ? err.message : 'Could not parse file' });
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [wb]);

  const handleFormulaBarChange = useCallback((value: string) => {
    // Live preview not needed
  }, []);

  const handleFormulaBarCommit = useCallback((value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && value.trim() === String(num)) {
      wb.setCellValue(wb.selectedCell.row, wb.selectedCell.col, num);
    } else {
      wb.setCellValue(wb.selectedCell.row, wb.selectedCell.col, value || null);
    }
  }, [wb]);

  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && value.trim() === String(num)) {
      wb.setCellValue(row, col, num);
    } else {
      wb.setCellValue(row, col, value || null);
    }
  }, [wb]);

  const currentCellRef = getCellRef(wb.selectedCell.row, wb.selectedCell.col);
  const currentCellValue = wb.getCellValue(wb.selectedCell.row, wb.selectedCell.col);
  const currentFormat = wb.getCellFormat(wb.selectedCell.row, wb.selectedCell.col);

  return (
    <div className={cn("flex flex-col h-[calc(100vh-220px)] min-h-[600px] border rounded-lg bg-background overflow-hidden", className)}>
      {/* Top bar with file actions */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium truncate max-w-[200px]">
            {wb.workbook?.name || 'Untitled'}
          </span>
          {wb.workbook?.isDirty && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Modified</Badge>
          )}
          {wb.workbook?.source === 'uploaded' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Imported</Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* File menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                File <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => wb.createNewWorkbook()}>
                <Plus className="h-3.5 w-3.5 mr-2" /> New Workbook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5 mr-2" /> Import Excel/CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => wb.exportToXlsx()}>
                <FileDown className="h-3.5 w-3.5 mr-2" /> Export as .xlsx
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => wb.exportToCsv()}>
                <Download className="h-3.5 w-3.5 mr-2" /> Export as .csv
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* AI Panel Toggle */}
          <Button
            variant={aiPanelOpen ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <SpreadsheetToolbar
        currentFormat={currentFormat}
        onFormatChange={wb.applyFormatToSelection}
        onUndo={wb.undo}
        onRedo={wb.redo}
        canUndo={wb.canUndo}
        canRedo={wb.canRedo}
        onInsertRow={() => wb.insertRow(wb.selectedCell.row)}
        onInsertColumn={() => wb.insertColumn(wb.selectedCell.col)}
        onDeleteRow={() => wb.deleteRow(wb.selectedCell.row)}
        onDeleteColumn={() => wb.deleteColumn(wb.selectedCell.col)}
      />

      {/* Formula Bar */}
      <FormulaBar
        cellRef={currentCellRef}
        cellValue={currentCellValue !== null && currentCellValue !== undefined ? String(currentCellValue) : ''}
        onValueChange={handleFormulaBarChange}
        onValueCommit={handleFormulaBarCommit}
      />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Grid */}
        {wb.activeSheet && (
          <SpreadsheetGrid
            sheet={wb.activeSheet}
            selectedCell={wb.selectedCell}
            selectionRange={wb.selectionRange}
            onCellSelect={wb.setSelectedCell}
            onRangeSelect={wb.setSelectionRange}
            onCellChange={handleCellChange}
            onColumnResize={wb.setColumnWidth}
          />
        )}

        {/* AI Panel */}
        <AIAnalysisPanel
          workbook={wb.workbook}
          isOpen={aiPanelOpen}
          onClose={() => setAiPanelOpen(false)}
        />
      </div>

      {/* Sheet Tabs */}
      {wb.workbook && (
        <SheetTabs
          sheets={wb.workbook.sheets}
          activeIndex={wb.workbook.activeSheetIndex}
          onSelect={wb.setActiveSheet}
          onAdd={() => wb.addSheet()}
          onRename={wb.renameSheet}
          onDelete={wb.deleteSheet}
          onDuplicate={wb.duplicateSheet}
        />
      )}

      {/* Status Bar */}
      {wb.activeSheet && (
        <div className="flex items-center justify-between px-3 py-1 border-t bg-muted/30 text-[10px] text-muted-foreground">
          <span>
            {wb.activeSheet.data.length} rows × {Math.max(...wb.activeSheet.data.map(r => r.length), 1)} columns
          </span>
          <div className="flex items-center gap-3">
            <span>Cell: {currentCellRef}</span>
            <span>Sheet: {wb.activeSheet.name}</span>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImport}
      />
    </div>
  );
}
