import { useState, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import { parseExcelFromBuffer, parseExcelFromFile, ParsedSheet, workbookToBlob } from '@/lib/excelUtils';

export interface CellSelection {
  row: number;
  col: number;
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
  align?: 'left' | 'center' | 'right';
  numberFormat?: string;
  borderBottom?: boolean;
  borderTop?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
}

export interface SpreadsheetWorkbook {
  id: string;
  name: string;
  sheets: SpreadsheetSheet[];
  activeSheetIndex: number;
  rawWorkbook: ExcelJS.Workbook | null;
  isDirty: boolean;
  source: 'platform' | 'uploaded' | 'new';
}

export interface SpreadsheetSheet extends ParsedSheet {
  formats: Record<string, CellFormat>; // key: "row-col"
  frozenRows?: number;
  frozenCols?: number;
}

export interface UndoEntry {
  sheetIndex: number;
  row: number;
  col: number;
  oldValue: string | number | null;
  newValue: string | number | null;
}

const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;

function createEmptySheet(name: string): SpreadsheetSheet {
  const data: (string | number | null)[][] = Array.from({ length: DEFAULT_ROWS }, () =>
    Array(DEFAULT_COLS).fill(null)
  );
  return {
    name,
    data,
    colWidths: Array(DEFAULT_COLS).fill(100),
    formats: {},
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

export function useSpreadsheetWorkbook() {
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellSelection>({ row: 0, col: 0 });
  const [selectionRange, setSelectionRange] = useState<CellRange | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  // Create a new empty workbook
  const createNewWorkbook = useCallback((name: string = 'Untitled Workbook') => {
    const wb: SpreadsheetWorkbook = {
      id: generateId(),
      name,
      sheets: [createEmptySheet('Sheet1')],
      activeSheetIndex: 0,
      rawWorkbook: null,
      isDirty: false,
      source: 'new',
    };
    setWorkbook(wb);
    setSelectedCell({ row: 0, col: 0 });
    setSelectionRange(null);
    undoStack.current = [];
    redoStack.current = [];
    return wb;
  }, []);

  // Import from file
  const importFromFile = useCallback(async (file: File) => {
    try {
      const result = await parseExcelFromFile(file);
      const sheets: SpreadsheetSheet[] = result.sheets.map(s => ({
        ...s,
        formats: {},
        // Ensure minimum grid size
        data: ensureMinSize(s.data, DEFAULT_ROWS, DEFAULT_COLS),
        colWidths: s.colWidths.length < DEFAULT_COLS 
          ? [...s.colWidths, ...Array(DEFAULT_COLS - s.colWidths.length).fill(100)]
          : s.colWidths,
      }));

      const wb: SpreadsheetWorkbook = {
        id: generateId(),
        name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
        sheets,
        activeSheetIndex: 0,
        rawWorkbook: result.workbook,
        isDirty: false,
        source: 'uploaded',
      };
      setWorkbook(wb);
      setSelectedCell({ row: 0, col: 0 });
      setSelectionRange(null);
      undoStack.current = [];
      redoStack.current = [];
      return wb;
    } catch (err) {
      console.error('Failed to import file:', err);
      throw err;
    }
  }, []);

  // Import from URL
  const importFromUrl = useCallback(async (url: string, fileName: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch file');
    const buffer = await response.arrayBuffer();
    const result = await parseExcelFromBuffer(buffer);
    
    const sheets: SpreadsheetSheet[] = result.sheets.map(s => ({
      ...s,
      formats: {},
      data: ensureMinSize(s.data, DEFAULT_ROWS, DEFAULT_COLS),
      colWidths: s.colWidths.length < DEFAULT_COLS
        ? [...s.colWidths, ...Array(DEFAULT_COLS - s.colWidths.length).fill(100)]
        : s.colWidths,
    }));

    const wb: SpreadsheetWorkbook = {
      id: generateId(),
      name: fileName.replace(/\.(xlsx|xls|csv)$/i, ''),
      sheets,
      activeSheetIndex: 0,
      rawWorkbook: result.workbook,
      isDirty: false,
      source: 'uploaded',
    };
    setWorkbook(wb);
    setSelectedCell({ row: 0, col: 0 });
    setSelectionRange(null);
    return wb;
  }, []);

  // Cell operations
  const setCellValue = useCallback((row: number, col: number, value: string | number | null) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const oldValue = sheet.data[row]?.[col] ?? null;
      
      undoStack.current.push({ sheetIndex: prev.activeSheetIndex, row, col, oldValue, newValue: value });
      redoStack.current = [];

      const newData = [...sheet.data];
      if (!newData[row]) newData[row] = Array(DEFAULT_COLS).fill(null);
      newData[row] = [...newData[row]];
      newData[row][col] = value;

      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, data: newData };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  const getCellValue = useCallback((row: number, col: number): string | number | null => {
    if (!workbook) return null;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    return sheet.data[row]?.[col] ?? null;
  }, [workbook]);

  // Format operations
  const setCellFormat = useCallback((row: number, col: number, format: Partial<CellFormat>) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const key = `${row}-${col}`;
      const existing = sheet.formats[key] || {};
      const newFormats = { ...sheet.formats, [key]: { ...existing, ...format } };
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, formats: newFormats };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  const applyFormatToSelection = useCallback((format: Partial<CellFormat>) => {
    if (!workbook) return;
    const range = selectionRange || { startRow: selectedCell.row, startCol: selectedCell.col, endRow: selectedCell.row, endCol: selectedCell.col };
    
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const newFormats = { ...sheet.formats };
      
      for (let r = Math.min(range.startRow, range.endRow); r <= Math.max(range.startRow, range.endRow); r++) {
        for (let c = Math.min(range.startCol, range.endCol); c <= Math.max(range.startCol, range.endCol); c++) {
          const key = `${r}-${c}`;
          newFormats[key] = { ...(newFormats[key] || {}), ...format };
        }
      }
      
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, formats: newFormats };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, [workbook, selectedCell, selectionRange]);

  const getCellFormat = useCallback((row: number, col: number): CellFormat => {
    if (!workbook) return {};
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    return sheet.formats[`${row}-${col}`] || {};
  }, [workbook]);

  // Undo/Redo
  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    
    redoStack.current.push(entry);
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[entry.sheetIndex];
      const newData = [...sheet.data];
      if (!newData[entry.row]) newData[entry.row] = Array(DEFAULT_COLS).fill(null);
      newData[entry.row] = [...newData[entry.row]];
      newData[entry.row][entry.col] = entry.oldValue;
      const newSheets = [...prev.sheets];
      newSheets[entry.sheetIndex] = { ...sheet, data: newData };
      return { ...prev, sheets: newSheets };
    });
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    
    undoStack.current.push(entry);
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[entry.sheetIndex];
      const newData = [...sheet.data];
      if (!newData[entry.row]) newData[entry.row] = Array(DEFAULT_COLS).fill(null);
      newData[entry.row] = [...newData[entry.row]];
      newData[entry.row][entry.col] = entry.newValue;
      const newSheets = [...prev.sheets];
      newSheets[entry.sheetIndex] = { ...sheet, data: newData };
      return { ...prev, sheets: newSheets };
    });
  }, []);

  // Sheet operations
  const setActiveSheet = useCallback((index: number) => {
    setWorkbook(prev => prev ? { ...prev, activeSheetIndex: index } : prev);
    setSelectedCell({ row: 0, col: 0 });
    setSelectionRange(null);
  }, []);

  const addSheet = useCallback((name?: string) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheetName = name || `Sheet${prev.sheets.length + 1}`;
      return {
        ...prev,
        sheets: [...prev.sheets, createEmptySheet(sheetName)],
        activeSheetIndex: prev.sheets.length,
        isDirty: true,
      };
    });
  }, []);

  const renameSheet = useCallback((index: number, name: string) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const newSheets = [...prev.sheets];
      newSheets[index] = { ...newSheets[index], name };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  const deleteSheet = useCallback((index: number) => {
    setWorkbook(prev => {
      if (!prev || prev.sheets.length <= 1) return prev;
      const newSheets = prev.sheets.filter((_, i) => i !== index);
      const newActive = Math.min(prev.activeSheetIndex, newSheets.length - 1);
      return { ...prev, sheets: newSheets, activeSheetIndex: newActive, isDirty: true };
    });
  }, []);

  const duplicateSheet = useCallback((index: number) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const source = prev.sheets[index];
      const newSheet: SpreadsheetSheet = {
        ...source,
        name: `${source.name} (Copy)`,
        data: source.data.map(row => [...row]),
        colWidths: [...source.colWidths],
        formats: { ...source.formats },
      };
      const newSheets = [...prev.sheets];
      newSheets.splice(index + 1, 0, newSheet);
      return { ...prev, sheets: newSheets, activeSheetIndex: index + 1, isDirty: true };
    });
  }, []);

  // Export
  const exportToXlsx = useCallback(async () => {
    if (!workbook) return;
    
    const wb = new ExcelJS.Workbook();
    workbook.sheets.forEach(sheet => {
      const ws = wb.addWorksheet(sheet.name);
      sheet.data.forEach((row, rowIndex) => {
        const excelRow = ws.getRow(rowIndex + 1);
        row.forEach((cell, colIndex) => {
          if (cell !== null && cell !== undefined) {
            const excelCell = excelRow.getCell(colIndex + 1);
            excelCell.value = cell;
            
            // Apply formats
            const fmt = sheet.formats[`${rowIndex}-${colIndex}`];
            if (fmt) {
              if (fmt.bold || fmt.italic || fmt.underline) {
                excelCell.font = {
                  bold: fmt.bold,
                  italic: fmt.italic,
                  underline: fmt.underline ? true : undefined,
                };
              }
              if (fmt.align) {
                excelCell.alignment = { horizontal: fmt.align };
              }
              if (fmt.numberFormat) {
                excelCell.numFmt = fmt.numberFormat;
              }
            }
          }
        });
        excelRow.commit();
      });
    });

    const blob = await workbookToBlob(wb);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workbook.name}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workbook]);

  const exportToCsv = useCallback(() => {
    if (!workbook) return;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    const csv = sheet.data
      .map(row => row.map(cell => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(','))
      .join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workbook.name} - ${sheet.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workbook]);

  // Column/row operations
  const setColumnWidth = useCallback((col: number, width: number) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const newWidths = [...sheet.colWidths];
      newWidths[col] = width;
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, colWidths: newWidths };
      return { ...prev, sheets: newSheets };
    });
  }, []);

  const insertRow = useCallback((afterRow: number) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const newRow = Array(Math.max(...sheet.data.map(r => r.length), DEFAULT_COLS)).fill(null);
      const newData = [...sheet.data];
      newData.splice(afterRow + 1, 0, newRow);
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, data: newData };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  const insertColumn = useCallback((afterCol: number) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const newData = sheet.data.map(row => {
        const r = [...row];
        r.splice(afterCol + 1, 0, null);
        return r;
      });
      const newWidths = [...sheet.colWidths];
      newWidths.splice(afterCol + 1, 0, 100);
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, data: newData, colWidths: newWidths };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  const deleteRow = useCallback((row: number) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const newData = sheet.data.filter((_, i) => i !== row);
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, data: newData };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  const deleteColumn = useCallback((col: number) => {
    setWorkbook(prev => {
      if (!prev) return prev;
      const sheet = prev.sheets[prev.activeSheetIndex];
      const newData = sheet.data.map(row => row.filter((_, i) => i !== col));
      const newWidths = sheet.colWidths.filter((_, i) => i !== col);
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheetIndex] = { ...sheet, data: newData, colWidths: newWidths };
      return { ...prev, sheets: newSheets, isDirty: true };
    });
  }, []);

  // Get active sheet
  const activeSheet = workbook?.sheets[workbook.activeSheetIndex] ?? null;

  return {
    workbook,
    activeSheet,
    selectedCell,
    selectionRange,
    setSelectedCell,
    setSelectionRange,
    createNewWorkbook,
    importFromFile,
    importFromUrl,
    setCellValue,
    getCellValue,
    setCellFormat,
    getCellFormat,
    applyFormatToSelection,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    setActiveSheet,
    addSheet,
    renameSheet,
    deleteSheet,
    duplicateSheet,
    exportToXlsx,
    exportToCsv,
    setColumnWidth,
    insertRow,
    insertColumn,
    deleteRow,
    deleteColumn,
  };
}

function ensureMinSize(data: (string | number | null)[][], minRows: number, minCols: number): (string | number | null)[][] {
  const result = data.map(row => {
    if (row.length < minCols) {
      return [...row, ...Array(minCols - row.length).fill(null)];
    }
    return row;
  });
  while (result.length < minRows) {
    result.push(Array(minCols).fill(null));
  }
  return result;
}
