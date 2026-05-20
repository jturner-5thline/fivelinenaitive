import type { LenderSyncRequest } from '@/hooks/useLenderSyncRequests';

export type RequestConfidence = 'exact-duplicate' | 'likely-duplicate' | 'possible-conflict' | 'needs-review' | 'none';

export interface ConfidenceMeta {
  level: RequestConfidence;
  label: string;
  className: string;
}

/**
 * Classify a single sync request for the confidence-badge UI.
 * - Exact duplicate: merge conflict with no actual field differences
 * - Likely duplicate: merge conflict with ≤2 differing fields
 * - Possible conflict: merge conflict with >2 differing fields
 * - Needs review: new_lender whose name matched an existing directory entry
 */
export function getRequestConfidence(req: LenderSyncRequest): ConfidenceMeta {
  if (req.request_type === 'merge_conflict') {
    const diffCount = req.changes_diff ? Object.keys(req.changes_diff).length : 0;
    if (diffCount === 0) {
      return { level: 'exact-duplicate', label: 'Exact duplicate', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' };
    }
    if (diffCount <= 2) {
      return { level: 'likely-duplicate', label: 'Likely duplicate', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40' };
    }
    return { level: 'possible-conflict', label: 'Possible conflict', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40' };
  }
  if (req.request_type === 'new_lender' && req.existing_lender_name) {
    return { level: 'needs-review', label: 'Needs review', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40' };
  }
  return { level: 'none', label: '', className: '' };
}

// Strip common legal suffixes/filler so "Flexent LLC" and "Flexent, L.L.C." collapse.
const LEGAL_SUFFIXES =
  /\b(llc|l\s?l\s?c|inc|incorporated|corp|corporation|co|company|ltd|limited|llp|lp|gp|group|holdings|capital|partners|fund|funding|management|advisors|investments|investment|the)\b/g;

export function normalizeLenderName(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sorensen–Dice over character bigrams. Cheap, good for short brand names.
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) {
      const bg = padded.slice(i, i + 2);
      out.set(bg, (out.get(bg) || 0) + 1);
    }
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [k, v] of A) {
    const other = B.get(k);
    if (other) inter += Math.min(v, other);
  }
  const total =
    Array.from(A.values()).reduce((s, v) => s + v, 0) +
    Array.from(B.values()).reduce((s, v) => s + v, 0);
  return total > 0 ? (2 * inter) / total : 0;
}

export interface RequestGroup {
  key: string;
  displayName: string;
  members: LenderSyncRequest[];
  /** true when 2+ records collapsed into this group */
  isDuplicate: boolean;
  /** how the duplicates were detected */
  confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
}

/**
 * Group sync requests by normalized lender name, alias overlap, and high-confidence
 * fuzzy match (Dice ≥ 0.92). Preserves original ordering of the first member of each group.
 */
export function groupSyncRequests(requests: LenderSyncRequest[]): RequestGroup[] {
  // Pre-compute keys per request: primary normalized name + alias normalized keys.
  type Entry = {
    req: LenderSyncRequest;
    primary: string;
    keys: Set<string>;
    originalIndex: number;
  };
  const entries: Entry[] = requests.map((req, i) => {
    const data = (req.incoming_data || {}) as Record<string, unknown>;
    const name = data.name as string | undefined;
    const aliases = Array.isArray(data.aliases) ? (data.aliases as unknown[]) : [];
    const keys = new Set<string>();
    const primary = normalizeLenderName(name) || req.id;
    if (primary) keys.add(primary);
    for (const a of aliases) {
      const k = normalizeLenderName(String(a));
      if (k) keys.add(k);
    }
    // Also fold in the matched existing lender name as a candidate alias.
    if (req.existing_lender_name) {
      const k = normalizeLenderName(req.existing_lender_name);
      if (k) keys.add(k);
    }
    return { req, primary, keys, originalIndex: i };
  });

  // Union-find for collapsing groups.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let p = parent.get(x) ?? x;
    if (p === x) return x;
    p = find(p);
    parent.set(x, p);
    return p;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  entries.forEach((_, i) => parent.set(i, i));

  // 1. Exact / alias overlap.
  const keyToIndex = new Map<string, number>();
  entries.forEach((e, i) => {
    for (const k of e.keys) {
      if (keyToIndex.has(k)) union(keyToIndex.get(k)!, i);
      else keyToIndex.set(k, i);
    }
  });

  // 2. High-confidence fuzzy on primary names (O(n²) is fine for queue sizes).
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (find(i) === find(j)) continue;
      const ai = entries[i].primary;
      const aj = entries[j].primary;
      if (!ai || !aj) continue;
      if (nameSimilarity(ai, aj) >= 0.92) union(i, j);
    }
  }

  // Collect groups preserving order of first-seen member.
  const groupsMap = new Map<number, Entry[]>();
  const orderRoots: number[] = [];
  entries.forEach((e, i) => {
    const r = find(i);
    if (!groupsMap.has(r)) {
      groupsMap.set(r, []);
      orderRoots.push(r);
    }
    groupsMap.get(r)!.push(e);
  });

  return orderRoots.map((root) => {
    const arr = groupsMap.get(root)!.sort((a, b) => a.originalIndex - b.originalIndex);
    const members = arr.map((e) => e.req);
    const display =
      ((members[0].incoming_data as Record<string, unknown>)?.name as string) ||
      members[0].existing_lender_name ||
      arr[0].primary ||
      'Unknown lender';

    // Confidence classification
    let confidence: RequestGroup['confidence'] = 'none';
    if (members.length > 1) {
      const primaries = arr.map((e) => e.primary).filter(Boolean);
      const allEqual = primaries.every((p) => p === primaries[0]);
      if (allEqual) confidence = 'exact';
      else {
        // Did alias-overlap drive the union? If any pair shares a key but primaries differ → alias.
        const allKeys = arr.map((e) => e.keys);
        let aliasHit = false;
        outer: for (let i = 0; i < allKeys.length; i++) {
          for (let j = i + 1; j < allKeys.length; j++) {
            for (const k of allKeys[i]) {
              if (allKeys[j].has(k)) { aliasHit = true; break outer; }
            }
          }
        }
        confidence = aliasHit ? 'alias' : 'fuzzy';
      }
    }

    return {
      key: arr[0].primary || `g-${root}`,
      displayName: display,
      members,
      isDuplicate: members.length > 1,
      confidence,
    };
  });
}
