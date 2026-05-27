import { useCallback, useRef, useState } from 'react';

export interface UndoAction {
  /** Short human-readable label used in the confirmation toast. */
  label: string;
  /** Async or sync function that reverses the original action. */
  undo: () => void | Promise<void>;
}

/**
 * In-memory LIFO stack of reversible actions (cap = 20). Used by the My Tasks
 * panel for its Undo button + Ctrl/Cmd+Z shortcut.
 *
 * `recent` is exposed as state so consumers (e.g. an Undo button) can disable
 * themselves when the stack is empty.
 */
export function useUndoStack(limit = 20) {
  const stackRef = useRef<UndoAction[]>([]);
  const [size, setSize] = useState(0);

  const push = useCallback((action: UndoAction) => {
    stackRef.current.push(action);
    if (stackRef.current.length > limit) stackRef.current.shift();
    setSize(stackRef.current.length);
  }, [limit]);

  const pop = useCallback((): UndoAction | null => {
    const a = stackRef.current.pop() ?? null;
    setSize(stackRef.current.length);
    return a;
  }, []);

  const clear = useCallback(() => {
    stackRef.current = [];
    setSize(0);
  }, []);

  return { push, pop, clear, size, canUndo: size > 0 };
}