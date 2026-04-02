import { useState, useCallback, useRef, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './mapping-theme.css';
import type { SaaSModelData, SaaSModelSettings as SaaSModelSettingsType } from './types';
import { IS_FIELDS, BS_FIELDS, FieldMapping, MappingFieldName, FileAnalysisResult } from './types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X, ChevronRight, RefreshCw, ArrowLeft, CheckCircle2, Sparkles, Loader2, Settings, Trash2, ChevronDown, Save, Zap, ShieldAlert, Info, Columns, Maximize2, Download, Wand2, GripVertical, Undo2, Redo2, HelpCircle, Keyboard, PlusCircle, ZoomIn, ZoomOut, EyeOff, Eye, Filter, Eraser, ArrowUpDown, PanelRightOpen, PanelRightClose, Calendar } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { parseExcelFromFile, ParsedSheet } from '@/lib/excelUtils';
import { ExcelViewer } from '@/components/deal/ExcelViewer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { formatUSD, extractAmount } from '@/lib/formatters/currency';
import { useMappingSuggestions } from '@/hooks/useMappingSuggestions';
import { supabase } from '@/integrations/supabase/client';
import { DataMappingFieldSidebar, type FieldSidebarHandle } from './DataMappingFieldSidebar';
import { useMappingHistory, type MappingAction } from './useMappingHistory';
import { MappingFieldSettings } from './MappingFieldSettings';
import {
  type Phase, type AnalyzedFile, type AutoMapResult, type ValidationWarning,
  KEYWORD_ALIASES, getMatchConfidence, applyMappingsToModel,
  formatCellValue, isNumericCell, detectHeaderRow, extractColumnHeaders,
  validateDateSequence, type DateWarning, detectFirstMonthFromHeaders,
  extractMappedDataRows,
} from './dataMappingUtils';
import { useFinancialFiles, type FinancialFileRecord } from '@/hooks/useFinancialFiles';

interface Props {
  dealId: string;
  model: SaaSModelData;
  updateModel: (updater: (prev: SaaSModelData) => SaaSModelData) => void;
  recalculate: () => void;
}

export interface DataMappingHandle {
  hasUnsavedChanges: () => boolean;
  saveProgress: () => Promise<void>;
  getUnsavedCount: () => number;
}

export const SaaSModelDataMapping = forwardRef<DataMappingHandle, Props>(function SaaSModelDataMapping({ dealId, model, updateModel, recalculate }, ref) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AnalyzedFile | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMapping[]>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<SaaSModelSettingsType>({ ...model.settings });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [autoMapResults, setAutoMapResults] = useState<AutoMapResult[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);
  const [showValidation, setShowValidation] = useState(true);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [expandedFileUrl, setExpandedFileUrl] = useState<string | null>(null);
  const [showExpandedSidebar, setShowExpandedSidebar] = useState(false);
  const [isRestoringMappings, setIsRestoringMappings] = useState(false);
  const [flashedRows, setFlashedRows] = useState<Set<number>>(new Set());
  const [flashedFields, setFlashedFields] = useState<Set<string>>(new Set());
  const [pendingAutoMaps, setPendingAutoMaps] = useState<Record<string, { rowIdx: number; label: string; sheetName: string }>>({});
  const [draggingRowIdx, setDraggingRowIdx] = useState<number | null>(null);
  const lastClickedRowRef = useRef<number | null>(null);
  const sidebarRef = useRef<FieldSidebarHandle>(null);
  const spreadsheetRef = useRef<HTMLDivElement>(null);
  const { canUndo, canRedo, pushAction, popUndo, popRedo, peekUndo, peekRedo } = useMappingHistory();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storedFilePathRef = useRef<string | null>(null);
  const isRestoringRef = useRef(false);

  // ── Field visibility settings ──
  const allFieldNames = useMemo(() => new Set([...IS_FIELDS, ...BS_FIELDS] as string[]), []);
  const [enabledFields, setEnabledFields] = useState<Set<string>>(() => new Set(allFieldNames));
  const [fieldSettingsOpen, setFieldSettingsOpen] = useState(false);
  const enabledFieldsLoadedRef = useRef(false);

  // ── Multi-file management ──
  const { files: dbFiles, upsertFile, saveFileMappings, pushFileData, deleteFile: deleteDbFile, loadFiles: reloadDbFiles } = useFinancialFiles(dealId);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // ── Start date detection & override ──
  const [modelStartDate, setModelStartDate] = useState<{ month: number; year: number } | null>(null);
  const [startDateConfirmed, setStartDateConfirmed] = useState(false);
  // ── Batch 2: Column Exclude state ──
  const [excludedColumns, setExcludedColumns] = useState<Set<number>>(new Set());
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [columnSelectStart, setColumnSelectStart] = useState<number | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(new Set());

  // ── Batch 2: Flip ± state ──
  const [flippedRows, setFlippedRows] = useState<Set<number>>(new Set());
  const [flippedColumns, setFlippedColumns] = useState<Set<number>>(new Set());

  // ── Sign-flip mode state ──
  const [signFlipMode, setSignFlipMode] = useState(false);
  const [signFlipSelectedRows, setSignFlipSelectedRows] = useState<Set<number>>(new Set());
  const [signFlipSelectedCols, setSignFlipSelectedCols] = useState<Set<number>>(new Set());

  // ── Batch 2: Zoom state ──
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try { const z = localStorage.getItem('data-mapping-zoom'); return z ? Number(z) : 100; } catch { return 100; }
  });
  useEffect(() => {
    try { localStorage.setItem('data-mapping-zoom', String(zoomLevel)); } catch {}
  }, [zoomLevel]);

  const handleZoomIn = useCallback(() => setZoomLevel(z => Math.min(200, z + 10)), []);
  const handleZoomOut = useCallback(() => setZoomLevel(z => Math.max(50, z - 10)), []);

  // ── Eraser mode state ──
  const [eraserMode, setEraserMode] = useState(false);
  const [eraserSelectedRows, setEraserSelectedRows] = useState<Set<number>>(new Set());
  const [eraserSelectedCols, setEraserSelectedCols] = useState<Set<number>>(new Set());

  const handleToggleEraser = useCallback(() => {
    setEraserMode(prev => {
      if (prev) {
        setEraserSelectedRows(new Set());
        setEraserSelectedCols(new Set());
      } else {
        // Exit sign-flip mode when entering eraser
        setSignFlipMode(false);
        setSignFlipSelectedRows(new Set());
        setSignFlipSelectedCols(new Set());
      }
      return !prev;
    });
  }, []);

  const handleEraserRowClick = useCallback((rowIdx: number, e: React.MouseEvent) => {
    setEraserSelectedRows(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const existing = Array.from(prev);
        const last = existing[existing.length - 1];
        const start = Math.min(last, rowIdx);
        const end = Math.max(last, rowIdx);
        for (let i = start; i <= end; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx);
      } else {
        if (next.has(rowIdx) && next.size === 1) next.clear();
        else { next.clear(); next.add(rowIdx); }
      }
      return next;
    });
  }, []);

  const handleEraserColClick = useCallback((colIdx: number, e: React.MouseEvent) => {
    setEraserSelectedCols(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const existing = Array.from(prev);
        const last = existing[existing.length - 1];
        const start = Math.min(last, colIdx);
        const end = Math.max(last, colIdx);
        for (let i = start; i <= end; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(colIdx)) next.delete(colIdx); else next.add(colIdx);
      } else {
        if (next.has(colIdx) && next.size === 1) next.clear();
        else { next.clear(); next.add(colIdx); }
      }
      return next;
    });
  }, []);

  const handleEraserDelete = useCallback(() => {
    if (!selectedFile) return;
    const sheet = selectedFile.sheets[activeSheet];
    if (!sheet) return;

    const rowsToDelete = eraserSelectedRows;
    const colsToDelete = eraserSelectedCols;

    if (rowsToDelete.size === 0 && colsToDelete.size === 0) return;

    // Build new data by filtering rows and columns
    let newData = sheet.data.map(row => [...row]);

    // Remove rows (filter by index)
    if (rowsToDelete.size > 0) {
      newData = newData.filter((_, i) => !rowsToDelete.has(i));
    }

    // Remove columns (filter each row)
    if (colsToDelete.size > 0) {
      newData = newData.map(row => row.filter((_, ci) => !colsToDelete.has(ci)));
    }

    // Update the sheet data in-place
    const updatedSheets = selectedFile.sheets.map((s, i) => {
      if (i !== activeSheet) return s;
      return { ...s, data: newData };
    });

    const updatedFile = { ...selectedFile, sheets: updatedSheets };
    setSelectedFile(updatedFile);
    setAnalyzedFiles(prev => prev.map(f => f === selectedFile ? updatedFile : f));

    // Fix field mappings: adjust row indices after row deletion
    if (rowsToDelete.size > 0) {
      const sortedDeletedRows = Array.from(rowsToDelete).sort((a, b) => a - b);
      setFieldMappings(prev => {
        const next: Record<string, FieldMapping[]> = {};
        for (const [field, maps] of Object.entries(prev)) {
          const adjusted = maps
            .filter(m => m.sheet !== sheet.name || !rowsToDelete.has(m.rowIdx))
            .map(m => {
              if (m.sheet !== sheet.name) return m;
              // Count how many deleted rows are before this row
              const offset = sortedDeletedRows.filter(d => d < m.rowIdx).length;
              return { ...m, rowIdx: m.rowIdx - offset };
            });
          if (adjusted.length > 0) next[field] = adjusted;
        }
        return next;
      });
    }

    // Fix flipped rows similarly
    if (rowsToDelete.size > 0) {
      const sortedDeletedRows = Array.from(rowsToDelete).sort((a, b) => a - b);
      setFlippedRows(prev => {
        const next = new Set<number>();
        for (const r of prev) {
          if (rowsToDelete.has(r)) continue;
          const offset = sortedDeletedRows.filter(d => d < r).length;
          next.add(r - offset);
        }
        return next;
      });
    }

    // Fix excluded columns similarly  
    if (colsToDelete.size > 0) {
      const sortedDeletedCols = Array.from(colsToDelete).sort((a, b) => a - b);
      setExcludedColumns(prev => {
        const next = new Set<number>();
        for (const c of prev) {
          if (colsToDelete.has(c)) continue;
          const offset = sortedDeletedCols.filter(d => d < c).length;
          next.add(c - offset);
        }
        return next;
      });
    }

    // Fix flipped columns similarly
    if (colsToDelete.size > 0) {
      const sortedDeletedCols2 = Array.from(colsToDelete).sort((a, b) => a - b);
      setFlippedColumns(prev => {
        const next = new Set<number>();
        for (const c of prev) {
          if (colsToDelete.has(c)) continue;
          const offset = sortedDeletedCols2.filter(d => d < c).length;
          next.add(c - offset);
        }
        return next;
      });
    }

    const totalRemoved = rowsToDelete.size + colsToDelete.size;
    toast.success(`Removed ${rowsToDelete.size > 0 ? `${rowsToDelete.size} row${rowsToDelete.size > 1 ? 's' : ''}` : ''}${rowsToDelete.size > 0 && colsToDelete.size > 0 ? ' and ' : ''}${colsToDelete.size > 0 ? `${colsToDelete.size} column${colsToDelete.size > 1 ? 's' : ''}` : ''}`);

    // Clear eraser selections
    setEraserSelectedRows(new Set());
    setEraserSelectedCols(new Set());
    setSelectedRows(new Set());
  }, [selectedFile, activeSheet, eraserSelectedRows, eraserSelectedCols]);

  // Column header click with shift/ctrl for multi-select
  const handleColumnHeaderClick = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && columnSelectStart !== null) {
      const start = Math.min(columnSelectStart, colIdx);
      const end = Math.max(columnSelectStart, colIdx);
      setSelectedColumns(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(i);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedColumns(prev => {
        const next = new Set(prev);
        if (next.has(colIdx)) next.delete(colIdx); else next.add(colIdx);
        return next;
      });
      setColumnSelectStart(colIdx);
    } else {
      setSelectedColumns(new Set([colIdx]));
      setColumnSelectStart(colIdx);
    }
  }, [columnSelectStart]);

  const handleExcludeColumns = useCallback((cols: number[]) => {
    setExcludedColumns(prev => {
      const next = new Set(prev);
      cols.forEach(c => next.add(c));
      return next;
    });
    setSelectedColumns(new Set());
    toast.info(`Excluded ${cols.length} column${cols.length > 1 ? 's' : ''}`);
  }, []);

  const handleRestoreColumn = useCallback((colIdx: number) => {
    setExcludedColumns(prev => {
      const next = new Set(prev);
      next.delete(colIdx);
      return next;
    });
  }, []);

  const handleRestoreAllColumns = useCallback(() => {
    setExcludedColumns(new Set());
    toast.info('All columns restored');
  }, []);

  // Flip rows toggle
  const handleFlipRows = useCallback((rowIndices: number[]) => {
    setFlippedRows(prev => {
      const next = new Set(prev);
      rowIndices.forEach(r => {
        if (next.has(r)) next.delete(r); else next.add(r);
      });
      return next;
    });
    toast.info(`Toggled ± sign on ${rowIndices.length} row${rowIndices.length > 1 ? 's' : ''}`);
  }, []);

  // Flip columns toggle
  const handleFlipColumns = useCallback((colIndices: number[]) => {
    setFlippedColumns(prev => {
      const next = new Set(prev);
      colIndices.forEach(c => {
        if (next.has(c)) next.delete(c); else next.add(c);
      });
      return next;
    });
    toast.info(`Toggled ± sign on ${colIndices.length} column${colIndices.length > 1 ? 's' : ''}`);
  }, []);

  // Sign-flip mode toggle
  const handleToggleSignFlip = useCallback(() => {
    setSignFlipMode(prev => {
      if (prev) {
        setSignFlipSelectedRows(new Set());
        setSignFlipSelectedCols(new Set());
      } else {
        // Exit eraser mode when entering sign-flip
        setEraserMode(false);
        setEraserSelectedRows(new Set());
        setEraserSelectedCols(new Set());
      }
      return !prev;
    });
  }, []);

  const handleSignFlipRowClick = useCallback((rowIdx: number, e: React.MouseEvent) => {
    setSignFlipSelectedRows(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const last = Array.from(prev).pop()!;
        const start = Math.min(last, rowIdx);
        const end = Math.max(last, rowIdx);
        for (let i = start; i <= end; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx);
      } else {
        if (next.has(rowIdx) && next.size === 1) next.clear();
        else { next.clear(); next.add(rowIdx); }
      }
      return next;
    });
  }, []);

  const handleSignFlipColClick = useCallback((colIdx: number, e: React.MouseEvent) => {
    setSignFlipSelectedCols(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const last = Array.from(prev).pop()!;
        const start = Math.min(last, colIdx);
        const end = Math.max(last, colIdx);
        for (let i = start; i <= end; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(colIdx)) next.delete(colIdx); else next.add(colIdx);
      } else {
        if (next.has(colIdx) && next.size === 1) next.clear();
        else { next.clear(); next.add(colIdx); }
      }
      return next;
    });
  }, []);

  const handleApplySignFlip = useCallback(() => {
    if (signFlipSelectedRows.size > 0) handleFlipRows(Array.from(signFlipSelectedRows));
    if (signFlipSelectedCols.size > 0) handleFlipColumns(Array.from(signFlipSelectedCols));
    setSignFlipSelectedRows(new Set());
    setSignFlipSelectedCols(new Set());
  }, [signFlipSelectedRows, signFlipSelectedCols, handleFlipRows, handleFlipColumns]);

  // Computed unsaved state (used by hooks below — must be before any early returns)
  const mappedCount = Object.keys(fieldMappings).length;
  const hasUnsavedMappings = mappedCount > lastSavedCount;

  // Expose imperative handle for parent navigation guard
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => mappedCount > lastSavedCount,
    saveProgress: async () => { await handleSaveProgressRef.current?.(); },
    getUnsavedCount: () => Math.max(0, mappedCount - lastSavedCount),
  }), [mappedCount, lastSavedCount]);
  const handleSaveProgressRef = useRef<(() => Promise<void>) | null>(null);

  // Debounced auto-save of mappings to DB (fires on every mapping change)
  const autoSaveMappings = useCallback(async (mappings: Record<string, FieldMapping[]>, file: AnalyzedFile | null) => {
    if (isRestoringRef.current) return; // Don't save while restoring
    const count = Object.keys(mappings).length;
    if (count === 0 && !storedFilePathRef.current) return;
    try {
      await supabase.from('deal_saas_mappings' as any).upsert({
        deal_id: dealId,
        field_mappings: mappings,
        file_name: file?.file.name || null,
        file_size: file?.file.size || null,
        file_storage_path: storedFilePathRef.current,
        analysis_result: file?.analysis || null,
        mapped_at: new Date().toISOString(),
        excluded_columns: Array.from(excludedColumns),
        flipped_rows: Array.from(flippedRows),
        flipped_columns: Array.from(flippedColumns),
        enabled_fields: Array.from(enabledFields),
      }, { onConflict: 'deal_id' });
      setLastSavedCount(count);
    } catch (err) {
      console.warn('Auto-save mappings failed:', err);
    }
  }, [dealId, excludedColumns, flippedRows, flippedColumns, enabledFields]);

  // Watch fieldMappings/excludedColumns/flippedRows/flippedColumns changes and auto-save with debounce
  useEffect(() => {
    if (isRestoringRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      autoSaveMappings(fieldMappings, selectedFile);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [fieldMappings, selectedFile, autoSaveMappings, excludedColumns, flippedRows, flippedColumns, enabledFields]);

  // Browser beforeunload guard
  useEffect(() => {
    if (!hasUnsavedMappings) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedMappings]);

  // Restore saved mappings and file from DB on mount
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      isRestoringRef.current = true;
      try {
        const { data } = await supabase
          .from('deal_saas_mappings' as any)
          .select('*')
          .eq('deal_id', dealId)
          .order('mapped_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data || cancelled) { isRestoringRef.current = false; return; }
        const saved = data as any;

        // Restore file from storage if path exists
        if (saved.file_storage_path) {
          storedFilePathRef.current = saved.file_storage_path;
          setIsRestoringMappings(true);
          try {
            const { data: fileData } = await supabase.storage.from('deal-files').download(saved.file_storage_path);
            if (fileData && !cancelled) {
              const file = new File([fileData], saved.file_name || 'restored.xlsx', {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              });
              const result = await parseExcelFromFile(file);
              const analysisResult = saved.analysis_result || { status: 'mappable', type: 'Unknown', totalMatches: 0, isMatches: 0, bsMatches: 0, matchedFields: [] };
              const restored: AnalyzedFile = { file, sheets: result.sheets, analysis: analysisResult };
              setSelectedFile(restored);
              setAnalyzedFiles([restored]);
              setPhase('mapping');
            }
          } catch (err) {
            console.warn('Could not restore uploaded file from storage:', err);
          } finally {
            if (!cancelled) setIsRestoringMappings(false);
          }
        }

        // Restore mappings
        if (saved.field_mappings && typeof saved.field_mappings === 'object' && !cancelled) {
          const restoredMappings = saved.field_mappings as Record<string, FieldMapping[]>;
          const mappingCount = Object.keys(restoredMappings).length;
          if (mappingCount > 0) {
            setFieldMappings(restoredMappings);
            setLastSavedCount(mappingCount);
            if (!saved.file_storage_path) {
              // No file to restore but mappings exist — unusual state
            }
          }
        }
        // Restore excluded columns and flipped rows
        if (Array.isArray(saved.excluded_columns) && !cancelled) {
          setExcludedColumns(new Set(saved.excluded_columns));
        }
        if (Array.isArray(saved.flipped_rows) && !cancelled) {
          setFlippedRows(new Set(saved.flipped_rows));
        }
        if (Array.isArray((saved as any).flipped_columns) && !cancelled) {
          setFlippedColumns(new Set((saved as any).flipped_columns));
        }
        if (Array.isArray((saved as any).enabled_fields) && !cancelled) {
          setEnabledFields(new Set((saved as any).enabled_fields as string[]));
          enabledFieldsLoadedRef.current = true;
        }
      } catch (err) {
        console.warn('Could not restore saved mappings:', err);
      } finally {
        if (!cancelled) {
          // Delay clearing the restoring flag so the auto-save effect doesn't fire immediately
          setTimeout(() => { isRestoringRef.current = false; }, 500);
        }
      }
    }
    restore();
    return () => {
      cancelled = true;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [dealId]);

  // Restore all multi-file records from deal_financial_files on mount
  useEffect(() => {
    if (dbFiles.length === 0 || analyzedFiles.length > 0) return;
    let cancelled = false;
    async function restoreMultiFiles() {
      const filesWithStorage = dbFiles.filter(f => f.storage_path);
      if (filesWithStorage.length === 0) return;
      const restored: AnalyzedFile[] = [];
      for (const dbFile of filesWithStorage) {
        try {
          const { data: fileData } = await supabase.storage.from('deal-files').download(dbFile.storage_path!);
          if (!fileData || cancelled) continue;
          const file = new File([fileData], dbFile.file_name, {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          const result = await parseExcelFromFile(file);
          const analysis = dbFile.analysis_result || { status: 'mappable' as const, type: 'Unknown', totalMatches: 0, isMatches: 0, bsMatches: 0, matchedFields: [] };
          const af: AnalyzedFile = { file, sheets: result.sheets, analysis };
          (af as any)._dbFileId = dbFile.id;
          restored.push(af);
        } catch (err) {
          console.warn(`Could not restore file ${dbFile.file_name} from storage:`, err);
        }
      }
      if (cancelled || restored.length === 0) return;
      setAnalyzedFiles(restored);
      // If single file, auto-select it and go to mapping phase
      if (restored.length === 1) {
        setSelectedFile(restored[0]);
        setActiveFileId((restored[0] as any)._dbFileId);
        const dbFile = filesWithStorage[0];
        if (dbFile.field_mappings && Object.keys(dbFile.field_mappings).length > 0) {
          setFieldMappings(dbFile.field_mappings as Record<string, FieldMapping[]>);
          setExcludedColumns(new Set(dbFile.excluded_columns || []));
          setFlippedRows(new Set(dbFile.flipped_rows || []));
          setFlippedColumns(new Set(dbFile.flipped_columns || []));
          setLastSavedCount(Object.keys(dbFile.field_mappings).length);
        }
        setPhase('mapping');
      } else {
        setPhase('triage');
      }
    }
    restoreMultiFiles();
    return () => { cancelled = true; };
  }, [dbFiles]);

  // Header detection
  const detectedHeaders = useMemo(() => {
    if (!selectedFile) return { headerRow: null, headers: [] as string[] };
    const sheet = selectedFile.sheets[activeSheet];
    if (!sheet) return { headerRow: null, headers: [] as string[] };
    const headerRow = detectHeaderRow(sheet.data);
    const headers = headerRow !== null ? extractColumnHeaders(sheet.data, headerRow) : [];
    return { headerRow, headers };
  }, [selectedFile, activeSheet]);

  // Date validation warnings for column headers
  const dateWarnings = useMemo(() => {
    if (detectedHeaders.headers.length === 0) return [] as DateWarning[];
    return validateDateSequence(detectedHeaders.headers);
  }, [detectedHeaders.headers]);

  // Auto-detect start date from file headers
  useEffect(() => {
    if (detectedHeaders.headers.length > 0 && !startDateConfirmed) {
      const detected = detectFirstMonthFromHeaders(detectedHeaders.headers);
      if (detected) {
        setModelStartDate(detected);
      }
    }
  }, [detectedHeaders.headers, startDateConfirmed]);

  const handleSaveSettings = () => {
    updateModel(prev => ({ ...prev, settings: { ...localSettings } }));
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    toast.success('Settings saved');
  };

  const handleDeleteModel = async () => {
    try {
      await supabase.from('deal_saas_model' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_sensitivity' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_lenders' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_mappings' as any).delete().eq('deal_id', dealId);
      toast.success('Financial model data deleted');
      window.location.reload();
    } catch {
      toast.error('Failed to delete model data');
    }
  };

  const renderSettingsSection = () => (
    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Card className="border-border/[0.06] shadow-md">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/5 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Model Settings</span>
              <span className="text-xs text-muted-foreground">— {localSettings.companyName} · {localSettings.businessModel}</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", settingsOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-4 border-t border-border/[0.06]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
              <div>
                <Label className="text-xs">Company Name</Label>
                <Input className="h-8 text-sm" value={localSettings.companyName}
                  onChange={e => setLocalSettings(s => ({ ...s, companyName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Business Model</Label>
                <Select value={localSettings.businessModel} onValueChange={v => setLocalSettings(s => ({ ...s, businessModel: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['SaaS', 'Subscription', 'Marketplace', 'Usage-Based', 'Hybrid'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Customer Base</Label>
                <Select value={localSettings.customerBase} onValueChange={v => setLocalSettings(s => ({ ...s, customerBase: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['B2B', 'B2C', 'B2B2C'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Actuals Thru Date</Label>
                <Input type="date" className="h-8 text-xs" value={localSettings.actualThruDate}
                  onChange={e => setLocalSettings(s => ({ ...s, actualThruDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Financial Quality</Label>
                <Select value={localSettings.financialQuality} onValueChange={v => setLocalSettings(s => ({ ...s, financialQuality: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['CPA Reviewed', 'Audited', 'Company Prepared'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button size="sm" onClick={handleSaveSettings} className="gap-1.5">
                {settingsSaved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save Settings'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Delete Model
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Financial Model?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all financial model data for "{localSettings.companyName}". This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteModel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );

  // AI suggestions hook
  const {
    suggestions, isLoading: isSuggestLoading, hasRun: hasSuggestRun, pendingCount, acceptedCount,
    fetchSuggestions, acceptSuggestion, rejectSuggestion, acceptAll, logPatterns, getSuggestionForRow,
  } = useMappingSuggestions();

  const getCompanyId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).limit(1).single();
    return data?.company_id || null;
  }, []);

  const handleAISuggest = useCallback(async () => {
    if (!selectedFile) return;
    const sheet = selectedFile.sheets[activeSheet];
    if (!sheet) return;
    const companyId = await getCompanyId();
    if (!companyId) { toast.error('Company not found'); return; }
    const rows = sheet.data.slice(0, 200).map((row, idx) => ({
      rowIdx: idx, label: String(row[0] || ''), sampleValues: row.slice(1, 6),
    })).filter(r => r.label.trim().length > 0);
    await fetchSuggestions(rows, companyId, dealId);
  }, [selectedFile, activeSheet, getCompanyId, fetchSuggestions, dealId]);

  const handleAcceptSuggestion = useCallback((rowIdx: number) => {
    const suggestion = getSuggestionForRow(rowIdx);
    if (!suggestion || !selectedFile) return;
    const sheet = selectedFile.sheets[activeSheet];
    const fieldName = suggestion.suggestedField;
    const newMapping: FieldMapping = { sheet: sheet.name, rowIdx, label: String(sheet.data[rowIdx]?.[0] || `Row ${rowIdx + 1}`) };
    setFieldMappings(prev => ({ ...prev, [fieldName]: [...(prev[fieldName] || []), newMapping] }));
    // Trigger flash
    setFlashedRows(new Set([rowIdx]));
    setFlashedFields(new Set([fieldName]));
    setTimeout(() => { setFlashedRows(new Set()); setFlashedFields(new Set()); }, 600);
    acceptSuggestion(rowIdx);
  }, [getSuggestionForRow, selectedFile, activeSheet, acceptSuggestion]);

  const handleAcceptAll = useCallback(() => {
    const pending = suggestions.filter(s => s.status === 'pending');
    pending.forEach(s => handleAcceptSuggestion(s.rowIdx));
    acceptAll();
  }, [suggestions, handleAcceptSuggestion, acceptAll]);

  // Upload file to storage immediately and persist reference
  const persistFileToStorage = useCallback(async (file: File) => {
    try {
      const filePath = `${dealId}/mapping-source/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('deal-files')
        .upload(filePath, file, { upsert: true });
      if (!uploadError) {
        storedFilePathRef.current = filePath;
        return filePath;
      }
    } catch (err) {
      console.warn('Failed to persist file to storage:', err);
    }
    return null;
  }, [dealId]);

  const handleSaveProgress = useCallback(async () => {
    if (!selectedFile || Object.keys(fieldMappings).length === 0) return;
    setIsSaving(true);
    try {
      applyMappingsToModel(fieldMappings, selectedFile, updateModel, flippedRows, excludedColumns, flippedColumns, modelStartDate);
      const companyId = await getCompanyId();
      if (companyId) await logPatterns(companyId, dealId);

      // Use already-persisted storage path, or upload now if missing
      let storagePath = storedFilePathRef.current;
      if (!storagePath) {
        storagePath = await persistFileToStorage(selectedFile.file);
      }

      await supabase.from('deal_saas_mappings' as any).upsert({
        deal_id: dealId,
        field_mappings: fieldMappings,
        file_name: selectedFile.file.name,
        file_size: selectedFile.file.size,
        file_storage_path: storagePath,
        analysis_result: selectedFile.analysis,
        mapped_at: new Date().toISOString(),
        excluded_columns: Array.from(excludedColumns),
        flipped_rows: Array.from(flippedRows),
        flipped_columns: Array.from(flippedColumns),
      }, { onConflict: 'deal_id' });

      // ── Multi-file: save per-file mappings and push financial data ──
      if (activeFileId) {
        await saveFileMappings(
          activeFileId,
          fieldMappings,
          Array.from(excludedColumns),
          Array.from(flippedRows),
          Array.from(flippedColumns),
          modelStartDate?.month ?? 1,
          modelStartDate?.year ?? 2024,
        );

        // Extract and push data rows to deal_financial_data
        const dataRows = extractMappedDataRows(
          fieldMappings, selectedFile,
          modelStartDate?.month ?? 1, modelStartDate?.year ?? 2024,
          flippedRows, excludedColumns, flippedColumns,
        );
        if (dataRows.length > 0) {
          await pushFileData(activeFileId, dataRows);
        }
      }

      const count = Object.keys(fieldMappings).length;
      setLastSavedCount(count);
      toast.success(`Saved ${count} mapped ${count === 1 ? 'field' : 'fields'} — Dashboard, IS & BS updated`);
    } catch { toast.error('Failed to save mapping progress'); }
    finally { setIsSaving(false); }
  }, [selectedFile, fieldMappings, updateModel, getCompanyId, logPatterns, dealId, persistFileToStorage, flippedRows, flippedColumns, excludedColumns, modelStartDate, activeFileId, saveFileMappings, pushFileData]);

  // Keep ref in sync for imperative handle
  useEffect(() => { handleSaveProgressRef.current = handleSaveProgress; }, [handleSaveProgress]);


  const analyzeFile = useCallback(async (file: File): Promise<AnalyzedFile> => {
    try {
      const result = await parseExcelFromFile(file);
      const matchedFields: string[] = [];
      let isMatches = 0, bsMatches = 0;
      result.sheets.forEach(sheet => {
        sheet.data.forEach(row => {
          const label = String(row[0] || '').toLowerCase().trim();
          if (!label) return;
          for (const [keyword, field] of Object.entries(KEYWORD_ALIASES)) {
            if (label.includes(keyword) && !matchedFields.includes(field)) {
              matchedFields.push(field);
              if ((IS_FIELDS as readonly string[]).includes(field)) isMatches++;
              else bsMatches++;
            }
          }
        });
      });
      const totalMatches = matchedFields.length;
      let status: FileAnalysisResult['status'] = 'unrecognized';
      if (totalMatches >= 8) status = 'mappable';
      else if (totalMatches >= 2) status = 'partial';
      let type: FileAnalysisResult['type'] = 'Unknown';
      if (isMatches > 0 && bsMatches > 0) type = 'IS + BS';
      else if (isMatches > 0) type = 'Income Statement';
      else if (bsMatches > 0) type = 'Balance Sheet';
      return { file, sheets: result.sheets, analysis: { status, type, totalMatches, isMatches, bsMatches, matchedFields } };
    } catch {
      return { file, sheets: [], analysis: { status: 'error', type: 'Unknown', totalMatches: 0, isMatches: 0, bsMatches: 0, matchedFields: [] } };
    }
  }, []);

  const handleFilesSelected = useCallback(async (files: FileList) => {
    // Client-side validation
    const validExts = ['.xlsx', '.xls', '.csv'];
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB hard limit
    const WARN_SIZE = 20 * 1024 * 1024; // 20MB warning
    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!validExts.includes(ext)) {
        toast.error(`Unsupported file type: ${ext}. Use .xlsx, .xls, or .csv`);
        return;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max is 50MB.`);
        return;
      }
      if (file.size > WARN_SIZE) {
        toast.warning(`Large file (${(file.size / 1024 / 1024).toFixed(1)}MB) — parsing may take a moment`);
      }
    }

    setIsProcessing(true);
    setUploadProgress(0);
    setUploadStatus('Validating files...');

    const results: AnalyzedFile[] = [];
    const totalFiles = files.length;
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      setUploadStatus(`Parsing ${file.name}...`);
      setUploadProgress(Math.round(((i) / totalFiles) * 60));

      // Set a timeout for very large files
      const parsePromise = analyzeFile(file);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 60000));
      const result = await Promise.race([parsePromise, timeoutPromise]);

      if (!result) {
        toast.error(`Parsing "${file.name}" timed out. Try reducing the number of tabs or rows.`);
        setIsProcessing(false);
        setUploadProgress(null);
        setUploadStatus('');
        return;
      }

      results.push(result);
      setUploadProgress(Math.round(((i + 1) / totalFiles) * 60));
    }

    results.sort((a, b) => b.analysis.totalMatches - a.analysis.totalMatches);
    // Merge with existing analyzed files instead of replacing
    setAnalyzedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.file.name));
      const newFiles = results.filter(r => !existingNames.has(r.file.name));
      return [...prev, ...newFiles];
    });

    // Create DB records and upload each file to storage
    setUploadStatus('Saving file records...');
    setUploadProgress(70);
    for (const af of results) {
      const storagePath = await persistFileToStorage(af.file);
      // Detect start date from headers
      const headerRow = detectHeaderRow(af.sheets[0]?.data || []);
      const headers = headerRow !== null ? extractColumnHeaders(af.sheets[0]?.data || [], headerRow) : [];
      const detected = detectFirstMonthFromHeaders(headers);

      const record = await upsertFile({
        deal_id: dealId,
        file_name: af.file.name,
        file_size: af.file.size,
        storage_path: storagePath,
        statement_type: 'income_statement',
        start_month: detected?.month ?? 1,
        start_year: detected?.year ?? 2024,
        month_count: headers.length || 12,
        analysis_result: af.analysis,
      });
      if (record) {
        // Tag the analyzed file with its DB id
        (af as any)._dbFileId = record.id;
      }

      // Also save to legacy mapping table for backward compat
      if (storagePath) {
        await supabase.from('deal_saas_mappings' as any).upsert({
          deal_id: dealId,
          field_mappings: fieldMappings,
          file_name: af.file.name,
          file_size: af.file.size,
          file_storage_path: storagePath,
          analysis_result: af.analysis,
          mapped_at: new Date().toISOString(),
        }, { onConflict: 'deal_id' });
      }
    }
    setUploadProgress(90);

    if (results.length === 1) {
      setSelectedFile(results[0]);
      setActiveFileId((results[0] as any)._dbFileId || null);
      setPhase('mapping');
      // Reset mapping state for this file
      setFieldMappings({});
      setExcludedColumns(new Set());
      setFlippedRows(new Set());
      setFlippedColumns(new Set());
      setStartDateConfirmed(false);
      setUploadProgress(100);
    } else {
      setPhase('triage');
    }
    setTimeout(() => { setUploadProgress(null); setUploadStatus(''); }, 500);
    setIsProcessing(false);
  }, [analyzeFile, persistFileToStorage, dealId, fieldMappings, upsertFile]);

  // Switch active file in mapping view
  const handleSwitchFile = useCallback((af: AnalyzedFile) => {
    // Save current file's mappings before switching
    if (activeFileId && Object.keys(fieldMappings).length > 0) {
      saveFileMappings(
        activeFileId,
        fieldMappings,
        Array.from(excludedColumns),
        Array.from(flippedRows),
        Array.from(flippedColumns),
        modelStartDate?.month ?? 1,
        modelStartDate?.year ?? 2024,
      );
    }

    setSelectedFile(af);
    const dbFileId = (af as any)._dbFileId || null;
    setActiveFileId(dbFileId);
    setActiveSheet(0);
    setSelectedRows(new Set());
    setAutoMapResults([]);
    setStartDateConfirmed(false);

    // Restore this file's saved mappings from DB
    if (dbFileId) {
      const dbFile = dbFiles.find(f => f.id === dbFileId);
      if (dbFile && dbFile.field_mappings && Object.keys(dbFile.field_mappings).length > 0) {
        setFieldMappings(dbFile.field_mappings as Record<string, FieldMapping[]>);
        setExcludedColumns(new Set(dbFile.excluded_columns || []));
        setFlippedRows(new Set(dbFile.flipped_rows || []));
        setFlippedColumns(new Set(dbFile.flipped_columns || []));
        if (dbFile.start_month && dbFile.start_year) {
          setModelStartDate({ month: dbFile.start_month, year: dbFile.start_year });
        }
        setLastSavedCount(Object.keys(dbFile.field_mappings).length);
      } else {
        setFieldMappings({});
        setExcludedColumns(new Set());
        setFlippedRows(new Set());
        setFlippedColumns(new Set());
        setLastSavedCount(0);
      }
    } else {
      setFieldMappings({});
      setExcludedColumns(new Set());
      setFlippedRows(new Set());
      setFlippedColumns(new Set());
      setLastSavedCount(0);
    }
  }, [activeFileId, fieldMappings, excludedColumns, flippedRows, flippedColumns, modelStartDate, saveFileMappings, dbFiles]);

  const handleNewMapping = useCallback(async () => {
    // Delete all existing db files for this deal
    for (const dbFile of dbFiles) {
      await deleteDbFile(dbFile.id);
      // Also remove from storage if path exists
      if (dbFile.storage_path) {
        await supabase.storage.from('deal-files').remove([dbFile.storage_path]);
      }
    }
    // Reset all local state
    setAnalyzedFiles([]);
    setSelectedFile(null);
    setActiveSheet(0);
    setSelectedRows(new Set());
    setFieldMappings({});
    setAutoMapResults([]);
    setValidationWarnings([]);
    setExcludedColumns(new Set());
    setFlippedRows(new Set());
    setFlippedColumns(new Set());
    setModelStartDate(null);
    setStartDateConfirmed(false);
    setActiveFileId(null);
    setLastSavedCount(0);
    storedFilePathRef.current = null;
    setPhase('upload');
    toast.success('Ready for new file upload');
  }, [dbFiles, deleteDbFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  const handleRowClick = useCallback((rowIdx: number, e: React.MouseEvent) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedRowRef.current !== null) {
        // Range selection
        const start = Math.min(lastClickedRowRef.current, rowIdx);
        const end = Math.max(lastClickedRowRef.current, rowIdx);
        for (let i = start; i <= end; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx);
      } else {
        if (next.has(rowIdx) && next.size === 1) next.clear();
        else { next.clear(); next.add(rowIdx); }
      }
      return next;
    });
    lastClickedRowRef.current = rowIdx;
  }, []);

  // Flash animation helper
  const triggerFlash = useCallback((rowIndices: number[], fieldName: string) => {
    setFlashedRows(new Set(rowIndices));
    setFlashedFields(new Set([fieldName]));
    setTimeout(() => { setFlashedRows(new Set()); setFlashedFields(new Set()); }, 600);
  }, []);

  const handleAssignField = useCallback((fieldName: string) => {
    if (!selectedFile || selectedRows.size === 0) return;
    const sheet = selectedFile.sheets[activeSheet];
    const rowIndices = Array.from(selectedRows);
    const newMappings = rowIndices.map(rowIdx => ({
      sheet: sheet.name, rowIdx, label: String(sheet.data[rowIdx]?.[0] || `Row ${rowIdx + 1}`),
    }));
    const before = { ...fieldMappings };
    setFieldMappings(prev => {
      const next = { ...prev, [fieldName]: [...(prev[fieldName] || []), ...newMappings] };
      pushAction({
        type: rowIndices.length > 1 ? 'bulk-assign' : 'assign',
        description: `${newMappings.map(m => m.label).join(', ')} → ${fieldName}`,
        before, after: next,
      });
      return next;
    });
    triggerFlash(rowIndices, fieldName);
    setSelectedRows(new Set());
  }, [selectedFile, selectedRows, activeSheet, triggerFlash, fieldMappings, pushAction]);

  const handleRemoveMapping = useCallback((fieldName: string, idx: number) => {
    const before = { ...fieldMappings };
    const removedLabel = fieldMappings[fieldName]?.[idx]?.label || 'Unknown';
    setFieldMappings(prev => {
      const updated = { ...prev };
      updated[fieldName] = updated[fieldName].filter((_, i) => i !== idx);
      if (!updated[fieldName].length) delete updated[fieldName];
      pushAction({
        type: 'remove',
        description: `${removedLabel} ✕ ${fieldName}`,
        before, after: updated,
      });
      return updated;
    });
  }, [fieldMappings, pushAction]);

  const handleClearAllMappings = useCallback(() => {
    const before = { ...fieldMappings };
    pushAction({
      type: 'clear-all',
      description: `Clear all ${Object.keys(fieldMappings).length} mappings`,
      before, after: {},
    });
    setFieldMappings({});
    setAutoMapResults([]);
    toast.info('All mappings cleared');
  }, [fieldMappings, pushAction]);

  const handleRecalculate = useCallback(() => {
    if (!selectedFile) return;
    applyMappingsToModel(fieldMappings, selectedFile, updateModel, flippedRows, excludedColumns, flippedColumns, modelStartDate);
    toast.success('Model recalculated — Dashboard, IS & BS updated');
  }, [selectedFile, fieldMappings, updateModel, flippedRows, excludedColumns, flippedColumns, modelStartDate]);

  const handleRecalculateWithLog = useCallback(async () => {
    const companyId = await getCompanyId();
    if (companyId) await logPatterns(companyId, dealId);
    handleRecalculate();
  }, [getCompanyId, logPatterns, dealId, handleRecalculate]);

  const handleAutoMap = useCallback(() => {
    if (!selectedFile) return;
    const sheet = selectedFile.sheets[activeSheet];
    if (!sheet) return;
    const results: AutoMapResult[] = [];
    const pending: Record<string, { rowIdx: number; label: string; sheetName: string }> = {};
    const alreadyMapped = new Set(Object.keys(fieldMappings));
    const alreadyPending = new Set(Object.keys(pendingAutoMaps));
    const mappedRows = new Set<number>();
    Object.values(fieldMappings).forEach(maps => maps.forEach(m => mappedRows.add(m.rowIdx)));
    Object.values(pendingAutoMaps).forEach(p => mappedRows.add(p.rowIdx));

    sheet.data.forEach((row, rowIdx) => {
      if (mappedRows.has(rowIdx)) return;
      const label = String(row[0] || '').toLowerCase().trim();
      if (!label) return;
      for (const [keyword, field] of Object.entries(KEYWORD_ALIASES)) {
        if (label.includes(keyword) && !alreadyMapped.has(field) && !alreadyPending.has(field)) {
          const confidence = getMatchConfidence(label, keyword);
          const matchType = label === keyword ? 'exact' : label.startsWith(keyword) ? 'keyword' : 'fuzzy';
          results.push({ fieldName: field, rowIdx, label: String(row[0]), confidence, matchType });
          pending[field] = { rowIdx, label: String(row[0]), sheetName: sheet.name };
          alreadyMapped.add(field);
          alreadyPending.add(field);
          mappedRows.add(rowIdx);
          break;
        }
      }
    });

    if (Object.keys(pending).length === 0) { toast.info('No additional fields could be auto-mapped'); return; }
    setPendingAutoMaps(prev => ({ ...prev, ...pending }));
    setAutoMapResults(prev => [...prev, ...results]);
    toast.success(`Found ${Object.keys(pending).length} suggested mapping${Object.keys(pending).length !== 1 ? 's' : ''} — review below`);
  }, [selectedFile, activeSheet, fieldMappings, pendingAutoMaps]);

  const handleAcceptAutoMap = useCallback((fieldName: string) => {
    const pending = pendingAutoMaps[fieldName];
    if (!pending) return;
    const before = { ...fieldMappings };
    setFieldMappings(prev => {
      const next = {
        ...prev,
        [fieldName]: [...(prev[fieldName] || []), { sheet: pending.sheetName, rowIdx: pending.rowIdx, label: pending.label }],
      };
      pushAction({ type: 'accept-auto', description: `${pending.label} → ${fieldName}`, before, after: next });
      return next;
    });
    setPendingAutoMaps(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setFlashedRows(new Set([pending.rowIdx]));
    setFlashedFields(new Set([fieldName]));
    setTimeout(() => { setFlashedRows(new Set()); setFlashedFields(new Set()); }, 600);
  }, [pendingAutoMaps, fieldMappings, pushAction]);

  const handleRejectAutoMap = useCallback((fieldName: string) => {
    setPendingAutoMaps(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  const handleAcceptAllAutoMaps = useCallback(() => {
    const entries = Object.entries(pendingAutoMaps);
    if (entries.length === 0) return;
    const before = { ...fieldMappings };
    setFieldMappings(prev => {
      const next = { ...prev };
      entries.forEach(([field, p]) => {
        next[field] = [...(next[field] || []), { sheet: p.sheetName, rowIdx: p.rowIdx, label: p.label }];
      });
      pushAction({ type: 'accept-all-auto', description: `Accept ${entries.length} auto-maps`, before, after: next });
      return next;
    });
    setPendingAutoMaps({});
    setFlashedRows(new Set(entries.map(([_, p]) => p.rowIdx)));
    setFlashedFields(new Set(entries.map(([field]) => field)));
    setTimeout(() => { setFlashedRows(new Set()); setFlashedFields(new Set()); }, 600);
    toast.success(`Accepted ${entries.length} mapping${entries.length !== 1 ? 's' : ''}`);
  }, [pendingAutoMaps, fieldMappings, pushAction]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    const action = popUndo();
    if (!action) return;
    setFieldMappings(action.before);
    toast.info(`Undid: ${action.description}`);
  }, [popUndo]);

  const handleRedo = useCallback(() => {
    const action = popRedo();
    if (!action) return;
    setFieldMappings(action.after);
    toast.info(`Redid: ${action.description}`);
  }, [popRedo]);

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, arrow keys for spreadsheet)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Only handle navigation keys if not in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Escape — deselect
      if (e.key === 'Escape') {
        setSelectedRows(new Set());
        return;
      }

      // Tab — switch between panels
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        const activeEl = document.activeElement;
        const isInSpreadsheet = spreadsheetRef.current?.contains(activeEl);
        if (isInSpreadsheet) {
          e.preventDefault();
          sidebarRef.current?.focusPanel();
        }
        return;
      }

      // Arrow keys for spreadsheet row navigation
      const isInSpreadsheet = spreadsheetRef.current?.contains(document.activeElement) || document.activeElement === spreadsheetRef.current;
      if (isInSpreadsheet && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setSelectedRows(prev => {
          const arr = Array.from(prev);
          const current = arr.length > 0 ? (e.key === 'ArrowDown' ? Math.max(...arr) : Math.min(...arr)) : -1;
          const next = e.key === 'ArrowDown' ? current + 1 : Math.max(0, current - 1);
          lastClickedRowRef.current = next;
          return new Set([next]);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // Ctrl+scroll zoom on spreadsheet
  useEffect(() => {
    const el = spreadsheetRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) setZoomLevel(z => Math.min(200, z + 10));
        else setZoomLevel(z => Math.max(50, z - 10));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [phase]);

  const runValidation = useCallback(() => {
    const warnings: ValidationWarning[] = [];
    const getSampleValue = (fieldName: string): number | null => {
      const mappings = fieldMappings[fieldName];
      if (!mappings || !selectedFile) return null;
      let total = 0;
      mappings.forEach(m => {
        const sheet = selectedFile.sheets.find(s => s.name === m.sheet) || selectedFile.sheets[0];
        const row = sheet?.data[m.rowIdx];
        if (!row) return;
        for (let c = 1; c < row.length; c++) {
          const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
          if (!isNaN(val)) { total += val; break; }
        }
      });
      return total;
    };

    if (fieldMappings['Recurring Revenue']) {
      const sample = getSampleValue('Recurring Revenue');
      if (sample !== null && sample < 0) warnings.push({ severity: 'error', field: 'Recurring Revenue', message: 'Revenue is negative — verify sign convention' });
    }
    const totalRev = getSampleValue('Recurring Revenue');
    const totalCogs = getSampleValue('COGS on Recurring Revenue');
    if (totalRev !== null && totalCogs !== null && totalCogs > totalRev) {
      warnings.push({ severity: 'warning', field: 'COGS on Recurring Revenue', message: 'COGS exceeds Revenue — check sign' });
    }
    ['Recurring Revenue', 'Cash and Cash Equivalents', 'Accounts Receivable', 'Accounts Payable'].forEach(field => {
      if (!fieldMappings[field]) warnings.push({ severity: 'info', field, message: `${field} not mapped — needed for accurate KPIs` });
    });
    const rowToFields: Record<number, string[]> = {};
    Object.entries(fieldMappings).forEach(([field, maps]) => {
      maps.forEach(m => { if (!rowToFields[m.rowIdx]) rowToFields[m.rowIdx] = []; rowToFields[m.rowIdx].push(field); });
    });
    Object.entries(rowToFields).forEach(([rowIdx, fields]) => {
      if (fields.length > 1) warnings.push({ severity: 'warning', field: fields.join(', '), message: `Row ${Number(rowIdx) + 1} mapped to multiple fields — possible double-counting` });
    });

    setValidationWarnings(warnings);
    setShowValidation(true);

    const errors = warnings.filter(w => w.severity === 'error');
    const warningItems = warnings.filter(w => w.severity === 'warning');
    const infoItems = warnings.filter(w => w.severity === 'info');

    if (errors.length > 0) {
      const details = errors.map(e => `• ${e.field}: ${e.message}`).join('\n');
      toast.error(`${errors.length} validation error(s)`, { description: details, duration: 8000 });
    } else if (warningItems.length > 0) {
      const details = warningItems.map(w => `• ${w.field}: ${w.message}`).join('\n');
      toast.warning(`${warningItems.length} warning(s)`, { description: details, duration: 6000 });
    } else if (infoItems.length > 0) {
      const details = infoItems.map(i => `• ${i.field}: ${i.message}`).join('\n');
      toast.info(`${infoItems.length} note(s)`, { description: details, duration: 5000 });
    } else {
      toast.success('No validation issues found');
    }
  }, [fieldMappings, selectedFile]);

  const totalFields = enabledFields.size;
  const enabledMappedCount = Object.keys(fieldMappings).filter(f => enabledFields.has(f)).length;
  const unmappedCount = totalFields - enabledMappedCount;
  const percent = totalFields === 0 ? 0 : Math.round((enabledMappedCount / totalFields) * 100);

  // ── Phase: Upload ──
  if (phase === 'upload') {
    return (
      <div className="space-y-4">
        {renderSettingsSection()}
        <Card className="border-border/[0.06] border-dashed group/dropzone hover:border-primary/30 transition-colors shadow-md">
          <CardContent className="p-16 flex flex-col items-center justify-center text-center"
            onDragOver={e => { e.preventDefault(); e.currentTarget.closest('.group\\/dropzone')?.classList.add('border-primary/60'); }}
            onDragLeave={e => { e.currentTarget.closest('.group\\/dropzone')?.classList.remove('border-primary/60'); }}
            onDrop={e => { e.currentTarget.closest('.group\\/dropzone')?.classList.remove('border-primary/60'); handleDrop(e); }}>
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                <RefreshCw className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">{uploadStatus || 'Analyzing files...'}</p>
                {uploadProgress !== null && (
                  <div className="w-full space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-[10px] text-muted-foreground/60 text-center tabular-nums">{uploadProgress}%</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4 bg-primary/10">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Upload Financial Statements</h3>
                <p className="text-xs text-muted-foreground mb-1">Drag & drop Excel files or click to browse</p>
                <p className="text-[10px] text-muted-foreground/60 mb-4">Supports .xlsx, .xls, .csv — Multiple files welcome</p>
                <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Browse Files
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" multiple
                  onChange={e => e.target.files && handleFilesSelected(e.target.files)} />
              </>
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-3 gap-3">
          {[
            { title: 'Bulk Upload', desc: 'Upload multiple files at once for batch analysis' },
            { title: 'Auto-Detect Headers', desc: 'Column headers are detected automatically from your data' },
            { title: 'Smart Mapping', desc: '200+ keyword aliases + AI suggestions for instant mapping' },
          ].map(f => (
            <Card key={f.title} className="border-border/20">
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold mb-1">{f.title}</h4>
                <p className="text-[10px] text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Phase: Triage ──
  if (phase === 'triage') {
    const counts = { mappable: 0, partial: 0, unrecognized: 0, error: 0 };
    analyzedFiles.forEach(f => counts[f.analysis.status]++);

    return (
      <div className="space-y-4">
        {renderSettingsSection()}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setPhase('upload')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Change file
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5">
                  <PlusCircle className="h-3.5 w-3.5" /> New Mapping
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Start New Mapping?</AlertDialogTitle>
                  <AlertDialogDescription>This will remove all uploaded files and mappings for this deal. You'll start fresh with a new file upload.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleNewMapping}>Start Over</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex gap-2 text-xs">
             {counts.mappable > 0 && <Badge className="bg-success/8 text-success border-success/15">{counts.mappable} Mappable</Badge>}
             {counts.partial > 0 && <Badge className="bg-warning/8 text-warning border-warning/15">{counts.partial} Partial</Badge>}
              {counts.unrecognized > 0 && <Badge variant="secondary">{counts.unrecognized} Not Recognized</Badge>}
              {counts.error > 0 && <Badge variant="destructive">{counts.error} Error</Badge>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {analyzedFiles.map((af, idx) => (
           <Card key={idx} className={cn(
             "border-border/[0.06] cursor-pointer hover:border-primary/20 transition-all shadow-sm hover:shadow-md",
             af.analysis.status === 'mappable' && "border-success/15",
             af.analysis.status === 'partial' && "border-warning/15",
             af.analysis.status === 'error' && "border-destructive/15",
           )}>
              <CardContent className="p-4" onClick={async () => { setSelectedFile(af); setPhase('mapping'); await persistFileToStorage(af.file); }}>
                <div className="flex items-center gap-2 mb-2">
                  {af.analysis.status === 'mappable' ? <Check className="h-4 w-4 text-emerald-500" /> :
                    af.analysis.status === 'partial' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                    af.analysis.status === 'error' ? <X className="h-4 w-4 text-destructive" /> :
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-xs font-medium truncate">{af.file.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  {af.sheets.length} sheet{af.sheets.length === 1 ? '' : 's'} · {af.analysis.type} · {af.analysis.totalMatches} of {totalFields} fields
                </div>
               <div className="w-full bg-muted/20 rounded-full h-1.5 mb-2">
                 <div className="bg-primary/70 h-1.5 rounded-full transition-all" style={{ width: `${(af.analysis.totalMatches / totalFields) * 100}%` }} />
               </div>
                <div className="flex flex-wrap gap-1">
                  {af.analysis.matchedFields.slice(0, 6).map(f => (
                    <Badge key={f} variant="secondary" className="text-[9px] h-4">{f}</Badge>
                  ))}
                  {af.analysis.matchedFields.length > 6 && (
                    <Badge variant="secondary" className="text-[9px] h-4">+{af.analysis.matchedFields.length - 6} more</Badge>
                  )}
                </div>
                <Button size="sm" className="w-full mt-3 h-7 text-xs">Select & Map <ChevronRight className="h-3 w-3 ml-1" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Phase: Mapping ──
  if (!selectedFile) return null;
  const sheet = selectedFile.sheets[activeSheet];
  const sheetCount = selectedFile.sheets.length;
  const rowCount = sheet?.data.length || 0;
  const columnCount = sheet?.data[0]?.length || 0;

  return (
    <div className="mapping-workbench space-y-3 rounded-lg p-6 max-w-[1280px] mx-auto">
      {renderSettingsSection()}

      {/* ── Header: Title + Progress Badges ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {analyzedFiles.length > 1 && (
            <button className="map-toolbar-btn h-6 px-2" onClick={() => setPhase('triage')}>
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}
          <div>
            <h3 className="text-base font-semibold text-[#111827]">Data Mapping</h3>
            <p className="text-xs text-[#6B7280]">
              Map rows from your upload to standard model fields
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="map-toolbar-btn h-6 w-6 p-0 justify-center" onClick={() => setFieldSettingsOpen(true)} title="Field Settings">
            <Settings className="h-3 w-3" />
          </button>
          <span className="map-toolbar-chip">
            <FileSpreadsheet className="h-3 w-3" />
            {sheetCount} sheet{sheetCount !== 1 ? 's' : ''} · {rowCount}×{columnCount}
          </span>
          <span className={cn(
            "map-toolbar-chip",
            percent === 100 ? "map-toolbar-chip--success" : ""
          )}>
            {percent === 100 && <CheckCircle2 className="h-3 w-3" />}
            {percent}% mapped
          </span>
          {enabledFields.size < allFieldNames.size && (
            <span className="map-toolbar-chip">
              {enabledFields.size}/{allFieldNames.size} fields
            </span>
          )}
          {hasUnsavedMappings && (
            <span className="map-toolbar-chip map-toolbar-chip--warning">
              {mappedCount - lastSavedCount} unsaved
            </span>
          )}
        </div>
      </div>

      {/* Field Settings Modal */}
      <MappingFieldSettings
        open={fieldSettingsOpen}
        onOpenChange={setFieldSettingsOpen}
        enabledFields={enabledFields}
        onUpdateEnabledFields={setEnabledFields}
      />

      {/* ── Multi-file selector tabs ── */}
      {analyzedFiles.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {analyzedFiles.map((af, idx) => {
            const isActive = selectedFile === af;
            const dbFile = dbFiles.find(f => f.file_name === af.file.name);
            const isPushed = dbFile?.pushed_at;
            return (
              <button
                key={idx}
               className={cn(
                 "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0",
                 isActive
                   ? "bg-primary/8 border border-primary/15 text-primary shadow-sm"
                   : "bg-secondary/30 border border-border/[0.06] text-muted-foreground hover:bg-accent/5 hover:text-foreground"
               )}
                onClick={() => { if (!isActive) handleSwitchFile(af); }}
              >
                <FileSpreadsheet className="h-3 w-3" />
                <span className="truncate max-w-[120px]">{af.file.name}</span>
                {isPushed && <Check className="h-3 w-3 text-success" />}
              </button>
            );
          })}
          <button
           className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border/[0.08] hover:border-primary/20 hover:bg-primary/5 transition-all shrink-0"
           onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3" /> Add file
          </button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" multiple
            onChange={e => e.target.files && handleFilesSelected(e.target.files)} />
        </div>
      )}

      <div className="map-file-strip">
        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
        <button
          className="text-xs font-medium hover:underline transition-colors truncate cursor-pointer text-[#111827]"
          onClick={() => {
            if (selectedFile) {
              const url = URL.createObjectURL(selectedFile.file);
              setExpandedFileUrl(url);
              setExpandedPreview(true);
            }
          }}
          title="Click to expand preview"
        >
          {selectedFile.file.name}
        </button>
        {detectedHeaders.headers.length > 0 && (
          <>
            <span className="text-[#9CA3AF]">·</span>
            <span className="text-[11px] whitespace-nowrap truncate max-w-[200px] text-[#6B7280]">
              {detectedHeaders.headers[0]} → {detectedHeaders.headers[detectedHeaders.headers.length - 1]}
            </span>
          </>
        )}
        {detectedHeaders.headerRow !== null && (
          <>
            <span className="text-[#9CA3AF]">·</span>
            <span className="text-[11px] whitespace-nowrap text-[#6B7280]">
              Header Row {detectedHeaders.headerRow + 1}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button className="map-toolbar-btn h-5 text-[10px] px-2 !text-[#2563EB] !border-transparent !bg-transparent hover:!underline" onClick={() => setPhase('upload')}>
            Change file
          </button>
        </div>
      </div>


      {/* AI Suggestions Banner */}
      {hasSuggestRun && suggestions.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg border" style={{ background: '#EFF6FF', borderColor: '#BFDBFE' }}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#2563EB]" />
            <span className="text-xs font-medium text-[#2563EB]">
              {pendingCount > 0 ? `${pendingCount} AI suggestion${pendingCount > 1 ? 's' : ''} pending` : `${acceptedCount} applied`}
            </span>
          </div>
          {pendingCount > 0 && (
            <button className="map-toolbar-btn h-5 text-[10px] px-2 !text-[#2563EB] !border-[#BFDBFE]" onClick={handleAcceptAll}>
              <Check className="h-3 w-3" /> Accept All
            </button>
          )}
        </div>
      )}

      {/* Validation */}
      {validationWarnings.length > 0 && showValidation && (
       <div className="rounded-xl border border-border/[0.06] bg-secondary/30 overflow-hidden shadow-sm">
         <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/[0.04]">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-warning" />
              <span className="text-[11px] font-medium">
                {validationWarnings.filter(w => w.severity === 'error').length} errors · {validationWarnings.filter(w => w.severity === 'warning').length} warnings
              </span>
            </div>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowValidation(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="divide-y divide-border/[0.04] max-h-[120px] overflow-auto">
            {validationWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-1.5">
                {w.severity === 'error' ? <X className="h-3 w-3 text-destructive mt-0.5 shrink-0" /> :
                  w.severity === 'warning' ? <AlertTriangle className="h-3 w-3 text-warning mt-0.5 shrink-0" /> :
                  <Info className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <span className="text-[11px] font-medium">{w.field}</span>
                  <p className="text-[10px] text-muted-foreground">{w.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="map-toolbar">
        {/* Left: Intelligence + Edit tools */}
        <div className="flex items-center gap-1">
          <button className="map-toolbar-btn" onClick={handleAISuggest} disabled={isSuggestLoading}>
            {isSuggestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isSuggestLoading ? 'Analyzing…' : hasSuggestRun ? 'Re-analyze' : 'AI Suggest'}
          </button>
          <button className="map-toolbar-btn" onClick={handleAutoMap}>
            <Zap className="h-3 w-3" /> Auto-Map
          </button>
          <button className="map-toolbar-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); runValidation(); }} disabled={mappedCount === 0}>
            <ShieldAlert className="h-3 w-3" /> Validate
          </button>

           <div className="map-toolbar-divider" />

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="map-toolbar-btn h-6 w-6 p-0 justify-center" onClick={() => handleFlipRows(Array.from(selectedRows))} disabled={selectedRows.size === 0}>
                  <span className="font-bold text-[10px]">±</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Flip +/− sign on selected rows</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button className="map-toolbar-btn h-6 w-6 p-0 justify-center" onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-3 w-3" />
          </button>
          <button className="map-toolbar-btn h-6 w-6 p-0 justify-center" onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-3 w-3" />
          </button>

          <div className="map-toolbar-divider" />

          {/* Column visibility */}
          <Popover open={showColumnManager} onOpenChange={setShowColumnManager}>
            <PopoverTrigger asChild>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className={cn("map-toolbar-btn h-6 w-6 p-0 justify-center", excludedColumns.size > 0 && "!border-[rgba(216,177,90,0.3)] !color-[var(--map-amber)]")} style={excludedColumns.size > 0 ? { color: 'var(--map-amber)', borderColor: 'rgba(216,177,90,0.3)' } : {}}>
                      <Filter className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Column visibility {excludedColumns.size > 0 ? `(${excludedColumns.size} hidden)` : ''}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-64 p-3 max-h-[350px] overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold">Column Visibility</h4>
                {excludedColumns.size > 0 && (
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={handleRestoreAllColumns}>
                    Show All
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {Array.from({ length: Math.min((sheet?.data[0]?.length || 0) - 1, 49) }, (_, i) => {
                  const colIdx = i + 1;
                  const isExcluded = excludedColumns.has(colIdx);
                  const headerLabel = detectedHeaders.headers[i] || `Col ${String.fromCharCode(65 + (colIdx % 26))}`;
                  return (
                    <div key={colIdx} className="flex items-center justify-between gap-2 py-0.5">
                      <span className={cn("text-[11px] truncate", isExcluded && "text-muted-foreground line-through")}>{headerLabel}</span>
                      <Switch checked={!isExcluded} onCheckedChange={(checked) => {
                        if (checked) handleRestoreColumn(colIdx);
                        else handleExcludeColumns([colIdx]);
                      }} className="h-4 w-7" />
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Zoom */}
          <div className="flex items-center gap-0">
            <button className="map-toolbar-btn h-6 w-6 p-0 justify-center" onClick={handleZoomOut} disabled={zoomLevel <= 50}>
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="text-[10px] tabular-nums w-7 text-center text-[#9CA3AF]">{zoomLevel}%</span>
            <button className="map-toolbar-btn h-6 w-6 p-0 justify-center" onClick={handleZoomIn} disabled={zoomLevel >= 200}>
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button className="map-toolbar-btn h-6 w-6 p-0 justify-center">
                <Keyboard className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-64 p-3">
              <h4 className="text-xs font-semibold mb-2">Keyboard Shortcuts</h4>
              <div className="space-y-1.5 text-[11px]">
                {[
                  ['↑ / ↓', 'Navigate rows / fields'],
                  ['Click', 'Select row'],
                  ['Shift+Click', 'Range select rows'],
                  ['Ctrl+Click', 'Toggle row selection'],
                  ['Tab', 'Switch to field panel'],
                  ['Enter', 'Map selected row → focused field'],
                  ['Delete', 'Remove mapping from focused field'],
                  ['Escape', 'Deselect all'],
                  ['Ctrl+Z', 'Undo last mapping action'],
                  ['Ctrl+Shift+Z', 'Redo'],
                  ['Ctrl+Scroll', 'Zoom in/out'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">{key}</kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Right: Start date, actions, primary CTA */}
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button className="map-toolbar-btn">
                <Calendar className="h-3 w-3" />
                {modelStartDate
                  ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][modelStartDate.month - 1]} ${modelStartDate.year}`
                  : 'Start Month'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">First month in file</p>
                <p className="text-[10px] text-muted-foreground">Sets the starting month for the Income Statement and Balance Sheet.</p>
                <div className="flex items-center gap-2">
                  <select
                    className="text-xs h-7 px-2 rounded-md border border-border/50 bg-card text-foreground flex-1"
                    value={modelStartDate?.month ?? 1}
                    onChange={(e) => {
                      setModelStartDate(prev => prev ? { ...prev, month: parseInt(e.target.value) } : { month: parseInt(e.target.value), year: 2024 });
                      setStartDateConfirmed(true);
                    }}
                  >
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="text-xs h-7 w-16 px-2 rounded-md border border-border/50 bg-card text-foreground"
                    value={modelStartDate?.year ?? 2024}
                    min={2000}
                    max={2040}
                    onChange={(e) => {
                      const yr = parseInt(e.target.value);
                      if (yr >= 2000 && yr <= 2040) {
                        setModelStartDate(prev => prev ? { ...prev, year: yr } : { month: 1, year: yr });
                        setStartDateConfirmed(true);
                      }
                    }}
                  />
                </div>
                {startDateConfirmed ? (
                  <Badge variant="outline" className="text-[9px] h-5 px-2 gap-1 border-success/40 bg-success/10 text-success">
                    <Check className="h-2.5 w-2.5" /> Confirmed
                  </Badge>
                ) : modelStartDate ? (
                  <Badge variant="outline" className="text-[9px] h-5 px-2 gap-1 border-primary/40 bg-primary/10 text-primary">
                    <Sparkles className="h-2.5 w-2.5" /> Auto-detected
                  </Badge>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>

          <button className="map-toolbar-btn" onClick={() => {
            if (selectedFile) {
              const url = URL.createObjectURL(selectedFile.file);
              setExpandedFileUrl(url);
              setExpandedPreview(true);
            }
          }}>
            <Maximize2 className="h-3 w-3" /> Expand
          </button>

           <div className="map-toolbar-divider" />

          {/* Destructive: New Mapping */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="map-toolbar-btn map-toolbar-btn--destructive">
                <Trash2 className="h-3 w-3" /> Reset
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start New Mapping?</AlertDialogTitle>
                <AlertDialogDescription>This will remove all uploaded files and mappings for this deal. You'll start fresh with a new file upload.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleNewMapping}>Start Over</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="map-toolbar-divider" />

          {/* Secondary: Save Draft */}
          <button className="map-toolbar-btn" onClick={handleSaveProgress} disabled={mappedCount === 0 || isSaving || !hasUnsavedMappings} title="Saves mapping assignments without updating the model">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Draft
          </button>

          {/* Primary CTA */}
          <button className="map-toolbar-btn map-toolbar-btn--primary" onClick={handleRecalculateWithLog} disabled={mappedCount === 0} title="Saves all mappings AND pushes mapped data into the financial model">
            <RefreshCw className="h-3 w-3" /> Push to Model
          </button>
        </div>
      </div>

      {/* Split panel: spreadsheet + field sidebar */}
      <ResizablePanelGroup
        direction="horizontal"
        className="rounded-lg border border-[#E5E7EB] overflow-hidden bg-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
        onLayout={(sizes) => {
          try { localStorage.setItem('data-mapping-panel-ratio', JSON.stringify(sizes)); } catch {}
        }}
      >
        {/* Left: Spreadsheet */}
        <ResizablePanel
          defaultSize={(() => { try { const s = localStorage.getItem('data-mapping-panel-ratio'); return s ? JSON.parse(s)[0] : 50; } catch { return 50; } })()}
          minSize={30}
        >
          <div ref={spreadsheetRef} tabIndex={0} className="outline-none">
          <div className="bg-white overflow-hidden">
              {/* Sheet tabs + mode toggles */}
              <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <div className="flex overflow-x-auto">
                  {selectedFile.sheets.map((s, i) => (
                    <button key={i} className={cn(
                      "px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors font-medium",
                      i === activeSheet ? "border-[#2563EB] text-[#111827] bg-white" : "border-transparent text-[#6B7280] hover:text-[#111827] hover:bg-white/50"
                     )} onClick={() => { setActiveSheet(i); setSelectedRows(new Set()); setEraserSelectedRows(new Set()); setEraserSelectedCols(new Set()); setSignFlipSelectedRows(new Set()); setSignFlipSelectedCols(new Set()); }}>
                       {s.name}
                     </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 px-2">
                  {signFlipMode && (signFlipSelectedRows.size > 0 || signFlipSelectedCols.size > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1 px-2 border-warning/40 text-warning hover:bg-warning/10"
                      onClick={handleApplySignFlip}
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      Flip ± {signFlipSelectedRows.size > 0 ? `${signFlipSelectedRows.size}R` : ''}{signFlipSelectedRows.size > 0 && signFlipSelectedCols.size > 0 ? ' · ' : ''}{signFlipSelectedCols.size > 0 ? `${signFlipSelectedCols.size}C` : ''}
                    </Button>
                  )}
                  <Button
                    variant={signFlipMode ? "default" : "ghost"}
                    size="sm"
                    className={cn("h-6 w-6 p-0", signFlipMode && "bg-warning/80 hover:bg-warning/70 text-warning-foreground")}
                    onClick={handleToggleSignFlip}
                    title={signFlipMode ? "Exit sign-flip mode" : "Sign flip — select rows/columns to invert ±"}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                  {eraserMode && (eraserSelectedRows.size > 0 || eraserSelectedCols.size > 0) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={handleEraserDelete}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete {eraserSelectedRows.size > 0 ? `${eraserSelectedRows.size}R` : ''}{eraserSelectedRows.size > 0 && eraserSelectedCols.size > 0 ? ' · ' : ''}{eraserSelectedCols.size > 0 ? `${eraserSelectedCols.size}C` : ''}
                    </Button>
                  )}
                  <Button
                    variant={eraserMode ? "default" : "ghost"}
                    size="sm"
                    className={cn("h-6 w-6 p-0", eraserMode && "bg-destructive hover:bg-destructive/90")}
                    onClick={handleToggleEraser}
                    title={eraserMode ? "Exit eraser mode" : "Eraser — select rows/columns to remove"}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
               <div className="h-[500px] overflow-auto relative" style={{ fontSize: `${zoomLevel}%` }}>
               <table className="w-max text-[13px] border-collapse" style={{ fontSize: 'inherit' }}>
                 <thead className="sticky top-0 z-20 bg-[#F9FAFB]">
                   <tr>
                     <th className="sticky left-0 z-30 w-8 py-1.5 px-1 text-center text-[#9CA3AF] text-[10px] bg-[#F9FAFB] border-b border-[#E5E7EB]">#</th>
                     <th className="sticky left-8 z-30 py-1.5 px-3 text-left text-[#6B7280] w-[220px] min-w-[220px] max-w-[220px] font-semibold text-[11px] uppercase tracking-wide bg-[#F9FAFB] border-b border-[#E5E7EB]" style={{ boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>Account</th>
                      {Array.from({ length: Math.min((sheet?.data[0]?.length || 0) - 1, 49) }, (_, i) => {
                        const colIdx = i + 1;
                        const isExcluded = excludedColumns.has(colIdx);
                        const isColSelected = selectedColumns.has(colIdx);
                        if (isExcluded) return null;
                        return (
                          <ContextMenu key={colIdx}>
                            <ContextMenuTrigger asChild>
                               <th
                                 className={cn(
                                   "py-1.5 px-3 text-right text-[#6B7280] min-w-[80px] font-semibold group/col relative cursor-pointer select-none bg-[#F9FAFB] text-[11px] uppercase tracking-wide border-b border-[#E5E7EB]",
                                  isColSelected && !eraserMode && !signFlipMode && "bg-[#EFF6FF] ring-1 ring-inset ring-[#BFDBFE]",
                                  eraserMode && eraserSelectedCols.has(colIdx) && "bg-[#FEF2F2] ring-1 ring-inset ring-[#FCA5A5]",
                                  signFlipMode && signFlipSelectedCols.has(colIdx) && "bg-[#FFFBEB] ring-1 ring-inset ring-[#FDE68A]",
                                  flippedColumns.has(colIdx) && !signFlipMode && !eraserMode && "bg-[#FFFBEB]",
                                )}
                                onClick={(e) => signFlipMode ? handleSignFlipColClick(colIdx, e) : eraserMode ? handleEraserColClick(colIdx, e) : handleColumnHeaderClick(colIdx, e)}
                              >
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-1 justify-end w-full">
                                    {flippedColumns.has(colIdx) && (
                                      <span className="text-[8px] font-bold text-amber-500" title="Sign flipped (±)">±</span>
                                    )}
                                     <span className="text-[8px] text-[#9CA3AF]">
                                       {String.fromCharCode(65 + (colIdx % 26))}{colIdx >= 26 ? String.fromCharCode(65 + Math.floor(colIdx / 26) - 1) : ''}
                                    </span>
                                    <button
                                      className="opacity-0 group-hover/col:opacity-100 transition-opacity h-3.5 w-3.5 rounded hover:bg-destructive/20 flex items-center justify-center"
                                      onClick={(e) => { e.stopPropagation(); handleExcludeColumns([colIdx]); }}
                                      title="Exclude column"
                                    >
                                      <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
                                    </button>
                                  </div>
                                  {detectedHeaders.headers[i] && (
                                    <span className="text-[9px] font-medium text-foreground/70 truncate max-w-[70px]" title={detectedHeaders.headers[i]}>
                                      {detectedHeaders.headers[i]}
                                    </span>
                                  )}
                                </div>
                              </th>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48">
                              <ContextMenuItem onClick={() => handleExcludeColumns([colIdx])}>
                                <EyeOff className="h-3.5 w-3.5 mr-2" /> Exclude Column
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleFlipColumns([colIdx])}>
                                <span className="font-bold mr-2 text-xs">±</span> {flippedColumns.has(colIdx) ? 'Remove Flip' : 'Flip +/− Sign'}
                              </ContextMenuItem>
                              {selectedColumns.size > 1 && (
                                <>
                                <ContextMenuItem onClick={() => handleExcludeColumns(Array.from(selectedColumns))}>
                                  <EyeOff className="h-3.5 w-3.5 mr-2" /> Exclude {selectedColumns.size} Selected
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleFlipColumns(Array.from(selectedColumns))}>
                                  <span className="font-bold mr-2 text-xs">±</span> Flip {selectedColumns.size} Selected
                                </ContextMenuItem>
                                </>
                              )}
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={handleRestoreAllColumns} disabled={excludedColumns.size === 0}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> Show All Columns
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(sheet?.data || []).slice(0, 200).map((row, rowIdx) => {
                      const isFlipped = flippedRows.has(rowIdx);
                      const mappedToField = Object.entries(fieldMappings).find(([_, maps]) =>
                        maps.some(m => m.rowIdx === rowIdx && m.sheet === sheet?.name)
                      );
                      const isMappedRow = !!mappedToField;
                      const pendingAutoField = Object.entries(pendingAutoMaps).find(([_, p]) => p.rowIdx === rowIdx && p.sheetName === sheet?.name);
                      const isPendingAutoMap = !!pendingAutoField;
                      const rowSuggestion = getSuggestionForRow(rowIdx);
                      const hasSuggestion = !!rowSuggestion && rowSuggestion.status !== 'rejected';
                      const isHeaderRow = detectedHeaders.headerRow === rowIdx;
                      const isSelected = selectedRows.has(rowIdx);
                      const isFlashing = flashedRows.has(rowIdx);

                      const rowBgClass = isFlashing
                        ? "animate-mapping-flash"
                        : isHeaderRow
                          ? "bg-muted/20 font-semibold"
                          : isSelected
                            ? "bg-primary/8 hover:bg-primary/12"
                            : isMappedRow
                              ? "bg-success/[0.05] hover:bg-success/[0.08]"
                              : isPendingAutoMap
                                ? "bg-warning/[0.05] hover:bg-warning/[0.08]"
                                : hasSuggestion
                                  ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
                                  : rowIdx % 2 === 0
                                    ? "bg-transparent hover:bg-muted/15"
                                    : "bg-muted/[0.04] hover:bg-muted/15";

                      // Left border style for selection/mapped/pending state
                      const leftBorderClass = isSelected
                        ? "border-l-2 border-l-primary"
                        : isMappedRow
                          ? "border-l-[3px] border-l-success"
                          : isPendingAutoMap
                            ? "border-l-[3px] border-l-warning"
                            : "";

                      // Sticky cell bg — MUST be opaque so scrolling content doesn't show through
                      const stickyBg = isFlashing
                        ? "bg-success/30"
                        : isHeaderRow
                          ? "bg-muted/40"
                          : isSelected
                            ? "bg-primary/10"
                            : isMappedRow
                              ? "bg-success/8"
                              : isPendingAutoMap
                                ? "bg-warning/8"
                                : "bg-card";

                       return (
                        <ContextMenu key={rowIdx}>
                          <ContextMenuTrigger asChild>
                        <tr
                          className={cn(
                            "cursor-pointer transition-colors border-b border-border/[0.04]",
                            rowBgClass, leftBorderClass,
                            eraserMode && eraserSelectedRows.has(rowIdx) && "!bg-destructive/10 ring-1 ring-inset ring-destructive/25",
                            signFlipMode && signFlipSelectedRows.has(rowIdx) && "!bg-warning/10 ring-1 ring-inset ring-warning/25",
                          )}
                          draggable={!isHeaderRow && !eraserMode && !signFlipMode}
                          onDragStart={e => {
                            if (isHeaderRow || eraserMode || signFlipMode) { e.preventDefault(); return; }
                            setDraggingRowIdx(rowIdx);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(rowIdx));
                            const ghost = document.createElement('div');
                            ghost.textContent = row[0] !== null && row[0] !== undefined ? String(row[0]) : `Row ${rowIdx + 1}`;
                            ghost.style.cssText = 'position:fixed;top:-1000px;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;color:white;background:hsl(var(--primary));box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;pointer-events:none;z-index:9999;opacity:0.9;';
                            document.body.appendChild(ghost);
                            e.dataTransfer.setDragImage(ghost, 0, 0);
                            setTimeout(() => document.body.removeChild(ghost), 0);
                          }}
                          onDragEnd={() => setDraggingRowIdx(null)}
                          onClick={e => {
                            if (signFlipMode) { handleSignFlipRowClick(rowIdx, e); return; }
                            if (eraserMode) { handleEraserRowClick(rowIdx, e); return; }
                            if (!isHeaderRow) handleRowClick(rowIdx, e);
                          }}>
                          <td className={cn(
                            "sticky left-0 z-10 py-1 px-1 text-center text-muted-foreground/40 text-[10px]",
                            signFlipMode && signFlipSelectedRows.has(rowIdx) ? "bg-warning/20" : eraserMode && eraserSelectedRows.has(rowIdx) ? "bg-destructive/20" : stickyBg,
                          )}>
                            <div className="flex items-center justify-center gap-0.5">
                              {isHeaderRow ? <Columns className="h-3 w-3 text-muted-foreground/50" /> : rowIdx + 1}
                              {isFlipped && !isHeaderRow && (
                                <span className="text-[8px] font-bold text-warning" title="Sign flipped (±)">±</span>
                              )}
                            </div>
                          </td>
                         <td className={cn(
                           "sticky left-8 z-10 py-1 px-2 w-[180px] min-w-[180px] max-w-[180px] font-medium",
                           stickyBg,
                         )} style={{ boxShadow: '2px 0 8px -2px hsl(0 0% 0% / 0.1)' }}>
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              {isMappedRow && !isHeaderRow && (
                                <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                              )}
                              <span className="truncate">{row[0] !== null && row[0] !== undefined ? String(row[0]) : ''}</span>
                              {isHeaderRow && <Badge variant="outline" className="text-[7px] h-3.5 px-1 shrink-0">HEADER</Badge>}
                              {isMappedRow && mappedToField && (
                                <Badge variant="outline" className="text-[8px] h-4 px-1.5 shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                  → {mappedToField[0]}
                                </Badge>
                              )}
                              {isPendingAutoMap && pendingAutoField && !isMappedRow && (
                                <Badge variant="outline" className="text-[8px] h-4 px-1.5 shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-0.5">
                                  <Wand2 className="h-2 w-2" />
                                  → {pendingAutoField[0]}
                                </Badge>
                              )}
                              {hasSuggestion && !isMappedRow && !isPendingAutoMap && (
                                <Badge variant="outline" className={cn(
                                  "text-[8px] h-4 px-1.5 shrink-0",
                                  rowSuggestion.category === 'bs'
                                    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                                )}>
                                  <Sparkles className="h-2 w-2 mr-0.5" />
                                  {rowSuggestion.suggestedField}
                                  <span className="ml-1 opacity-70">{Math.round(rowSuggestion.confidence * 100)}%</span>
                                </Badge>
                              )}
                              {hasSuggestion && !isMappedRow && rowSuggestion.status === 'pending' && (
                                <div className="flex gap-0.5 ml-auto shrink-0">
                                  <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-emerald-500 hover:text-emerald-600" onClick={e => { e.stopPropagation(); handleAcceptSuggestion(rowIdx); }}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); rejectSuggestion(rowIdx); }}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              {hasSuggestion && rowSuggestion.status === 'accepted' && !isMappedRow && (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 ml-auto" />
                              )}
                            </div>
                          </td>
                          {Array.from({ length: Math.min(row.length - 1, 49) }, (_, colIdx) => {
                            const actualCol = colIdx + 1;
                            if (excludedColumns.has(actualCol)) return null;
                            const cellVal = row[actualCol];
                            const isNum = isNumericCell(cellVal);
                            const isColFlipped = flippedColumns.has(actualCol);
                            // Apply flip multiplier for display (row flip XOR column flip)
                            let displayVal = cellVal;
                            const shouldFlip = isFlipped !== isColFlipped; // XOR: flip if one but not both
                            if (shouldFlip && isNum && cellVal !== null && cellVal !== undefined) {
                              const numVal = typeof cellVal === 'number' ? cellVal : parseFloat(String(cellVal).replace(/[,$]/g, ''));
                              if (!isNaN(numVal)) displayVal = -numVal;
                            }
                            return (
                             <td key={actualCol} className={cn(
                               "py-1 px-2 whitespace-nowrap tabular-nums font-sans",
                               isNum ? "text-right" : "text-left",
                                isColFlipped && !signFlipMode && "bg-amber-500/5",
                                signFlipMode && signFlipSelectedCols.has(actualCol) && "bg-amber-500/15",
                              )}>
                                {formatCellValue(displayVal)}
                              </td>
                            );
                          })}
                        </tr>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            <ContextMenuItem onClick={() => handleFlipRows([rowIdx])}>
                              <span className="font-bold mr-2 text-xs">±</span> {isFlipped ? 'Remove Flip' : 'Flip +/− Sign'}
                            </ContextMenuItem>
                            {selectedRows.size > 1 && (
                              <ContextMenuItem onClick={() => handleFlipRows(Array.from(selectedRows))}>
                                <span className="font-bold mr-2 text-xs">±</span> Flip {selectedRows.size} Selected Rows
                              </ContextMenuItem>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-1" />
        {/* Right: Field sidebar */}
        <ResizablePanel
          defaultSize={(() => { try { const s = localStorage.getItem('data-mapping-panel-ratio'); return s ? JSON.parse(s)[1] : 50; } catch { return 50; } })()}
          minSize={25}
        >
          <DataMappingFieldSidebar
            ref={sidebarRef}
            fieldMappings={fieldMappings}
            selectedRows={selectedRows}
            autoMapResults={autoMapResults}
            suggestions={suggestions}
            mappedCount={mappedCount}
            lastSavedCount={lastSavedCount}
            hasUnsavedMappings={hasUnsavedMappings}
            isSaving={isSaving}
            selectedFile={selectedFile}
            activeSheet={activeSheet}
            flashedFields={flashedFields}
            pendingAutoMaps={pendingAutoMaps}
            draggingRowIdx={draggingRowIdx}
            enabledFields={enabledFields}
            onAssignField={handleAssignField}
            onRemoveMapping={handleRemoveMapping}
            onAcceptSuggestion={handleAcceptSuggestion}
            onSaveProgress={handleSaveProgress}
            onClearAllMappings={handleClearAllMappings}
            onDeselectRows={() => setSelectedRows(new Set())}
            onAcceptAutoMap={handleAcceptAutoMap}
            onRejectAutoMap={handleRejectAutoMap}
            onAcceptAllAutoMaps={handleAcceptAllAutoMaps}
            onAutoMap={handleAutoMap}
            onDropAssign={(fieldName, rowIdx) => {
              if (!selectedFile) return;
              const s = selectedFile.sheets[activeSheet];
              const label = String(s.data[rowIdx]?.[0] || `Row ${rowIdx + 1}`);
              const before = { ...fieldMappings };
              setFieldMappings(prev => {
                const next = { ...prev, [fieldName]: [...(prev[fieldName] || []), { sheet: s.name, rowIdx, label }] };
                pushAction({ type: 'assign', description: `${label} → ${fieldName}`, before, after: next });
                return next;
              });
              triggerFlash([rowIdx], fieldName);
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Mapped data preview */}
      {mappedCount > 0 && (
        <Card className="border-border/[0.06] shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Mapped Data Preview</h3>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{mappedCount} field{mappedCount !== 1 ? 's' : ''}</Badge>
                {hasUnsavedMappings && (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">{mappedCount - lastSavedCount} unsaved</Badge>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/[0.06]">
                    <th className="text-left py-1.5 px-3 text-muted-foreground">Field</th>
                    <th className="text-left py-1.5 px-3 text-muted-foreground">Source Row(s)</th>
                    <th className="text-left py-1.5 px-3 text-muted-foreground">Sheet</th>
                    <th className="text-right py-1.5 px-3 text-muted-foreground">Sample Value</th>
                    <th className="text-center py-1.5 px-3 text-muted-foreground">Populates</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fieldMappings).map(([field, mappings], idx) => {
                    const isIS = (IS_FIELDS as readonly string[]).includes(field);
                    return (
                      <tr key={field} className={cn("border-b border-border/[0.04]", idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]")}>
                        <td className="py-1.5 px-3 font-medium">{field}</td>
                        <td className="py-1.5 px-3">{mappings.map(m => m.label).join(', ')}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{mappings[0]?.sheet}</td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums">—</td>
                        <td className="py-1.5 px-3 text-center">
                          <Badge variant="outline" className={cn("text-[8px] h-4 px-1.5",
                            isIS ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-violet-500/10 text-violet-500 border-violet-500/20"
                          )}>
                            {isIS ? 'Income Statement' : 'Balance Sheet'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end mt-3 gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleSaveProgress} disabled={!hasUnsavedMappings || isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Draft
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleRecalculateWithLog} disabled={mappedCount === 0}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Save &amp; Push to Model
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Expanded Excel Preview Dialog */}
      <Dialog open={expandedPreview} onOpenChange={(open) => {
        if (!open) {
          setExpandedPreview(false);
          setShowExpandedSidebar(false);
          if (expandedFileUrl) { URL.revokeObjectURL(expandedFileUrl); setExpandedFileUrl(null); }
        }
      }}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] flex flex-col p-0 bg-secondary/60 backdrop-blur-xl border-border/[0.06]">
          <DialogHeader className="flex-shrink-0 px-4 py-3 border-b border-border/[0.06]">
            <div className="flex items-center justify-between">
              <DialogTitle className="truncate max-w-[500px] text-base">
                {selectedFile?.file.name}
              </DialogTitle>
              <div className="flex items-center gap-1.5">
                {selectedRows.size > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected</Badge>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showExpandedSidebar ? "default" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setShowExpandedSidebar(prev => !prev)}
                    >
                      {showExpandedSidebar ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                      Field Mapping
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showExpandedSidebar ? 'Hide' : 'Show'} field mapping panel</TooltipContent>
                </Tooltip>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setExpandedPreview(false); setShowExpandedSidebar(false); if (expandedFileUrl) { URL.revokeObjectURL(expandedFileUrl); setExpandedFileUrl(null); } }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex">
            {/* Table area */}
            <div className={cn("flex-1 min-w-0 overflow-auto p-2 transition-all", showExpandedSidebar && "border-r border-border/[0.06]")}>
              {selectedFile && (() => {
                const expSheet = selectedFile.sheets[activeSheet];
                if (!expSheet) return null;
                return (
                   <table className="w-max text-[11px] border-collapse">
                   <thead className="sticky top-0 z-20 bg-secondary/60">
                     <tr>
                       <th className="sticky left-0 z-30 w-8 py-1.5 px-1 text-center text-muted-foreground/50 bg-secondary/80">#</th>
                       <th className="sticky left-8 z-30 py-1.5 px-2 text-left text-muted-foreground w-[200px] min-w-[200px] font-semibold bg-secondary/80" style={{ boxShadow: '3px 0 8px -2px hsl(0 0% 0% / 0.15)' }}>Account Name</th>
                        {Array.from({ length: Math.min((expSheet.data[0]?.length || 0) - 1, 49) }, (_, i) => {
                          const colIdx = i + 1;
                          if (excludedColumns.has(colIdx)) return null;
                          const isColFlipped = flippedColumns.has(colIdx);
                          return (
                           <th key={colIdx} className={cn(
                             "py-1.5 px-2 text-right text-muted-foreground/50 min-w-[90px] font-normal",
                              isColFlipped && "bg-amber-500/10",
                            )}>
                              <div className="flex items-center gap-1 justify-end">
                                {isColFlipped && <span className="text-[8px] font-bold text-amber-500">±</span>}
                                <span className="text-[8px] text-muted-foreground/40">
                                  {String.fromCharCode(65 + (colIdx % 26))}{colIdx >= 26 ? String.fromCharCode(65 + Math.floor(colIdx / 26) - 1) : ''}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {expSheet.data.map((row, rowIdx) => {
                        const isFlipped = flippedRows.has(rowIdx);
                        const isSelected = selectedRows.has(rowIdx);
                        return (
                          <tr
                            key={rowIdx}
                           className={cn(
                             "border-b border-border/[0.03] cursor-pointer transition-colors",
                              isSelected
                                ? "bg-primary/10 hover:bg-primary/15"
                                : rowIdx % 2 === 0 ? "bg-transparent hover:bg-muted/10" : "bg-muted/5 hover:bg-muted/15"
                            )}
                            onClick={(e) => {
                              setSelectedRows(prev => {
                                const next = new Set(prev);
                                if (e.shiftKey && lastClickedRowRef.current !== null) {
                                  const start = Math.min(lastClickedRowRef.current, rowIdx);
                                  const end = Math.max(lastClickedRowRef.current, rowIdx);
                                  for (let i = start; i <= end; i++) next.add(i);
                                } else if (e.metaKey || e.ctrlKey) {
                                  next.has(rowIdx) ? next.delete(rowIdx) : next.add(rowIdx);
                                } else {
                                  if (next.has(rowIdx) && next.size === 1) {
                                    next.delete(rowIdx);
                                  } else {
                                    next.clear();
                                    next.add(rowIdx);
                                  }
                                }
                                lastClickedRowRef.current = rowIdx;
                                return next;
                              });
                            }}
                          >
                            <td className={cn(
                              "sticky left-0 z-10 py-1 px-1 text-center text-muted-foreground/40 text-[10px]",
                              isSelected ? "bg-primary/10" : "bg-card"
                            )}>
                              <div className="flex items-center justify-center gap-0.5">
                                {rowIdx + 1}
                                {isFlipped && <span className="text-[8px] font-bold text-amber-500">±</span>}
                              </div>
                            </td>
                           <td className={cn(
                             "sticky left-8 z-10 py-1 px-2 w-[200px] min-w-[200px] font-medium",
                             isSelected ? "bg-primary/10" : "bg-card"
                           )} style={{ boxShadow: '3px 0 8px -2px hsl(0 0% 0% / 0.1)' }}>
                              <span className="truncate">{row[0] !== null && row[0] !== undefined ? String(row[0]) : ''}</span>
                            </td>
                            {Array.from({ length: Math.min(row.length - 1, 49) }, (_, colIdx) => {
                              const actualCol = colIdx + 1;
                              if (excludedColumns.has(actualCol)) return null;
                              const cellVal = row[actualCol];
                              const isNum = isNumericCell(cellVal);
                              const isColFlipped = flippedColumns.has(actualCol);
                              const shouldFlip = isFlipped !== isColFlipped;
                              let displayVal = cellVal;
                              if (shouldFlip && isNum && cellVal !== null && cellVal !== undefined) {
                                const numVal = typeof cellVal === 'number' ? cellVal : parseFloat(String(cellVal).replace(/[,$]/g, ''));
                                if (!isNaN(numVal)) displayVal = -numVal;
                              }
                              return (
                               <td key={actualCol} className={cn(
                                 "py-1 px-2 whitespace-nowrap tabular-nums font-sans",
                                 isNum ? "text-right" : "text-left",
                                 isColFlipped && "bg-amber-500/5",
                                )}>
                                  {formatCellValue(displayVal)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            {/* Field Mapping Drawer */}
            {showExpandedSidebar && (
              <div className="w-[320px] flex-shrink-0 overflow-y-auto bg-card/80 backdrop-blur-sm animate-in slide-in-from-right-5 duration-200">
                <DataMappingFieldSidebar
                  fieldMappings={fieldMappings}
                  selectedRows={selectedRows}
                  autoMapResults={autoMapResults}
                  suggestions={suggestions}
                  mappedCount={mappedCount}
                  lastSavedCount={lastSavedCount}
                  hasUnsavedMappings={hasUnsavedMappings}
                  isSaving={isSaving}
                  selectedFile={selectedFile}
                  activeSheet={activeSheet}
                  flashedFields={flashedFields}
                  pendingAutoMaps={pendingAutoMaps}
                  draggingRowIdx={draggingRowIdx}
                  enabledFields={enabledFields}
                  onAssignField={handleAssignField}
                  onRemoveMapping={handleRemoveMapping}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onSaveProgress={handleSaveProgress}
                  onClearAllMappings={handleClearAllMappings}
                  onDeselectRows={() => setSelectedRows(new Set())}
                  onAcceptAutoMap={handleAcceptAutoMap}
                  onRejectAutoMap={handleRejectAutoMap}
                  onAcceptAllAutoMaps={handleAcceptAllAutoMaps}
                  onAutoMap={handleAutoMap}
                  onDropAssign={(fieldName, rowIdx) => {
                    if (!selectedFile) return;
                    const s = selectedFile.sheets[activeSheet];
                    const label = String(s.data[rowIdx]?.[0] || `Row ${rowIdx + 1}`);
                    const before = { ...fieldMappings };
                    setFieldMappings(prev => {
                      const next = { ...prev, [fieldName]: [...(prev[fieldName] || []), { sheet: s.name, rowIdx, label }] };
                      pushAction({ type: 'assign', description: `${label} → ${fieldName}`, before, after: next });
                      return next;
                    });
                    triggerFlash([rowIdx], fieldName);
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
