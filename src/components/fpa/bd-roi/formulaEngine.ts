import type { TableSection } from './BDFinancialTable';

/**
 * Resolve a formula string like "revDebt + revFinServ + revOther"
 * by looking up each token as a row_key and reading the value at colIdx.
 */
export function resolveFormula(
  formula: string,
  sections: TableSection[],
  colIdx: number,
): number | null {
  if (!formula.trim()) return null;

  // Build a lookup map of row_key → value at colIdx
  const rowValues = new Map<string, number>();
  for (const section of sections) {
    for (const row of section.rows) {
      const val = row.values[colIdx];
      rowValues.set(row.key, val ?? 0);
    }
  }

  try {
    // Tokenize: split on operators and whitespace, keeping operators
    const tokens = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/().]|[0-9]+(?:\.[0-9]+)?/g);
    if (!tokens) return null;

    // Replace row_key references with their numeric values
    const expression = tokens.map(token => {
      if (/^[a-zA-Z_]/.test(token)) {
        const val = rowValues.get(token);
        if (val === undefined) return '0';
        return val.toString();
      }
      return token;
    }).join(' ');

    // Safe eval: only allow numbers, operators, parens, whitespace
    if (/[^0-9+\-*/().eE\s]/.test(expression)) return null;

    // eslint-disable-next-line no-eval
    const result = Function(`"use strict"; return (${expression})`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Convert a row_key into a human-friendly reference label.
 * e.g. "revDebt" → "Revenue_Debt" based on the row label.
 */
export function rowKeyToRefLabel(rowKey: string, sections: TableSection[]): string {
  for (const section of sections) {
    for (const row of section.rows) {
      if (row.key === rowKey) {
        return row.label.replace(/[:\s—–-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      }
    }
  }
  return rowKey;
}

/**
 * Convert a reference label back to row_key.
 * e.g. "Revenue_Debt" → "revDebt"
 */
export function refLabelToRowKey(refLabel: string, sections: TableSection[]): string | null {
  for (const section of sections) {
    for (const row of section.rows) {
      const label = row.label.replace(/[:\s—–-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (label === refLabel) return row.key;
    }
  }
  return null;
}

/**
 * Convert a formula with display labels to internal row_keys.
 * e.g. "Revenue_Debt + Revenue_FinServ" → "revDebt + revFinServ"
 */
export function displayFormulaToInternal(displayFormula: string, sections: TableSection[]): string {
  // Build a map of display label → row key
  const labelToKey = new Map<string, string>();
  for (const section of sections) {
    for (const row of section.rows) {
      const label = row.label.replace(/[:\s—–-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      labelToKey.set(label, row.key);
    }
  }

  // Sort by length descending to match longest labels first
  const sorted = Array.from(labelToKey.entries()).sort((a, b) => b[0].length - a[0].length);

  let result = displayFormula;
  for (const [label, key] of sorted) {
    result = result.replaceAll(label, key);
  }
  return result;
}

/**
 * Convert an internal formula to display labels.
 * e.g. "revDebt + revFinServ" → "Revenue_Debt + Revenue_FinServ"
 */
export function internalFormulaToDisplay(internalFormula: string, sections: TableSection[]): string {
  const keyToLabel = new Map<string, string>();
  for (const section of sections) {
    for (const row of section.rows) {
      const label = row.label.replace(/[:\s—–-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      keyToLabel.set(row.key, label);
    }
  }

  // Sort by length descending to match longest keys first
  const sorted = Array.from(keyToLabel.entries()).sort((a, b) => b[0].length - a[0].length);

  let result = internalFormula;
  for (const [key, label] of sorted) {
    // Word boundary match
    result = result.replace(new RegExp(`\\b${key}\\b`, 'g'), label);
  }
  return result;
}
