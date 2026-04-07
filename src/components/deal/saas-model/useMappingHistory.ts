import { useState, useCallback, useRef } from 'react';
import type { FieldMapping } from './types';

/**
 * Full snapshot of the mapping session state.
 * Every undoable action captures before/after snapshots of ALL of this.
 */
export interface MappingSnapshot {
  sheetData: (string | number)[][];
  fieldMappings: Record<string, FieldMapping[]>;
  selectedRows: number[];
  selectedColumns: number[];
  excludedColumns: number[];
  flippedRows: number[];
  flippedColumns: number[];
}

export type MappingActionType =
  | 'map-field'
  | 'unmap-field'
  | 'bulk-assign'
  | 'delete-rows'
  | 'delete-columns'
  | 'delete-rows-columns'
  | 'flip-sign'
  | 'reset-all'
  | 'auto-map'
  | 'accept-auto'
  | 'accept-all-auto'
  | 'accept-suggestion'
  | 'accept-all-suggestions'
  | 'clear-all';

export interface HistoryEntry {
  type: MappingActionType;
  description: string;
  before: MappingSnapshot;
  after: MappingSnapshot;
  timestamp: number;
}

const MAX_HISTORY = 50;

function cloneSnapshot(s: MappingSnapshot): MappingSnapshot {
  return structuredClone(s);
}

export function useMappingHistory() {
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const pushEntry = useCallback((entry: HistoryEntry) => {
    setUndoStack(prev => [...prev.slice(-(MAX_HISTORY - 1)), entry]);
    setRedoStack([]);
  }, []);

  const peekUndo = useCallback((): HistoryEntry | null => {
    return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
  }, [undoStack]);

  const peekRedo = useCallback((): HistoryEntry | null => {
    return redoStack.length > 0 ? redoStack[redoStack.length - 1] : null;
  }, [redoStack]);

  const popUndo = useCallback((): HistoryEntry | null => {
    if (undoStack.length === 0) return null;
    const entry = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, entry]);
    return entry;
  }, [undoStack]);

  const popRedo = useCallback((): HistoryEntry | null => {
    if (redoStack.length === 0) return null;
    const entry = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, entry]);
    return entry;
  }, [redoStack]);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    canUndo,
    canRedo,
    pushEntry,
    popUndo,
    popRedo,
    peekUndo,
    peekRedo,
    clearHistory,
  };
}
