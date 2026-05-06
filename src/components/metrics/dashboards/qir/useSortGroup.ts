import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc' | null;

export interface SortGroupColumn<T> {
  /** stable id matching column header */
  id: string;
  label: string;
  /** value used for sorting + grouping; return string|number|null */
  accessor: (row: T) => string | number | null | undefined;
  /** true if this column should be available in the Group-By picker */
  groupable?: boolean;
  /** true if this column should be sortable */
  sortable?: boolean;
}

export interface UseSortGroupOptions<T> {
  rows: T[];
  columns: SortGroupColumn<T>[];
  defaultSortBy?: string | null;
  defaultSortDir?: SortDir;
  defaultGroupBy?: string | null;
}

export interface SortGroupResult<T> {
  sortBy: string | null;
  sortDir: SortDir;
  groupBy: string | null;
  setSortBy: (id: string | null) => void;
  setSortDir: (d: SortDir) => void;
  setGroupBy: (id: string | null) => void;
  /** Cycles asc → desc → null for the same column, or sets to asc if new column. */
  toggleSort: (id: string) => void;
  /** Final ordered + sorted rows (no grouping applied). */
  sortedRows: T[];
  /** Groups: array of { key, rows }. When no grouping, single group with key=''. */
  groups: Array<{ key: string; rows: T[] }>;
  /** Sort direction indicator for a column id, or null. */
  indicator: (id: string) => '' | ' ▲' | ' ▼';
}

function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function useSortGroup<T>({
  rows,
  columns,
  defaultSortBy = null,
  defaultSortDir = 'asc',
  defaultGroupBy = null,
}: UseSortGroupOptions<T>): SortGroupResult<T> {
  const [sortBy, setSortBy] = useState<string | null>(defaultSortBy);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [groupBy, setGroupBy] = useState<string | null>(defaultGroupBy);

  const colMap = useMemo(() => {
    const m: Record<string, SortGroupColumn<T>> = {};
    for (const c of columns) m[c.id] = c;
    return m;
  }, [columns]);

  const toggleSort = (id: string) => {
    if (sortBy !== id) { setSortBy(id); setSortDir('asc'); return; }
    if (sortDir === 'asc') { setSortDir('desc'); return; }
    if (sortDir === 'desc') { setSortBy(null); setSortDir(null); return; }
    setSortDir('asc');
  };

  const sortedRows = useMemo(() => {
    if (!sortBy || !sortDir || !colMap[sortBy]) return rows;
    const acc = colMap[sortBy].accessor;
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareValues(acc(a), acc(b));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortBy, sortDir, colMap]);

  const groups = useMemo(() => {
    if (!groupBy || !colMap[groupBy]) return [{ key: '', rows: sortedRows }];
    const acc = colMap[groupBy].accessor;
    const map = new Map<string, T[]>();
    for (const r of sortedRows) {
      const raw = acc(r);
      const key = raw === null || raw === undefined || raw === '' ? '—' : String(raw);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
      .map(([key, rs]) => ({ key, rows: rs }));
  }, [sortedRows, groupBy, colMap]);

  const indicator = (id: string): '' | ' ▲' | ' ▼' =>
    sortBy === id && sortDir === 'asc' ? ' ▲' : sortBy === id && sortDir === 'desc' ? ' ▼' : '';

  return { sortBy, sortDir, groupBy, setSortBy, setSortDir, setGroupBy, toggleSort, sortedRows, groups, indicator };
}