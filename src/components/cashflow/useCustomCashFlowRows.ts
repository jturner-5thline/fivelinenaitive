import { useCallback, useEffect, useState } from 'react';

export interface CustomCashFlowRows {
  receipts: string[];
  disbursements: string[];
}

const EMPTY: CustomCashFlowRows = { receipts: [], disbursements: [] };

function storageKey(companyId: string | null | undefined): string | null {
  if (!companyId) return null;
  return `cf:customRows:${companyId}`;
}

function readStorage(companyId: string | null | undefined): CustomCashFlowRows {
  const key = storageKey(companyId);
  if (!key || typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      receipts: Array.isArray(parsed?.receipts) ? parsed.receipts.filter((s: any) => typeof s === 'string') : [],
      disbursements: Array.isArray(parsed?.disbursements) ? parsed.disbursements.filter((s: any) => typeof s === 'string') : [],
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Per-company custom row labels for the Weekly Report Cash Receipts /
 * Cash Disbursements sections. Persisted to localStorage so they survive
 * reloads. Names double as the category key for scheduled entries.
 */
export function useCustomCashFlowRows(companyId: string | null | undefined) {
  const [rows, setRows] = useState<CustomCashFlowRows>(() => readStorage(companyId));

  useEffect(() => {
    setRows(readStorage(companyId));
  }, [companyId]);

  const persist = useCallback(
    (next: CustomCashFlowRows) => {
      const key = storageKey(companyId);
      if (key && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore quota / serialization errors */
        }
      }
      setRows(next);
    },
    [companyId],
  );

  const addRow = useCallback(
    (section: 'receipts' | 'disbursements', name: string): boolean => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const current = rows[section];
      // Case-insensitive duplicate guard
      if (current.some((r) => r.toLowerCase() === trimmed.toLowerCase())) return false;
      persist({ ...rows, [section]: [...current, trimmed] });
      return true;
    },
    [rows, persist],
  );

  const removeRow = useCallback(
    (section: 'receipts' | 'disbursements', name: string) => {
      persist({ ...rows, [section]: rows[section].filter((r) => r !== name) });
    },
    [rows, persist],
  );

  return { rows, addRow, removeRow };
}