// Per-column filters for the Funding Source Directory pop-up.
export type DirectoryStatusFilter = 'on' | 'off' | null;

export interface DirectoryColumnFilters {
  name: string;
  checkSize: number | null; // deal amount the lender must be able to fund
  structure: string[];
  geo: string[];
  industries: string[];
  status: DirectoryStatusFilter;
}

export const EMPTY_DIRECTORY_FILTERS: DirectoryColumnFilters = {
  name: '', checkSize: null, structure: [], geo: [], industries: [], status: null,
};

export interface DirectoryFilterable {
  name: string;
  min_deal?: number | null;
  max_deal?: number | null;
  loan_types?: unknown;
  geo?: unknown;
  industries?: unknown;
}

export function toValueList(value: unknown): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value.map(String) : String(value).split(',');
  return raw.map(s => s.trim()).filter(Boolean);
}

export function countActiveColumnFilters(f: DirectoryColumnFilters): number {
  return (f.name.trim() ? 1 : 0) + (f.checkSize != null ? 1 : 0) + (f.structure.length ? 1 : 0)
    + (f.geo.length ? 1 : 0) + (f.industries.length ? 1 : 0) + (f.status ? 1 : 0);
}

function matchesAny(values: unknown, wanted: string[]): boolean {
  if (!wanted.length) return true;
  const have = new Set(toValueList(values).map(v => v.toLowerCase()));
  return wanted.some(w => have.has(w.toLowerCase()));
}

export function fitsCheckSize(l: DirectoryFilterable, amount: number | null): boolean {
  if (amount == null) return true;
  const min = l.min_deal ?? null;
  const max = l.max_deal ?? null;
  if (min == null && max == null) return false;
  return (min == null || min <= amount) && (max == null || max >= amount);
}

export function applyDirectoryColumnFilters<T extends DirectoryFilterable>(
  lenders: T[], f: DirectoryColumnFilters, isOnDeal: (l: T) => boolean,
): T[] {
  const q = f.name.trim().toLowerCase();
  return lenders.filter(l =>
    (!q || l.name.toLowerCase().includes(q))
    && fitsCheckSize(l, f.checkSize)
    && matchesAny(l.loan_types, f.structure)
    && matchesAny(l.geo, f.geo)
    && matchesAny(l.industries, f.industries)
    && (f.status == null || (f.status === 'on') === isOnDeal(l)));
}

export function distinctColumnValues(lenders: DirectoryFilterable[], key: 'loan_types' | 'geo' | 'industries'): string[] {
  const seen = new Map<string, string>();
  for (const l of lenders) for (const v of toValueList(l[key])) {
    const k = v.toLowerCase();
    if (!seen.has(k)) seen.set(k, v);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
