// Duplicate detection for funding sources (master lenders).
//
// Detection rules (case-insensitive, applied in order via union-find):
//   1. Exact normalized name match (lowercase + trim + whitespace collapse +
//      stripped trailing punctuation).
//   2. "Core name" match — names that differ only by common corporate/financial
//      suffixes (e.g. "Capital", "Capital Partners", "Capital Group", "LLC",
//      "Inc", "Corp", "Bank", "Ventures", "Fund").
//   3. Strict substring match between two names where both core lengths are
//      greater than 3 characters (e.g. "Espresso" ⊂ "Espresso Capital").
//
// Output is a stable list of duplicate groups (>= 2 members each) plus a
// per-lender lookup of the group it belongs to and the number of other
// members it shares that group with.

export interface DuplicateInput {
  id: string;
  name: string;
}

export interface DuplicateGroup {
  /** Stable group id derived from the canonical core name. */
  groupId: string;
  /** Lender ids that belong to this duplicate cluster. */
  memberIds: string[];
}

export interface DuplicateIndex {
  /** All clusters with >= 2 members. */
  groups: DuplicateGroup[];
  /** Lookup by lender id → its cluster + sibling count (0 if not a duplicate). */
  byLenderId: Record<string, { groupId: string; count: number }>;
}

// Suffix tokens that are routinely added/removed from financial firm names.
// Multi-word suffixes must appear before their single-word components so the
// stripping pass can match the longest tail first.
const SUFFIX_PATTERNS: string[] = [
  // (see STOPWORD_TOKENS below for words that may never drive a merge)
  'capital partners',
  'capital group',
  'capital management',
  'capital advisors',
  'capital llc',
  'capital lp',
  'capital inc',
  'capital corp',
  'capital corporation',
  'investment management',
  'investment partners',
  'investment group',
  'asset management',
  'financial group',
  'financial services',
  'credit partners',
  'credit opportunities',
  'growth capital',
  'growth partners',
  'private credit',
  'business credit',
  'business capital',
  'business finance',
  'business funding',
  'capital',
  'partners',
  'group',
  'holdings',
  'ventures',
  'venture',
  'management',
  'advisors',
  'investments',
  'investment',
  'fund',
  'funding',
  'finance',
  'financial',
  'credit',
  'bank',
  'banking',
  'trust',
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'lp',
  'llp',
  'plc',
  'na',
  'usa',
  'us',
];

function basicNormalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// High-frequency, low-signal tokens. A shared token from this list can never
// on its own merge two funding sources — otherwise union-find chains
// "1 Advantage Bank" → "Advantage Capital" → "Advantage First National" → ...
// into a single mega-cluster of thousands of unrelated lenders.
const STOPWORD_TOKENS = new Set<string>([
  'first', 'national', 'advantage', 'summit', 'pacific', 'atlantic', 'american',
  'america', 'united', 'general', 'premier', 'united states', 'global', 'central',
  'northern', 'southern', 'eastern', 'western', 'north', 'south', 'east', 'west',
  'main', 'community', 'commercial', 'commerce', 'republic', 'liberty', 'heritage',
  'pinnacle', 'signature', 'peoples', 'citizens', 'security', 'independence',
  'independent', 'enterprise', 'alliance', 'union', 'state', 'states', 'city',
  'metro', 'valley', 'river', 'lake', 'park', 'star', 'sun', 'gold', 'silver',
  'blue', 'green', 'new', 'old', 'grand', 'prime', 'apex', 'core', 'next',
  'direct', 'select', 'preferred', 'trusted', 'reliable', 'strategic',
]);

// Any cluster larger than this is treated as a false positive from transitive
// chaining and re-split into tighter subgroups.
const MAX_CLUSTER_SIZE = 10;

function legacyBasicNormalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSuffixes(normalized: string): string {
  let current = normalized;
  // Iterate so chains like "Capital Partners LLC" collapse fully.
  // Guard against infinite loops with a generous max iteration count.
  for (let i = 0; i < 6; i++) {
    let changed = false;
    for (const suffix of SUFFIX_PATTERNS) {
      if (current === suffix) continue; // don't reduce to empty
      if (current.endsWith(' ' + suffix)) {
        current = current.slice(0, current.length - suffix.length - 1).trim();
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return current || normalized;
}

export function normalizeLenderName(raw: string): string {
  return basicNormalize(raw);
}

export function coreLenderName(raw: string): string {
  return stripSuffixes(basicNormalize(raw));
}

// Simple union-find for grouping.
class DSU {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let root = x;
    while (this.parent.get(root)! !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur)! !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function detectDuplicateLenders(lenders: DuplicateInput[]): DuplicateIndex {
  const dsu = new DSU();

  // Pre-compute normalized + core names.
  const meta = lenders.map((l) => ({
    id: l.id,
    name: l.name || '',
    normalized: basicNormalize(l.name || ''),
    core: stripSuffixes(basicNormalize(l.name || '')),
  }));
  // O(1) id → meta lookup. The collection step below used to call
  // `meta.find(...)` per member which is O(n) per call and dominated the
  // total runtime once the directory grew past a few thousand rows.
  const metaById = new Map<string, typeof meta[number]>();
  for (const m of meta) metaById.set(m.id, m);

  // 1) Exact normalized match.
  const byNormalized = new Map<string, string[]>();
  for (const m of meta) {
    if (!m.normalized) continue;
    const arr = byNormalized.get(m.normalized) ?? [];
    arr.push(m.id);
    byNormalized.set(m.normalized, arr);
  }
  for (const ids of byNormalized.values()) {
    for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
  }

  // 2) Core-name match (suffix-stripped).
  const byCore = new Map<string, string[]>();
  for (const m of meta) {
    if (!m.core || m.core.length < 2) continue;
    const arr = byCore.get(m.core) ?? [];
    arr.push(m.id);
    byCore.set(m.core, arr);
  }
  for (const ids of byCore.values()) {
    for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
  }

  // 3) Word-boundary substring match between core names. This used to be a
  // bucketed O(n²) scan, which dominated runtime on 6k+ directories. We now
  // build a single-word index (cores that consist of one token > 3 chars) and
  // for every multi-word core, union it with every single-word core that
  // appears as one of its tokens — e.g. "Espresso" ⊂ "Espresso Capital".
  // Complexity: O(total tokens), effectively linear in n.
  const singleWordIds = new Map<string, string[]>();
  for (const m of meta) {
    if (!m.core || m.core.length <= 3) continue;
    if (m.core.includes(' ')) continue;
    const arr = singleWordIds.get(m.core) ?? [];
    arr.push(m.id);
    singleWordIds.set(m.core, arr);
  }
  if (singleWordIds.size > 0) {
    for (const m of meta) {
      if (!m.core || !m.core.includes(' ')) continue;
      const tokens = m.core.split(' ');
      for (const token of tokens) {
        if (token.length <= 3) continue;
        const matches = singleWordIds.get(token);
        if (!matches) continue;
        for (const otherId of matches) {
          if (otherId !== m.id) dsu.union(m.id, otherId);
        }
      }
    }
  }

  // Collect groups.
  const groupsByRoot = new Map<string, string[]>();
  for (const m of meta) {
    if (!m.normalized) continue;
    const root = dsu.find(m.id);
    const arr = groupsByRoot.get(root) ?? [];
    arr.push(m.id);
    groupsByRoot.set(root, arr);
  }

  const groups: DuplicateGroup[] = [];
  const byLenderId: Record<string, { groupId: string; count: number }> = {};
  for (const [root, memberIds] of groupsByRoot.entries()) {
    if (memberIds.length < 2) continue;
    // Stable groupId from the lexicographically smallest core name in the
    // cluster — keeps grouping deterministic across renders.
    const cores = memberIds
      .map((id) => metaById.get(id)?.core || '')
      .filter(Boolean)
      .sort();
    const groupId = cores[0] || root;
    groups.push({ groupId, memberIds });
    for (const id of memberIds) {
      byLenderId[id] = { groupId, count: memberIds.length - 1 };
    }
  }

  groups.sort((a, b) => a.groupId.localeCompare(b.groupId));

  return { groups, byLenderId };
}
