import { normalizeLenderName, nameSimilarity } from '@/lib/lenderRequestGrouping';

export type MatchConfidence =
  | 'exact_duplicate'
  | 'likely_duplicate'
  | 'possible_match'
  | 'needs_review'
  | 'none';

export type SuggestedAction = 'add' | 'update' | 'merge' | 'review';

export interface ExistingLenderCandidate {
  id: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  address?: string | null;
  geo?: string | null;
  contact_name?: string | null;
  tags?: string[] | null;
  aliases?: string[] | null;
}

export interface IncomingLender {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  address?: string | null;
  geo?: string | null;
  contact_name?: string | null;
  tags?: string[] | null;
  aliases?: string[] | null;
}

export interface ScoredCandidate {
  lender_id: string;
  name: string;
  score: number; // 0..1
  reasons: string[];
  topReason: string;
}

export interface MatchResult {
  candidates: ScoredCandidate[];
  confidence: MatchConfidence;
  suggestedAction: SuggestedAction;
  matchReason: string | null;
  topCandidate: ScoredCandidate | null;
}

export interface MatchThresholds {
  likely: number; // default 0.82
  possible: number; // default 0.65
}

const DEFAULT_THRESHOLDS: MatchThresholds = { likely: 0.82, possible: 0.65 };

function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();
  const atIdx = v.indexOf('@');
  let host = atIdx >= 0 ? v.slice(atIdx + 1) : v;
  host = host.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return host || null;
}

function digitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D+/g, '');
}

function normalizeAlias(s: string): string {
  return normalizeLenderName(s);
}

function aliasSet(values: (string | null | undefined)[] | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!values) return out;
  for (const v of values) {
    if (!v) continue;
    const n = normalizeAlias(String(v));
    if (n) out.add(n);
  }
  return out;
}

function tagOverlap(a?: string[] | null, b?: string[] | null): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const A = new Set(a.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const B = new Set(b.map((x) => x.toLowerCase().trim()).filter(Boolean));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}

/**
 * Score a single existing lender against an incoming request.
 * Returns a value between 0 and 1, plus the human-readable reasons.
 */
export function scoreCandidate(
  incoming: IncomingLender,
  existing: ExistingLenderCandidate,
): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const iName = normalizeLenderName(incoming.name || '');
  const eName = normalizeLenderName(existing.name || '');
  if (iName && eName) {
    if (iName === eName) {
      score = Math.max(score, 1.0);
      reasons.push('Exact normalized name match');
    } else {
      const sim = nameSimilarity(iName, eName);
      if (sim >= 0.6) {
        score = Math.max(score, sim * 0.85);
        reasons.push(`Name similarity ${(sim * 100).toFixed(0)}%`);
      }
    }
  }

  // Alias overlap
  const iAliases = aliasSet([...(incoming.aliases || []), incoming.name || null]);
  const eAliases = aliasSet([...(existing.aliases || []), existing.name || null]);
  for (const a of iAliases) {
    if (eAliases.has(a)) {
      score = Math.max(score, 0.95);
      reasons.push(`Alias match: "${a}"`);
      break;
    }
  }

  // Website / domain
  const iDomain = domainOf(incoming.website) || domainOf(incoming.email);
  const eDomain = domainOf(existing.website) || domainOf(existing.email);
  if (iDomain && eDomain) {
    if (iDomain === eDomain) {
      score = Math.max(score, 0.9);
      reasons.push(`Domain match: ${iDomain}`);
    } else if (iDomain.includes(eDomain) || eDomain.includes(iDomain)) {
      score = Math.max(score, 0.7);
      reasons.push(`Partial domain match: ${iDomain}/${eDomain}`);
    }
  }

  // Email domain explicit
  const iEmailDom = domainOf(incoming.email);
  const eEmailDom = domainOf(existing.email);
  if (iEmailDom && eEmailDom && iEmailDom === eEmailDom) {
    score = Math.max(score, 0.75);
    if (!reasons.some((r) => r.startsWith('Domain'))) reasons.push(`Email domain match: ${iEmailDom}`);
  }

  // Phone exact
  const iPhone = digitsOnly(incoming.phone || incoming.contact_phone);
  const ePhone = digitsOnly(existing.phone || existing.contact_phone);
  if (iPhone.length >= 7 && iPhone === ePhone) {
    score = Math.max(score, 0.7);
    reasons.push('Phone match');
  }

  // Address / geo overlap
  if (incoming.geo && existing.geo) {
    const ig = incoming.geo.toLowerCase().trim();
    const eg = existing.geo.toLowerCase().trim();
    if (ig === eg) {
      score = Math.min(1, score + 0.05);
    }
  }
  if (incoming.address && existing.address) {
    const sim = nameSimilarity(
      incoming.address.toLowerCase().replace(/[^a-z0-9 ]/g, ' '),
      existing.address.toLowerCase().replace(/[^a-z0-9 ]/g, ' '),
    );
    if (sim > 0.7) {
      score = Math.min(1, score + 0.1);
      reasons.push(`Address similarity ${(sim * 100).toFixed(0)}%`);
    }
  }

  // Contact name
  if (incoming.contact_name && existing.contact_name) {
    const sim = nameSimilarity(incoming.contact_name.toLowerCase(), existing.contact_name.toLowerCase());
    if (sim > 0.85) {
      score = Math.min(1, score + 0.1);
      reasons.push('Shared primary contact');
    }
  }

  // Tag overlap
  const tagSim = tagOverlap(incoming.tags, existing.tags);
  if (tagSim > 0) {
    score = Math.min(1, score + tagSim * 0.15);
  }

  const topReason = reasons[0] || (iName && eName ? 'Weak name overlap' : 'No strong signals');

  return {
    lender_id: existing.id,
    name: existing.name || '(unnamed)',
    score: Math.min(1, score),
    reasons,
    topReason,
  };
}

/**
 * Run the matching engine across all candidates, return ranked list + confidence.
 */
export function matchIncomingLender(
  incoming: IncomingLender,
  candidates: ExistingLenderCandidate[],
  thresholds: MatchThresholds = DEFAULT_THRESHOLDS,
): MatchResult {
  const scored = candidates
    .map((c) => scoreCandidate(incoming, c))
    .filter((s) => s.score >= thresholds.possible * 0.6) // prune extreme noise
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const top = scored[0] || null;
  let confidence: MatchConfidence = 'none';
  let suggestedAction: SuggestedAction = 'add';

  if (top) {
    if (top.score >= 0.98) {
      confidence = 'exact_duplicate';
      suggestedAction = 'merge';
    } else if (top.score >= thresholds.likely) {
      confidence = 'likely_duplicate';
      suggestedAction = 'merge';
    } else if (top.score >= thresholds.possible) {
      confidence = 'possible_match';
      suggestedAction = 'review';
    } else {
      confidence = 'needs_review';
      suggestedAction = 'add';
    }
  }

  return {
    candidates: scored,
    confidence,
    suggestedAction,
    matchReason: top?.topReason || null,
    topCandidate: top,
  };
}

/**
 * Count populated-field conflicts between incoming and existing for a list of fields.
 * A "conflict" = both sides populated AND differ.
 */
export function countFieldConflicts(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  fields: string[],
): number {
  let n = 0;
  for (const f of fields) {
    const iv = incoming[f];
    const ev = existing[f];
    const iPop = iv !== null && iv !== undefined && iv !== '';
    const ePop = ev !== null && ev !== undefined && ev !== '';
    if (iPop && ePop && JSON.stringify(iv) !== JSON.stringify(ev)) n++;
  }
  return n;
}

export const LENDER_COMPARABLE_FIELDS = [
  'name','email','lender_type','loan_types','sub_debt','cash_burn','sponsorship',
  'min_revenue','ebitda_min','min_deal','max_deal','industries','industries_to_avoid',
  'b2b_b2c','refinancing','company_requirements','deal_structure_notes','geo',
  'contact_name','contact_title','relationship_owners','lender_one_pager_url',
  'referral_lender','referral_fee_offered','referral_agreement','nda',
  'gift_address','tier','website','phone','address','tags',
];
