/**
 * Classify Claap action items and turn client-facing asks into clean
 * Outstanding Item labels.
 *
 * An action item is a *client ask* when it is phrased as a request
 * ("provide the ...", "send over ...") and the owner is clearly neither an
 * internal (5th Line / nAItive) user nor the lender — typically matched by
 * the deal / company name appearing in the owner segment or the text.
 */

export type ActionItemAudience = 'client' | 'lender' | 'internal' | 'unknown';

export interface ClassifiedActionItem {
  raw: string;
  /** Cleaned label suitable for an Outstanding Item ("provide the" stripped). */
  label: string;
  audience: ActionItemAudience;
}

export interface ClassifyContext {
  companyName?: string | null;
  dealName?: string | null;
  lenderNames?: string[];
  internalNames?: string[];
}

const STOPWORDS = new Set([
  'the', 'and', 'inc', 'llc', 'llp', 'ltd', 'co', 'corp', 'company', 'group',
  'partners', 'capital', 'holdings', 'fund', 'funds', 'labs', 'lab', 'bank',
  'financial', 'finance', 'services', 'solutions', 'advisors', 'advisory',
  'management', 'call', 'kick', 'off', 'intro', 'review', 'deal',
]);

function tokens(name?: string | null): string[] {
  if (!name) return [];
  const out = new Set<string>();
  for (const part of String(name).toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length >= 3 && !STOPWORDS.has(part)) out.add(part);
  }
  // Acronym of the significant words, e.g. "Efficient Capital Labs" -> "ecl"
  const words = String(name).split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 2) {
    const acro = words.map((w) => w[0]).join('').toLowerCase();
    if (acro.length >= 2 && acro.length <= 5) out.add(acro);
  }
  return [...out];
}

const REQUEST_VERB =
  /\b(provide|send|share|upload|deliver|furnish|supply|prepare|compile|gather|forward)\b/i;

/** Leading request phrasing to remove from the label. */
const LEAD_PHRASE =
  /^(?:please\s+)?(?:to\s+)?(?:provide|send|share|upload|deliver|furnish|supply|prepare|compile|gather|forward|put together|pull together)\s+(?:over\s+|us\s+|me\s+|them\s+|through\s+)?(?:the\s+|a\s+|an\s+|their\s+|his\s+|her\s+|its\s+|your\s+|our\s+)?/i;

/** Trailing clauses that add delivery context rather than describing the item. */
const TAIL_CUTS: RegExp[] = [
  /\s+to\s+[A-Z][\w'-]*/,
  /\s+so\s+that\s+/i,
  /\s+in\s+(?:a|the)\s+format/i,
  /\s+ahead\s+of\s+/i,
  /\s+prior\s+to\s+/i,
  /\s+before\s+the\s+/i,
  /\s+by\s+[A-Z][\w'-]*/,
  /\s+for\s+review\b/i,
  /\s+once\s+/i,
];

/** Owner segment: "Name: do x", "do x (@Room ODK)", "[ODK] do x". */
function ownerSegment(text: string): string {
  const paren = text.match(/\(([^)]*)\)\s*$/);
  if (paren) return paren[1];
  const prefix = text.match(/^\s*[[(]?([^:[\]()]{1,48})[\])]?\s*:\s/);
  if (prefix) return prefix[1];
  const at = text.match(/@([A-Za-z0-9 _-]{2,48})/);
  if (at) return at[1];
  return '';
}

/** Turn a raw Claap action item into a concise Outstanding Item label. */
export function cleanOutstandingItemLabel(raw: string): string {
  let t = String(raw ?? '').trim();
  // Strip markdown/bullet decoration and Claap timestamp pills.
  t = t.replace(/^[-*\u2022]\s*/, '').replace(/\*\*/g, '');
  t = t.replace(/\[?\b\d{1,2}:\d{2}(?::\d{2})?\b\]?/g, ' ');
  // Drop trailing parentheticals (owner/room annotations).
  t = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // Drop an owner prefix ("Nick:" / "[ODK]").
  t = t.replace(/^\s*[[(]?([^:[\]()]{1,48})[\])]?\s*:\s+/, '').trim();
  // Strip the request verb phrase.
  t = t.replace(LEAD_PHRASE, '').trim();
  // Cut delivery context tails at the earliest match.
  let cut = t.length;
  for (const re of TAIL_CUTS) {
    const m = t.match(re);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  t = t.slice(0, cut).trim();
  // Tidy punctuation.
  t = t.replace(/[\s,;:.]+$/, '').replace(/\s{2,}/g, ' ').trim();
  return t;
}

export function classifyActionItem(raw: string, ctx: ClassifyContext): ClassifiedActionItem {
  const text = String(raw ?? '');
  const lower = text.toLowerCase();
  const owner = ownerSegment(text).toLowerCase();

  const clientTokens = [...tokens(ctx.companyName), ...tokens(ctx.dealName)];
  const lenderTokens = (ctx.lenderNames ?? []).flatMap((n) => tokens(n));
  const internalTokens = (ctx.internalNames ?? []).flatMap((n) => tokens(n));

  const hit = (hay: string, toks: string[]) => toks.some((t) => hay.includes(t));

  let audience: ActionItemAudience = 'unknown';
  if (owner && hit(owner, lenderTokens)) audience = 'lender';
  else if (owner && hit(owner, internalTokens)) audience = 'internal';
  else if (owner && hit(owner, clientTokens)) audience = 'client';
  else if (hit(lower, clientTokens)) audience = 'client';

  if (audience === 'client' && !REQUEST_VERB.test(lower)) audience = 'unknown';

  return { raw: text, label: cleanOutstandingItemLabel(text) || text.trim(), audience };
}

/** Extract only the client asks from a list of action items. */
export function extractClientAsks(items: string[], ctx: ClassifyContext): ClassifiedActionItem[] {
  const seen = new Set<string>();
  const out: ClassifiedActionItem[] = [];
  for (const item of items) {
    const c = classifyActionItem(item, ctx);
    if (c.audience !== 'client' || !c.label) continue;
    const key = c.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** True when a meeting title reads like a kick-off / onboarding call. */
export function isKickOffCall(title?: string | null): boolean {
  return /\bkick[\s-]?off\b|\bkickoff\b|\bonboarding\b/i.test(String(title ?? ''));
}
