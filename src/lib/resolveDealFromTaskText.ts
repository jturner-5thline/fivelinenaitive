import type { Deal } from '@/types/deal';
import { isActiveDeal } from '@/lib/deals';

/**
 * Instant client-side deal resolver for the Naitive task composer.
 *
 * Scans the user's free-text task input for a verbatim mention of a deal's
 * company / name. Used to pre-fill the deal chip BEFORE the AI parse round
 * trip completes — and to override the AI's pick when the local substring
 * match is unambiguous (the AI sometimes resolves to a stale/on-hold
 * duplicate).
 */
export interface InstantDealMatch {
  id: string;
  label: string;
  /** Length of the matched substring — used as match strength. */
  matchLen: number;
  active: boolean;
}

const STOPWORDS = new Set([
  'the','and','for','with','on','at','to','from','of','a','an','re','fwd',
  'call','email','meeting','follow','followup','follow-up','reply','update',
  'review','send','docs','document','documents','today','tomorrow','asap',
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'next','last','this','week','month','tuesday','remind','me','please',
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function resolveDealFromTaskText(
  text: string,
  deals: Deal[] | null | undefined,
): InstantDealMatch | null {
  if (!text || !deals?.length) return null;
  const hay = ' ' + norm(text) + ' ';
  if (hay.length < 5) return null;

  let best: InstantDealMatch | null = null;

  for (const d of deals) {
    const candidates = [d.company, d.name].filter((v): v is string => !!v && v.trim().length >= 3);
    for (const raw of candidates) {
      const n = norm(raw);
      if (!n || n.length < 3) continue;
      if (STOPWORDS.has(n)) continue;

      let hit = false;
      let matchLen = 0;

      // Whole-phrase substring (must be word-bounded)
      if (hay.includes(' ' + n + ' ')) {
        hit = true;
        matchLen = n.length;
      } else {
        // Single distinctive token (length ≥ 5, not a stopword) appearing word-bounded
        const tokens = n.split(' ').filter(t => t.length >= 5 && !STOPWORDS.has(t));
        for (const tok of tokens) {
          if (hay.includes(' ' + tok + ' ')) { hit = true; matchLen = Math.max(matchLen, tok.length); }
        }
      }

      if (!hit) continue;

      const active = isActiveDeal(d);
      const candidate: InstantDealMatch = {
        id: d.id,
        label: d.company || d.name,
        matchLen,
        active,
      };

      if (!best) { best = candidate; continue; }
      // Prefer active > inactive, then longer match.
      if (candidate.active !== best.active) {
        if (candidate.active) best = candidate;
      } else if (candidate.matchLen > best.matchLen) {
        best = candidate;
      }
    }
  }

  return best;
}