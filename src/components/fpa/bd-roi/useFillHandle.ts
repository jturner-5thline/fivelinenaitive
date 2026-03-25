import { useState, useCallback, useRef, useEffect } from 'react';
import type { CellConfig } from './useCellConfig';
import type { TableSection } from './BDFinancialTable';

export interface FillTarget {
  rowKey: string;
  colIdx: number;
  colKey: string;
}

export interface FillHandleState {
  /** The source cell the fill started from */
  source: { rowKey: string; colIdx: number; colKey: string } | null;
  /** Currently highlighted target cells (excludes source) */
  targets: FillTarget[];
  /** Is the user actively dragging? */
  isDragging: boolean;
}

/**
 * Adjust a formula's row_key references when filling vertically.
 * Given the ordered list of all row keys from sections, shift each
 * row_key token by `rowOffset` positions in that list.
 */
export function adjustFormulaForOffset(
  formula: string,
  sections: TableSection[],
  rowOffset: number,
  _colOffset: number,
): string {
  if (rowOffset === 0) return formula;

  // Build ordered list of row keys
  const allRowKeys: string[] = [];
  for (const section of sections) {
    for (const row of section.rows) {
      allRowKeys.push(row.key);
    }
  }

  const keyIndex = new Map(allRowKeys.map((k, i) => [k, i]));

  // Tokenize and replace row_key identifiers with shifted ones
  const tokens = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/().\s]|[0-9]+(?:\.[0-9]+)?/g);
  if (!tokens) return formula;

  return tokens.map(token => {
    if (/^[a-zA-Z_]/.test(token)) {
      const idx = keyIndex.get(token);
      if (idx !== undefined) {
        const newIdx = idx + rowOffset;
        if (newIdx >= 0 && newIdx < allRowKeys.length) {
          return allRowKeys[newIdx];
        }
      }
    }
    return token;
  }).join('');
}

export function useFillHandle(
  sections: TableSection[],
  quarters: string[],
  visibleIndices: number[],
) {
  const [state, setState] = useState<FillHandleState>({
    source: null,
    targets: [],
    isDragging: false,
  });

  // Track which cell the mouse is currently over
  const currentHoverRef = useRef<{ rowKey: string; colIdx: number } | null>(null);

  const startDrag = useCallback((rowKey: string, colIdx: number, colKey: string) => {
    setState({
      source: { rowKey, colIdx, colKey },
      targets: [],
      isDragging: true,
    });
  }, []);

  const updateDrag = useCallback((hoverRowKey: string, hoverColIdx: number) => {
    setState(prev => {
      if (!prev.isDragging || !prev.source) return prev;

      const { source } = prev;
      const targets: FillTarget[] = [];

      // Build row key order
      const allRowKeys: string[] = [];
      for (const section of sections) {
        for (const row of section.rows) {
          allRowKeys.push(row.key);
        }
      }

      const sourceRowIdx = allRowKeys.indexOf(source.rowKey);
      const hoverRowIdx = allRowKeys.indexOf(hoverRowKey);

      // Determine if dragging horizontally or vertically (whichever axis has more movement)
      const rowDist = Math.abs(hoverRowIdx - sourceRowIdx);
      const colDist = Math.abs(hoverColIdx - source.colIdx);

      if (colDist >= rowDist) {
        // Horizontal fill — same row, across columns
        const minCol = Math.min(source.colIdx, hoverColIdx);
        const maxCol = Math.max(source.colIdx, hoverColIdx);
        for (let c = minCol; c <= maxCol; c++) {
          if (c === source.colIdx) continue;
          const origIdx = visibleIndices[c];
          const colKey = quarters[origIdx] ?? '';
          targets.push({ rowKey: source.rowKey, colIdx: c, colKey });
        }
      } else {
        // Vertical fill — same column, across rows
        const minRow = Math.min(sourceRowIdx, hoverRowIdx);
        const maxRow = Math.max(sourceRowIdx, hoverRowIdx);
        for (let r = minRow; r <= maxRow; r++) {
          if (r === sourceRowIdx) continue;
          if (r < 0 || r >= allRowKeys.length) continue;
          const origIdx = visibleIndices[source.colIdx];
          const colKey = quarters[origIdx] ?? '';
          targets.push({ rowKey: allRowKeys[r], colIdx: source.colIdx, colKey });
        }
      }

      return { ...prev, targets };
    });
  }, [sections, quarters, visibleIndices]);

  const endDrag = useCallback((): { source: FillHandleState['source']; targets: FillTarget[] } | null => {
    const result = state.isDragging && state.source && state.targets.length > 0
      ? { source: state.source, targets: state.targets }
      : null;
    setState({ source: null, targets: [], isDragging: false });
    return result;
  }, [state]);

  const cancelDrag = useCallback(() => {
    setState({ source: null, targets: [], isDragging: false });
  }, []);

  const isFillTarget = useCallback((rowKey: string, colIdx: number): boolean => {
    return state.targets.some(t => t.rowKey === rowKey && t.colIdx === colIdx);
  }, [state.targets]);

  const isSource = useCallback((rowKey: string, colIdx: number): boolean => {
    return state.source?.rowKey === rowKey && state.source?.colIdx === colIdx;
  }, [state.source]);

  return {
    fillState: state,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    isFillTarget,
    isSource,
  };
}
