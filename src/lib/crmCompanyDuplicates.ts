// Duplicate detection for CRM companies by normalized name and/or domain.
export interface CompanyDupInput {
  id: string;
  name: string | null;
  domain?: string | null;
  additional_domains?: string[] | null;
}

export type DupMatchMode = 'any' | 'name' | 'domain';
export type DupReason = 'name' | 'domain';

export interface CompanyDupGroup {
  id: string;
  memberIds: string[];
  reasons: DupReason[];
}

const SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'l', 'lc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company',
  'plc', 'lp', 'llp', 'pllc', 'pc', 'gmbh', 'sa', 'ag', 'bv', 'pty', 'the', 'group', 'holdings', 'holding',
]);

const GENERIC_HOSTS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'linkedin.com',
  'me.com', 'live.com', 'msn.com', 'protonmail.com',
]);

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  d = d.split(/[/?#]/)[0].split(':')[0].replace(/\.+$/, '');
  if (d.includes('@')) d = d.split('@').pop() || '';
  if (!d || !d.includes('.') || GENERIC_HOSTS.has(d)) return null;
  return d;
}

export function normalizeCompanyName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length > 1 && tokens[0] === 'the') tokens.shift();
  const out = tokens.join(' ');
  return out.length >= 2 ? out : null;
}

export function findCompanyDuplicates(companies: CompanyDupInput[], mode: DupMatchMode = 'any'): CompanyDupGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  companies.forEach((c) => parent.set(c.id, c.id));

  const byName = new Map<string, string[]>();
  const byDomain = new Map<string, string[]>();
  for (const c of companies) {
    if (mode !== 'domain') {
      const n = normalizeCompanyName(c.name);
      if (n) byName.set(n, [...(byName.get(n) ?? []), c.id]);
    }
    if (mode !== 'name') {
      const ds = new Set([c.domain, ...(c.additional_domains ?? [])].map(normalizeDomain).filter(Boolean) as string[]);
      ds.forEach((d) => byDomain.set(d, [...(byDomain.get(d) ?? []), c.id]));
    }
  }
  const pairReasons = new Map<string, Set<DupReason>>();
  const mark = (ids: string[], reason: DupReason) => {
    if (ids.length < 2) return;
    ids.forEach((id) => {
      union(ids[0], id);
      pairReasons.set(id, (pairReasons.get(id) ?? new Set()).add(reason));
    });
  };
  byName.forEach((ids) => mark(ids, 'name'));
  byDomain.forEach((ids) => mark(ids, 'domain'));

  const groups = new Map<string, string[]>();
  for (const c of companies) {
    if (!pairReasons.has(c.id)) continue;
    const r = find(c.id);
    groups.set(r, [...(groups.get(r) ?? []), c.id]);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => {
      const reasons = new Set<DupReason>();
      ids.forEach((id) => pairReasons.get(id)?.forEach((r) => reasons.add(r)));
      return { id: root, memberIds: ids, reasons: [...reasons].sort() as DupReason[] };
    });
}
