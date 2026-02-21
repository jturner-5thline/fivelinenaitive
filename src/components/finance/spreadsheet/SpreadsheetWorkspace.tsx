import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  FileSpreadsheet, Download, Plus, Sparkles,
  FileDown, FileUp, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpreadsheetWorkbook } from '@/hooks/useSpreadsheetWorkbook';
import { SpreadsheetRibbon } from './SpreadsheetRibbon';
import { FormulaBar, getCellRef } from './FormulaBar';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { SheetTabs } from './SheetTabs';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { ChartPanel, ChartConfig } from './SpreadsheetCharts';
import { FindReplaceDialog } from './FindReplaceDialog';
import { ConditionalFormatDialog, ConditionalFormatRule } from './ConditionalFormatDialog';
import { DataValidationDialog } from './DataValidationDialog';
import { StatusBar } from './StatusBar';
import { isFormula } from '@/lib/formulaEngine';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SpreadsheetWorkspaceProps {
  className?: string;
}

export function SpreadsheetWorkspace({ className }: SpreadsheetWorkspaceProps) {
  const wb = useSpreadsheetWorkbook();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [showChartCreator, setShowChartCreator] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [condFormatOpen, setCondFormatOpen] = useState(false);
  const [dataValidationOpen, setDataValidationOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!wb.workbook) wb.createNewWorkbook();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setFindReplaceOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [wb]);

  const handleFormulaBarChange = useCallback(() => {}, []);

  const handleFormulaBarCommit = useCallback((value: string) => {
    if (isFormula(value)) {
      wb.setCellValue(wb.selectedCell.row, wb.selectedCell.col, value);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && value.trim() === String(num)) {
        wb.setCellValue(wb.selectedCell.row, wb.selectedCell.col, num);
      } else {
        wb.setCellValue(wb.selectedCell.row, wb.selectedCell.col, value || null);
      }
    }
  }, [wb]);

  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    if (isFormula(value)) {
      wb.setCellValue(row, col, value);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && value.trim() === String(num)) {
        wb.setCellValue(row, col, num);
      } else {
        wb.setCellValue(row, col, value || null);
      }
    }
  }, [wb]);

  const handlePaste = useCallback((startRow: number, startCol: number, data: string[][]) => {
    data.forEach((row, rOffset) => {
      row.forEach((cell, cOffset) => { handleCellChange(startRow + rOffset, startCol + cOffset, cell); });
    });
  }, [handleCellChange]);

  const handleChartAdd = useCallback((config: ChartConfig) => { setCharts(prev => [...prev, config]); setShowChartCreator(false); }, []);
  const handleChartRemove = useCallback((id: string) => { setCharts(prev => prev.filter(c => c.id !== id)); }, []);

  const handleFreezeRows = useCallback(() => {
    if (!wb.activeSheet) return;
    wb.setFrozenRows(wb.activeSheet.frozenRows ? 0 : wb.selectedCell.row + 1);
  }, [wb]);

  const handleFreezeCols = useCallback(() => {
    if (!wb.activeSheet) return;
    wb.setFrozenCols(wb.activeSheet.frozenCols ? 0 : wb.selectedCell.col + 1);
  }, [wb]);

  const handleMerge = useCallback(() => { if (!wb.selectionRange) return; wb.mergeCells(wb.selectionRange); toast.success('Cells merged'); }, [wb]);
  const handleUnmerge = useCallback(() => { wb.unmergeCells(wb.selectedCell.row, wb.selectedCell.col); toast.success('Cells unmerged'); }, [wb]);
  const handleAddCondFormat = useCallback((rule: ConditionalFormatRule) => { wb.addConditionalFormat(rule); }, [wb]);
  const handleDeleteCondFormat = useCallback((id: string) => { wb.deleteConditionalFormat(id); }, [wb]);
  const handleApplyValidation = useCallback((rule: any) => { wb.setCellValidation(wb.selectedCell.row, wb.selectedCell.col, rule); toast.success(rule ? 'Validation applied' : 'Validation removed'); }, [wb]);
  const handleSort = useCallback((direction: 'asc' | 'desc') => { wb.sortColumn(wb.selectedCell.col, direction); toast.success(`Sorted ${direction === 'asc' ? 'A→Z' : 'Z→A'}`); }, [wb]);

  const handleExportPdf = useCallback(() => {
    if (!wb.activeSheet) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const sheet = wb.activeSheet;
    doc.setFontSize(14);
    doc.text(wb.workbook?.name || 'Spreadsheet', 14, 15);
    doc.setFontSize(8);
    doc.text(`Sheet: ${sheet.name}`, 14, 22);
    let maxR = 0, maxC = 0;
    sheet.data.forEach((row, r) => { row.forEach((cell, c) => { if (cell !== null && cell !== undefined && cell !== '') { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); } }); });
    const head = [Array.from({ length: maxC + 1 }, (_, i) => { let l = ''; let n = i; while (n >= 0) { l = String.fromCharCode(65 + (n % 26)) + l; n = Math.floor(n / 26) - 1; } return l; })];
    const body = sheet.data.slice(0, maxR + 1).map(row => row.slice(0, maxC + 1).map(cell => cell !== null && cell !== undefined ? String(cell) : ''));
    autoTable(doc, { head, body, startY: 26, styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [100, 100, 100] }, theme: 'grid' });
    doc.save(`${wb.workbook?.name || 'spreadsheet'} - ${sheet.name}.pdf`);
    toast.success('PDF exported');
  }, [wb]);

  const currentCellRef = getCellRef(wb.selectedCell.row, wb.selectedCell.col);
  const currentRawValue = wb.getCellValue(wb.selectedCell.row, wb.selectedCell.col);
  const currentFormat = wb.getCellFormat(wb.selectedCell.row, wb.selectedCell.col);
  const formulaBarValue = currentRawValue !== null && currentRawValue !== undefined ? String(currentRawValue) : '';

  return (
    <div className={cn("flex flex-col h-[calc(100vh-220px)] min-h-[600px] border rounded-lg bg-background overflow-hidden", className)}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium truncate max-w-[200px]">{wb.workbook?.name || 'Untitled'}</span>
          {wb.workbook?.isDirty && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Modified</Badge>}
          {wb.workbook?.source === 'uploaded' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Imported</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">File <ChevronDown className="h-3 w-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => wb.createNewWorkbook()}><Plus className="h-3.5 w-3.5 mr-2" /> New Workbook</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}><FileUp className="h-3.5 w-3.5 mr-2" /> Import Excel/CSV</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => wb.exportToXlsx()}><FileDown className="h-3.5 w-3.5 mr-2" /> Export as .xlsx</DropdownMenuItem>
              <DropdownMenuItem onClick={() => wb.exportToCsv()}><Download className="h-3.5 w-3.5 mr-2" /> Export as .csv</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}><FileDown className="h-3.5 w-3.5 mr-2" /> Export as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant={aiPanelOpen ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setAiPanelOpen(!aiPanelOpen)}>
            <Sparkles className="h-3.5 w-3.5" /> AI
          </Button>
        </div>
      </div>

      {/* Ribbon Toolbar */}
      <SpreadsheetRibbon
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
        onAddChart={() => setShowChartCreator(true)}
        hasRangeSelection={!!wb.selectionRange}
        onFindReplace={() => setFindReplaceOpen(true)}
        onMerge={handleMerge}
        onUnmerge={handleUnmerge}
        onFreezeRows={handleFreezeRows}
        onFreezeCols={handleFreezeCols}
        frozenRows={wb.activeSheet?.frozenRows}
        frozenCols={wb.activeSheet?.frozenCols}
        onConditionalFormat={() => setCondFormatOpen(true)}
        onDataValidation={() => setDataValidationOpen(true)}
        onExportPdf={handleExportPdf}
        onSort={handleSort}
      />

      {/* Formula Bar */}
      <FormulaBar cellRef={currentCellRef} cellValue={formulaBarValue} onValueChange={handleFormulaBarChange} onValueCommit={handleFormulaBarCommit} />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {wb.activeSheet && (
            <SpreadsheetGrid
              sheet={wb.activeSheet}
              selectedCell={wb.selectedCell}
              selectionRange={wb.selectionRange}
              onCellSelect={wb.setSelectedCell}
              onRangeSelect={wb.setSelectionRange}
              onCellChange={handleCellChange}
              onColumnResize={wb.setColumnWidth}
              onPaste={handlePaste}
              onInsertRow={() => wb.insertRow(wb.selectedCell.row)}
              onInsertColumn={() => wb.insertColumn(wb.selectedCell.col)}
              onDeleteRow={() => wb.deleteRow(wb.selectedCell.row)}
              onDeleteColumn={() => wb.deleteColumn(wb.selectedCell.col)}
              onSort={handleSort}
              onMerge={handleMerge}
              onUnmerge={handleUnmerge}
              onAddComment={() => wb.addComment(wb.selectedCell.row, wb.selectedCell.col, 'New comment')}
            />
          )}
          {wb.activeSheet && (charts.length > 0 || showChartCreator) && (
            <ChartPanel charts={charts} sheet={wb.activeSheet} selectionRange={wb.selectionRange} onAddChart={handleChartAdd} onRemoveChart={handleChartRemove} />
          )}
        </div>
        <AIAnalysisPanel workbook={wb.workbook} isOpen={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
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
          onReorder={wb.reorderSheets}
          onSetTabColor={wb.setTabColor}
        />
      )}

      {/* Status Bar */}
      {wb.activeSheet && (
        <StatusBar sheet={wb.activeSheet} selectedCell={wb.selectedCell} selectionRange={wb.selectionRange} currentRawValue={currentRawValue} />
      )}

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

      {wb.activeSheet && <FindReplaceDialog open={findReplaceOpen} onOpenChange={setFindReplaceOpen} sheet={wb.activeSheet} onCellSelect={(row, col) => wb.setSelectedCell({ row, col })} onCellChange={handleCellChange} />}
      <ConditionalFormatDialog open={condFormatOpen} onOpenChange={setCondFormatOpen} rules={wb.activeSheet?.conditionalFormats || []} onAddRule={handleAddCondFormat} onDeleteRule={handleDeleteCondFormat} />
      <DataValidationDialog open={dataValidationOpen} onOpenChange={setDataValidationOpen} currentRule={wb.activeSheet?.validations[`${wb.selectedCell.row}-${wb.selectedCell.col}`]} onApply={handleApplyValidation} />
    </div>
  );
}
