/**
 * Robust matcher between a partner display name (e.g. "Dorian Meza @ Truist Bank",
 * "Mike Ortiz - Wells Fargo") and a free-form deal `referred_by` / `sourced_via`
 * string (e.g. "Dorian Meza", "Dorian @ Truist Bank").
 *
 * Strategy: normalize both sides (lowercase, strip "@firm" / "- firm" suffix,
 * collapse whitespace), then accept a match when either:
 *   - the normalized strings are equal, or
 *   - one contains the other, or
 *   - they share ≥2 distinctive name tokens (≥3 chars, not a stopword)
 */

const STOPWORDS = new Set([
  'at', 'the', 'of', 'and', 'inc', 'llc', 'co', 'group', 'capital',
  'bank', 'partners', 'partner', 'consulting', 'advisors', 'advisory',
  'firm', 'associates', 'company', 'corp', 'corporation', 'ventures',
]);

function stripFirm(s: string): string {
  // Drop everything after "@" or " - " or " at " — typically the firm name
  return s
    .split(/\s*@\s*|\s+-\s+|\s+\bat\b\s+/i)[0]
    .trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

export function partnerMatches(partnerName: string, candidate: string | null | undefined): boolean {
  if (!partnerName || !candidate) return false;
  const pFull = normalize(partnerName);
  const cFull = normalize(candidate);
  if (!pFull || !cFull) return false;
  if (pFull === cFull) return true;

  const pCore = normalize(stripFirm(partnerName));
  const cCore = normalize(stripFirm(candidate));
  if (pCore && cCore && (pCore === cCore || pCore.includes(cCore) || cCore.includes(pCore))) return true;

  if (pFull.includes(cFull) || cFull.includes(pFull)) return true;

  const pTok = new Set(tokens(stripFirm(partnerName)));
  const cTok = tokens(stripFirm(candidate));
  if (pTok.size === 0 || cTok.length === 0) return false;
  let overlap = 0;
  for (const t of cTok) if (pTok.has(t)) overlap++;
  // Require at least 2 shared tokens, OR 1 shared token when the partner core
  // is itself only one token (e.g. "SLR", "TriNet").
  return overlap >= 2 || (pTok.size === 1 && overlap >= 1);
}

export function filterDealsForPartner<T extends { referred_by?: string | null; sourced_via?: string | null }>(
  deals: T[],
  partnerName: string,
): T[] {
  return deals.filter(d => partnerMatches(partnerName, d.referred_by) || partnerMatches(partnerName, d.sourced_via));
}