import { useMemo } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import { fuzzyNameScore } from '@/lib/detectDraftEmails';
import type { Deal } from '@/types/deal';

export interface BodyMentionMatch {
  deal: Deal;
  /** 0–100 */
  score: number;
  confidence: 'high' | 'medium' | 'low';
  /** Verbatim phrase from the email that triggered the match. */
  matchedPhrase: string;
}

const HIGH = 80;
const MEDIUM = 50;

function buildHaystack(input: { subject?: string | null; body?: string | null }): string {
  return `${input.subject || ''}\n${input.body || ''}`.toLowerCase();
}

/**
 * Find a verbatim/near-verbatim mention of the deal company name within the
 * subject + body of the email. Used by the unmatched-email AI panel to
 * suggest "this may be related to [Deal] — link it?" when the sender alone
 * does not match a known deal.
 */
function findDealMention(
  haystack: string,
  deal: Deal,
): { score: number; phrase: string } | null {
  // Try exact, then fuzzy on each candidate label.
  const candidates = [deal.company, deal.name].filter(
    (v): v is string => !!v && v.trim().length >= 3,
  );
  let best: { score: number; phrase: string } | null = null;

  for (const raw of candidates) {
    const candidate = raw.trim();
    if (!candidate) continue;
    const lc = candidate.toLowerCase();
    if (haystack.includes(lc)) {
      // Exact substring match → very strong signal.
      const phrase = candidate;
      const score = candidate.length >= 6 ? 90 : 70;
      if (!best || score > best.score) best = { score, phrase };
      continue;
    }
    // Fuzzy fallback: look for tokens >=4 chars that score highly against
    // any 3-word window in the haystack.
    const words = candidate.split(/\s+/).filter((w) => w.length >= 4);
    if (words.length === 0) continue;
    const corpusTokens = haystack.split(/[^a-z0-9]+/g).filter(Boolean);
    for (let i = 0; i < corpusTokens.length; i++) {
      const window = corpusTokens.slice(i, i + Math.min(3, words.length)).join(' ');
      const s = fuzzyNameScore(candidate, window);
      if (s >= 0.7) {
        const score = Math.round(s * 70); // cap fuzzy at 70 so exact wins
        if (!best || score > best.score) best = { score, phrase: window };
      }
    }
  }
  return best;
}

/**
 * Scan the email subject + body for a mention of any deal in the workspace.
 * Returns the best match clearing the medium threshold or null.
 * Excludes any deal id provided in `excludeDealIds` (e.g. the deal already
 * matched via sender domain) so the suggestion is genuinely additive.
 */
export function useBodyMentionDealMatch(input: {
  subject?: string | null;
  body?: string | null;
  excludeDealIds?: string[];
}): BodyMentionMatch | null {
  const { deals } = useDealsContext();
  const exclude = input.excludeDealIds;

  return useMemo(() => {
    if (!deals?.length) return null;
    if (!input.subject && !input.body) return null;
    const haystack = buildHaystack(input);
    if (!haystack.trim()) return null;

    const excludeSet = new Set(exclude || []);
    let best: BodyMentionMatch | null = null;

    for (const deal of deals) {
      if (excludeSet.has(deal.id)) continue;
      const hit = findDealMention(haystack, deal);
      if (!hit || hit.score < MEDIUM) continue;
      const confidence: BodyMentionMatch['confidence'] =
        hit.score >= HIGH ? 'high' : hit.score >= MEDIUM + 15 ? 'medium' : 'low';
      const candidate: BodyMentionMatch = {
        deal,
        score: hit.score,
        confidence,
        matchedPhrase: hit.phrase,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }, [deals, input.subject, input.body, exclude]);
}
