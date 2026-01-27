import React, { useState, useCallback, useRef, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Save, Loader2, Upload, ClipboardPaste, Undo2, Copy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { FinancialCategory, FinancialLineItem, FinancialDataEntry, PeriodColumn, FinancePeriodType, FinancialPeriod } from "@/hooks/useFinanceDataRange";
import { formatCurrencyInputValue, parseCurrencyInputValue, formatAmountWithCommas } from "@/utils/currencyFormat";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// Type for undo history
interface UndoEntry {
  periodId: string;
  lineItemId: string;
  previousAmount: number;
  newAmount: number;
  timestamp: number;
}

interface FinancialStatementTableRangeProps {
  title: string;
  icon: React.ReactNode;
  companyId: string;
  periodType: FinancePeriodType;
  periodColumns: PeriodColumn[];
  categories: FinancialCategory[];
  lineItems: FinancialLineItem[];
  financialData: FinancialDataEntry[];
  isLoading: boolean;
  onUpdateData: (periodId: string, lineItemId: string, amount: number, notes?: string) => Promise<boolean>;
  onCreatePeriod: (column: PeriodColumn) => Promise<FinancialPeriod | null>;
  onRefresh: () => Promise<void>;
}

interface CellPosition {
  rowIndex: number;
  colIndex: number;
  lineItemId: string;
  periodId: string;
}

export function FinancialStatementTableRange({
  title,
  icon,
  companyId,
  periodType,
  periodColumns,
  categories,
  lineItems,
  financialData,
  isLoading,
  onUpdateData,
  onCreatePeriod,
  onRefresh,
}: FinancialStatementTableRangeProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [creatingPeriod, setCreatingPeriod] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get flattened list of line items (excluding category headers)
  const flatLineItems = categories.flatMap(cat => 
    lineItems.filter(li => li.category_id === cat.id)
  );

  // Get periods that exist
  const existingPeriodColumns = periodColumns.filter(col => col.period);

  const getDataForCell = useCallback((periodId: string | undefined, lineItemId: string) => {
    if (!periodId) return undefined;
    return financialData.find(
      d => d.period_id === periodId && d.line_item_id === lineItemId
    );
  }, [financialData]);

  const handleStartEdit = (periodId: string, lineItemId: string, currentValue: number, replaceValue?: string) => {
    const key = `${periodId}-${lineItemId}`;
    setEditingCell(key);
    setEditValue(replaceValue !== undefined ? replaceValue : formatCurrencyInputValue(currentValue));
  };

  const handleSave = async (periodId: string, lineItemId: string, previousAmount?: number) => {
    const key = `${periodId}-${lineItemId}`;
    setSavingCell(key);
    
    const numericValue = parseCurrencyInputValue(editValue) || 0;
    
    // Store previous value for undo
    if (previousAmount !== undefined && previousAmount !== numericValue) {
      setUndoHistory(prev => [...prev.slice(-19), {
        periodId,
        lineItemId,
        previousAmount,
        newAmount: numericValue,
        timestamp: Date.now()
      }]);
    }
    
    const success = await onUpdateData(periodId, lineItemId, numericValue);
    
    if (success) {
      setEditingCell(null);
    }
    setSavingCell(null);
  };

  // Undo last change
  const handleUndo = useCallback(async () => {
    if (undoHistory.length === 0) return;
    
    const lastChange = undoHistory[undoHistory.length - 1];
    setUndoHistory(prev => prev.slice(0, -1));
    
    const success = await onUpdateData(lastChange.periodId, lastChange.lineItemId, lastChange.previousAmount);
    if (success) {
      toast.success('Change undone', {
        description: `Reverted to $${formatCurrencyInputValue(lastChange.previousAmount)}`,
        icon: <Undo2 className="h-4 w-4" />
      });
    }
  }, [undoHistory, onUpdateData]);

  // Navigate to adjacent cell
  const navigateToCell = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'tab' | 'shift-tab') => {
    if (!selectedCell) return;
    
    let newRowIndex = selectedCell.rowIndex;
    let newColIndex = selectedCell.colIndex;
    
    switch (direction) {
      case 'up':
        newRowIndex = Math.max(0, selectedCell.rowIndex - 1);
        break;
      case 'down':
        newRowIndex = Math.min(flatLineItems.length - 1, selectedCell.rowIndex + 1);
        break;
      case 'left':
        newColIndex = Math.max(0, selectedCell.colIndex - 1);
        break;
      case 'right':
      case 'tab':
        if (selectedCell.colIndex < existingPeriodColumns.length - 1) {
          newColIndex = selectedCell.colIndex + 1;
        } else if (direction === 'tab' && selectedCell.rowIndex < flatLineItems.length - 1) {
          newColIndex = 0;
          newRowIndex = selectedCell.rowIndex + 1;
        }
        break;
      case 'shift-tab':
        if (selectedCell.colIndex > 0) {
          newColIndex = selectedCell.colIndex - 1;
        } else if (selectedCell.rowIndex > 0) {
          newColIndex = existingPeriodColumns.length - 1;
          newRowIndex = selectedCell.rowIndex - 1;
        }
        break;
    }
    
    const newLineItem = flatLineItems[newRowIndex];
    const newPeriod = existingPeriodColumns[newColIndex]?.period;
    
    if (newLineItem && newPeriod) {
      setSelectedCell({
        rowIndex: newRowIndex,
        colIndex: newColIndex,
        lineItemId: newLineItem.id,
        periodId: newPeriod.id
      });
    }
  }, [selectedCell, flatLineItems, existingPeriodColumns]);

  // Copy selected cell or range to clipboard
  const handleCopy = useCallback(() => {
    if (!selectedCell) return;
    
    const data = getDataForCell(selectedCell.periodId, selectedCell.lineItemId);
    const value = data?.amount ?? 0;
    const formattedValue = `$${formatCurrencyInputValue(value)}`;
    
    navigator.clipboard.writeText(formattedValue).then(() => {
      toast.success('Copied to clipboard', {
        description: formattedValue,
        icon: <Copy className="h-4 w-4" />
      });
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, [selectedCell, getDataForCell]);

  // Get variance vs prior period
  const getVarianceInfo = useCallback((periodId: string, lineItemId: string, currentAmount: number) => {
    const colIndex = existingPeriodColumns.findIndex(col => col.period?.id === periodId);
    if (colIndex <= 0) return null; // No prior period
    
    const priorPeriod = existingPeriodColumns[colIndex - 1]?.period;
    if (!priorPeriod) return null;
    
    const priorData = getDataForCell(priorPeriod.id, lineItemId);
    const priorAmount = priorData?.amount ?? 0;
    
    if (priorAmount === 0 && currentAmount === 0) return null;
    
    const absoluteChange = currentAmount - priorAmount;
    const percentChange = priorAmount !== 0 
      ? ((currentAmount - priorAmount) / Math.abs(priorAmount)) * 100 
      : currentAmount !== 0 ? 100 : 0;
    
    return {
      priorAmount,
      absoluteChange,
      percentChange,
      isPositive: absoluteChange > 0,
      isNegative: absoluteChange < 0,
      isZero: absoluteChange === 0
    };
  }, [existingPeriodColumns, getDataForCell]);

  // Get conditional formatting class based on value
  const getConditionalClass = useCallback((amount: number, variance: ReturnType<typeof getVarianceInfo>) => {
    const classes: string[] = [];
    
    // Base negative formatting
    if (amount < 0) {
      classes.push('text-destructive');
    }
    
    // Variance-based background tint
    if (variance) {
      if (variance.percentChange > 20) {
        classes.push('bg-success/10');
      } else if (variance.percentChange < -20) {
        classes.push('bg-destructive/10');
      } else if (variance.percentChange > 10) {
        classes.push('bg-success/5');
      } else if (variance.percentChange < -10) {
        classes.push('bg-destructive/5');
      }
    }
    
    return classes.join(' ');
  }, []);

  // Handle keyboard navigation and inline editing
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't interfere with editing mode
    if (editingCell) return;
    
    // Undo with Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
      return;
    }
    
    // Copy with Ctrl+C
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      handleCopy();
      return;
    }
    
    if (!selectedCell) return;
    
    // Navigation keys
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        navigateToCell('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateToCell('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateToCell('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateToCell('right');
        break;
      case 'Tab':
        e.preventDefault();
        navigateToCell(e.shiftKey ? 'shift-tab' : 'tab');
        break;
      case 'Enter':
        // Start editing on Enter
        e.preventDefault();
        const data = getDataForCell(selectedCell.periodId, selectedCell.lineItemId);
        handleStartEdit(selectedCell.periodId, selectedCell.lineItemId, data?.amount ?? 0);
        break;
      case 'Escape':
        setSelectedCell(null);
        break;
      default:
        // Start editing when typing a number or backspace
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          handleStartEdit(selectedCell.periodId, selectedCell.lineItemId, 0, e.key);
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          handleStartEdit(selectedCell.periodId, selectedCell.lineItemId, 0, '');
        }
        break;
    }
  }, [editingCell, selectedCell, navigateToCell, handleUndo, handleCopy, getDataForCell, handleStartEdit]);

  const handleEditKeyDown = (e: React.KeyboardEvent, periodId: string, lineItemId: string, previousAmount: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(periodId, lineItemId, previousAmount);
      // Move to next cell after save
      setTimeout(() => navigateToCell('down'), 50);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSave(periodId, lineItemId, previousAmount);
      setTimeout(() => navigateToCell(e.shiftKey ? 'shift-tab' : 'tab'), 50);
    }
  };

  const handleCreatePeriod = async (column: PeriodColumn) => {
    setCreatingPeriod(column.label);
    await onCreatePeriod(column);
    setCreatingPeriod(null);
  };

  const handleCellSelect = (lineItemId: string, periodId: string, rowIndex: number, colIndex: number) => {
    setSelectedCell({ rowIndex, colIndex, lineItemId, periodId });
  };

  // Parse clipboard data (tab-separated values)
  const parseClipboardData = (text: string): string[][] => {
    const rows = text.trim().split(/\r?\n/);
    return rows.map(row => row.split('\t'));
  };

  // Parse a cell value to a number
  const parseCellValue = (value: string): number => {
    // Remove currency symbols, commas, spaces, parentheses for negative
    let cleaned = value.replace(/[$,\s]/g, '').trim();
    
    // Handle accounting format negatives (1,000) -> -1000
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = '-' + cleaned.slice(1, -1);
    }
    
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num);
  };

  // Handle paste event
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!selectedCell || isPasting) return;
    
    const clipboardData = e.clipboardData?.getData('text');
    if (!clipboardData) return;

    e.preventDefault();
    setIsPasting(true);

    try {
      const data = parseClipboardData(clipboardData);
      const updates: { periodId: string; lineItemId: string; amount: number }[] = [];

      for (let rowOffset = 0; rowOffset < data.length; rowOffset++) {
        const row = data[rowOffset];
        const targetRowIndex = selectedCell.rowIndex + rowOffset;
        
        if (targetRowIndex >= flatLineItems.length) break;
        const targetLineItem = flatLineItems[targetRowIndex];

        for (let colOffset = 0; colOffset < row.length; colOffset++) {
          const targetColIndex = selectedCell.colIndex + colOffset;
          
          if (targetColIndex >= existingPeriodColumns.length) break;
          const targetPeriod = existingPeriodColumns[targetColIndex].period;
          
          if (!targetPeriod) continue;

          const cellValue = row[colOffset];
          if (cellValue.trim() === '') continue;

          const amount = parseCellValue(cellValue);
          updates.push({
            periodId: targetPeriod.id,
            lineItemId: targetLineItem.id,
            amount
          });
        }
      }

      // Apply all updates
      let successCount = 0;
      for (const update of updates) {
        const success = await onUpdateData(update.periodId, update.lineItemId, update.amount);
        if (success) successCount++;
      }

      toast.success(`Pasted ${successCount} values successfully`);
    } catch (error) {
      console.error('Error pasting data:', error);
      toast.error('Failed to paste data');
    } finally {
      setIsPasting(false);
    }
  }, [selectedCell, isPasting, flatLineItems, existingPeriodColumns, onUpdateData]);

  // Handle Excel file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

      if (jsonData.length < 2) {
        toast.error('Excel file must have at least a header row and one data row');
        return;
      }

      // First row is headers (should be period labels)
      const headers = jsonData[0] as string[];
      const dataRows = jsonData.slice(1);

      // Match headers to period columns
      const headerToPeriodMap = new Map<number, PeriodColumn>();
      headers.forEach((header, index) => {
        if (index === 0) return; // Skip first column (line item names)
        
        const headerStr = String(header).trim().toLowerCase();
        const matchingPeriod = existingPeriodColumns.find(col => 
          col.label.toLowerCase().includes(headerStr) ||
          col.shortLabel.toLowerCase().includes(headerStr) ||
          headerStr.includes(col.shortLabel.toLowerCase())
        );
        
        if (matchingPeriod) {
          headerToPeriodMap.set(index, matchingPeriod);
        }
      });

      // Match line items by name
      const updates: { periodId: string; lineItemId: string; amount: number }[] = [];

      for (const row of dataRows) {
        if (!row || row.length === 0) continue;
        
        const lineItemName = String(row[0] || '').trim().toLowerCase();
        const matchingLineItem = flatLineItems.find(li => 
          li.name.toLowerCase() === lineItemName ||
          li.name.toLowerCase().includes(lineItemName) ||
          lineItemName.includes(li.name.toLowerCase())
        );

        if (!matchingLineItem) continue;

        for (let colIndex = 1; colIndex < row.length; colIndex++) {
          const period = headerToPeriodMap.get(colIndex);
          if (!period?.period) continue;

          const cellValue = String(row[colIndex] || '').trim();
          if (cellValue === '') continue;

          const amount = parseCellValue(cellValue);
          updates.push({
            periodId: period.period.id,
            lineItemId: matchingLineItem.id,
            amount
          });
        }
      }

      // Apply all updates
      let successCount = 0;
      for (const update of updates) {
        const success = await onUpdateData(update.periodId, update.lineItemId, update.amount);
        if (success) successCount++;
      }

      toast.success(`Imported ${successCount} values from Excel`);
    } catch (error) {
      console.error('Error reading Excel file:', error);
      toast.error('Failed to read Excel file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Add paste event listener
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => handlePaste(e);
    document.addEventListener('paste', handlePasteEvent);
    return () => document.removeEventListener('paste', handlePasteEvent);
  }, [handlePaste]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedLineItems = categories.map(category => ({
    category,
    items: lineItems.filter(li => li.category_id === category.id)
  }));

  // Calculate row indices for each line item
  let currentRowIndex = 0;
  const lineItemRowIndices = new Map<string, number>();
  flatLineItems.forEach((item, index) => {
    lineItemRowIndices.set(item.id, index);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  <ClipboardPaste className="h-3 w-3" />
                  <span>Tab/Arrow keys to navigate • Type to edit • Ctrl+Z to undo</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  <p><strong>Navigation:</strong> Arrow keys, Tab/Shift+Tab</p>
                  <p><strong>Edit:</strong> Type numbers directly or press Enter</p>
                  <p><strong>Undo:</strong> Ctrl+Z (Cmd+Z on Mac)</p>
                  <p><strong>Paste:</strong> Select cell, then Ctrl+V</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {undoHistory.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              className="text-xs h-7"
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || existingPeriodColumns.length === 0}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {periodColumns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No periods in selected date range.</p>
            <p className="text-sm mt-1">Adjust the date range to view financial data.</p>
          </div>
        ) : (
          <div 
            className="overflow-x-auto focus:outline-none" 
            ref={tableRef}
            tabIndex={0}
            onKeyDown={handleTableKeyDown}
          >
            {isPasting && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Pasting data...</span>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px] min-w-[200px] sticky left-0 bg-background z-10">Line Item</TableHead>
                  {periodColumns.map((col, colIndex) => (
                    <TableHead key={col.label} className="text-right min-w-[100px]">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default text-xs">{col.shortLabel}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{col.label}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedLineItems.map(({ category, items }) => (
                  <React.Fragment key={category.id}>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={periodColumns.length + 1} className="font-semibold sticky left-0 bg-muted/30 z-10">
                        {category.name}
                      </TableCell>
                    </TableRow>
                    {items.length === 0 && (
                      <TableRow key={`${category.id}-empty`}>
                        <TableCell colSpan={periodColumns.length + 1} className="text-muted-foreground text-sm italic pl-8">
                          No line items in this category
                        </TableCell>
                      </TableRow>
                    )}
                    {items.map(item => {
                      const rowIndex = lineItemRowIndices.get(item.id) ?? 0;
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="pl-8 sticky left-0 bg-background z-10 text-sm">{item.name}</TableCell>
                          {periodColumns.map((col, colIndex) => {
                            const period = col.period;
                            const periodColIndex = existingPeriodColumns.findIndex(p => p.label === col.label);
                            
                            if (!period) {
                              return (
                                <TableCell key={col.label} className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                                    onClick={() => handleCreatePeriod(col)}
                                    disabled={creatingPeriod === col.label}
                                  >
                                    {creatingPeriod === col.label ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Plus className="h-3 w-3" />
                                    )}
                                  </Button>
                                </TableCell>
                              );
                            }

                            const data = getDataForCell(period.id, item.id);
                            const cellKey = `${period.id}-${item.id}`;
                            const isEditing = editingCell === cellKey;
                            const isSaving = savingCell === cellKey;
                            const currentAmount = data?.amount ?? 0;
                            const isSelected = selectedCell?.lineItemId === item.id && 
                                              selectedCell?.periodId === period.id;
                            const variance = getVarianceInfo(period.id, item.id, currentAmount);
                            const conditionalClass = getConditionalClass(currentAmount, variance);

                            return (
                              <TableCell 
                                key={col.label} 
                                className={cn(
                                  "text-right p-0",
                                  isSelected && "ring-2 ring-primary ring-inset"
                                )}
                                onClick={() => handleCellSelect(item.id, period.id, rowIndex, periodColIndex)}
                              >
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1 p-1">
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                      <Input
                                        ref={inputRef}
                                        value={editValue}
                                        onChange={(e) => setEditValue(formatAmountWithCommas(e.target.value))}
                                        onKeyDown={(e) => handleEditKeyDown(e, period.id, item.id, currentAmount)}
                                        onBlur={() => {
                                          // Save on blur if value changed
                                          const numericValue = parseCurrencyInputValue(editValue) || 0;
                                          if (numericValue !== currentAmount) {
                                            handleSave(period.id, item.id, currentAmount);
                                          } else {
                                            setEditingCell(null);
                                          }
                                        }}
                                        className="w-20 pl-5 text-right text-xs h-7"
                                        autoFocus
                                      />
                                    </div>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => handleSave(period.id, item.id, currentAmount)}
                                      disabled={isSaving}
                                    >
                                      {isSaving ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                ) : (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          className={cn(
                                            "w-full px-2 py-1.5 text-right hover:bg-muted/50 transition-colors cursor-pointer text-xs",
                                            conditionalClass,
                                            isSelected && "bg-primary/10"
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCellSelect(item.id, period.id, rowIndex, periodColIndex);
                                          }}
                                          onDoubleClick={() => handleStartEdit(period.id, item.id, currentAmount)}
                                        >
                                          ${formatCurrencyInputValue(currentAmount)}
                                          {variance && variance.percentChange !== 0 && (
                                            <span className={cn(
                                              "ml-1 inline-flex items-center",
                                              variance.isPositive ? "text-success" : "text-destructive"
                                            )}>
                                              {variance.isPositive ? (
                                                <TrendingUp className="h-2.5 w-2.5" />
                                              ) : (
                                                <TrendingDown className="h-2.5 w-2.5" />
                                              )}
                                            </span>
                                          )}
                                        </button>
                                      </TooltipTrigger>
                                      {variance && (
                                        <TooltipContent side="top" className="text-xs">
                                          <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-4">
                                              <span className="text-muted-foreground">Prior Period:</span>
                                              <span>${formatCurrencyInputValue(variance.priorAmount)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                              <span className="text-muted-foreground">Change:</span>
                                              <span className={cn(
                                                variance.isPositive && "text-success",
                                                variance.isNegative && "text-destructive"
                                              )}>
                                                {variance.isPositive ? '+' : ''}${formatCurrencyInputValue(variance.absoluteChange)}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4 border-t pt-1">
                                              <span className="text-muted-foreground">% Change:</span>
                                              <span className={cn(
                                                "font-medium",
                                                variance.isPositive && "text-success",
                                                variance.isNegative && "text-destructive"
                                              )}>
                                                {variance.isPositive ? '+' : ''}{variance.percentChange.toFixed(1)}%
                                              </span>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
