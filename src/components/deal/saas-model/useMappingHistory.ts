import { useState, useCallback, useRef } from 'react';
import type { FieldMapping } from './types';

export interface EraserSnapshot {
  sheetData: string[][];
  selectedColumns: Set<number>;
  excludedColumns: Set<number>;
  flippedColumns: Set<number>;
  selectedRows: Set<number>;
  flippedRows: Set<number>;
  fieldMappings: Record<string, FieldMapping[]>;
}

export interface MappingAction {
  type: 'assign' | 'remove' | 'bulk-assign' | 'bulk-remove' | 'clear-all' | 'accept-auto' | 'accept-all-auto' | 'eraser-delete';
  description: string;
  before: Record<string, FieldMapping[]>;
  after: Record<string, FieldMapping[]>;
  eraserBefore?: EraserSnapshot;
  eraserAfter?: EraserSnapshot;
}

export function useMappingHistory() {
  const [undoStack, setUndoStack] = useState<MappingAction[]>([]);
  const [redoStack, setRedoStack] = useState<MappingAction[]>([]);

  const pushAction = useCallback((action: MappingAction) => {
    setUndoStack(prev => [...prev.slice(-49), action]);
    setRedoStack([]);
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const peekUndo = useCallback((): MappingAction | null => {
    return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
  }, [undoStack]);

  const peekRedo = useCallback((): MappingAction | null => {
    return redoStack.length > 0 ? redoStack[redoStack.length - 1] : null;
  }, [redoStack]);

  const popUndo = useCallback((): MappingAction | null => {
    if (undoStack.length === 0) return null;
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, action]);
    return action;
  }, [undoStack]);

  const popRedo = useCallback((): MappingAction | null => {
    if (redoStack.length === 0) return null;
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, action]);
    return action;
  }, [redoStack]);

  return { undoStack, redoStack, canUndo, canRedo, pushAction, popUndo, popRedo, peekUndo, peekRedo };
}
