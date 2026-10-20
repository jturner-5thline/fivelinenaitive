// Pure helpers for the header omni-search: ranking and local matching.
export type OmniKind = 'deal' | 'contact' | 'company' | 'lender' | 'page';

export interface OmniResult {
  kind: OmniKind;
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  path: string;
}

/** Score a candidate text against a query: prefix > word-start > contains. 0 = no match. */
export function scoreMatch(text: string | null | undefined, query: string): number {
  const t = (text ?? '').toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (!t || !q) return 0;
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s\-_.@&,/()]+/).some((w) => w.startsWith(q))) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

/** Best score across several fields. */
export function bestScore(fields: Array<string | null | undefined>, query: string): number {
  return fields.reduce((m, f) => Math.max(m, scoreMatch(f, query)), 0);
}

/** Return the top `limit` items with a positive score, best first (stable). */
export function rankTop<T>(items: T[], getFields: (i: T) => Array<string | null | undefined>, query: string, limit: number): T[] {
  if (!query.trim()) return [];
  return items
    .map((item, idx) => ({ item, idx, s: bestScore(getFields(item), query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .slice(0, limit)
    .map((x) => x.item);
}

/** Escape characters that would break a PostgREST `or=(...ilike...)` filter. */
export function sanitizeIlike(q: string): string {
  return q.replace(/[%_,()*\\]/g, ' ').trim();
}
