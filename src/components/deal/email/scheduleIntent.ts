/**
 * scheduleIntent
 * --------------
 * Lightweight intent detection for compose bodies — surfaces the
 * "Looks like you're trying to schedule" prompt card in the AI panel
 * when the user is hand-typing scheduling language. Decoupled from the
 * composer surfaces via a window event so InlineReplyComposer and
 * PopOutComposer can both feed the same listener in AiAssistSidebar.
 */

export const COMPOSE_BODY_EVENT = 'naitive:compose:body-changed';

export interface ComposeBodyDetail {
  threadId: string;
  body: string;
}

/** Phrases that strongly signal "I want to schedule something". */
const PHRASE_PATTERNS: RegExp[] = [
  /\bdo you have (?:any )?time\b/i,
  /\bcan we (?:connect|chat|talk|jump on (?:a )?call)\b/i,
  /\blet'?s (?:set up|setup|schedule|grab|hop on|jump on) (?:a )?(?:call|meeting|chat|time)\b/i,
  /\bwould you be (?:available|free)\b/i,
  /\bare you (?:free|available)\b/i,
  /\bi (?:wanted|want|was hoping) to schedule\b/i,
  /\bi'?d like to (?:find a time|schedule|set up a (?:call|meeting))\b/i,
  /\bfind (?:a )?time to (?:chat|talk|connect|meet)\b/i,
  /\bgrab\s+\d+\s*(?:min|mins?|minutes?)\b/i,
  /\bfind a time\b/i,
  /\bavailable to (?:chat|talk|connect|meet|jump)\b/i,
  /\bschedule a (?:call|meeting|chat|time)\b/i,
];

/**
 * Match a hand-typed day+time reference like "this Wednesday at 3",
 * "next Tues 10am", "Wed afternoon at 2:30pm". We require either a
 * day-of-week token, or a day+time pairing — keeps false positives down
 * on generic mentions of weekday names in unrelated prose.
 */
const DAY_TIME_PATTERN =
  /\b(?:this|next)\s+(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?\b.*?\bat\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i;
const DAY_ANY_TIME_PATTERN =
  /\b(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?\b\s*(?:morning|afternoon|evening)?\s*(?:at\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

export function detectSchedulingIntent(body: string): boolean {
  if (!body) return false;
  const text = body.replace(/<[^>]+>/g, ' ');
  if (text.trim().length < 8) return false;
  if (PHRASE_PATTERNS.some((re) => re.test(text))) return true;
  if (DAY_TIME_PATTERN.test(text)) return true;
  if (DAY_ANY_TIME_PATTERN.test(text)) return true;
  return false;
}

/**
 * Inbound counterpart proposed specific times → the user is replying
 * to a proposal, which is handled by Scenario 2 logic (the
 * AvailabilityCheckCard at the top of the scheduler). We must NOT
 * surface the "want me to pull your available times?" prompt in that
 * case. Detection is intentionally loose: any concrete time-of-day
 * reference inside an inbound message counts.
 */
const INBOUND_TIME_PROPOSAL_PATTERN =
  /\b(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?\b[^.\n]{0,40}?\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|morning|afternoon|evening)\b/i;
const INBOUND_RANGE_PATTERN =
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

export function inboundProposedTimes(texts: Array<string | null | undefined>): boolean {
  for (const raw of texts) {
    if (!raw) continue;
    const text = String(raw).replace(/<[^>]+>/g, ' ');
    if (INBOUND_TIME_PROPOSAL_PATTERN.test(text)) return true;
    if (INBOUND_RANGE_PATTERN.test(text)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Open-ended availability requests (Scenario 3)
//
// The counterpart is asking "when are you free?" without proposing any
// specific time. We surface a proactive card in the AI panel that pulls
// open slots from James's calendar and drafts a conversational reply.
// ─────────────────────────────────────────────────────────────────────────────

export type OpenAvailabilityScope = 'today' | 'tomorrow' | 'this_week' | 'soon' | 'default';
export type OpenAvailabilityFormality = 'casual' | 'formal';

export interface OpenAvailabilityRequest {
  scope: OpenAvailabilityScope;
  formality: OpenAvailabilityFormality;
}

/** Phrases that indicate an *open* availability ask (no specific time given). */
const OPEN_PHRASE_PATTERNS: RegExp[] = [
  /\bare you (?:free|available|around)\b/i,
  /\bwhen are you (?:free|available|around)\b/i,
  /\bwhat(?:'s| is) your availability\b/i,
  /\blet me know (?:what works|when (?:you'?re|you are) (?:free|available)|your availability)\b/i,
  /\bdo you have (?:any )?time (?:to (?:connect|chat|talk|jump|meet|catch up)|this (?:week|afternoon|month))\b/i,
  /\bwould love to (?:find a time|connect|catch up|jump on (?:a )?call|grab (?:some )?time)\b/i,
  /\bhappy to (?:jump on|hop on|set up) (?:a )?call\b/i,
  /\bwhat (?:works|time works) (?:for you|best)\b/i,
  /\bwhen works (?:for|best for) you\b/i,
  /\b(?:can|could) we (?:find a time|set (?:up|aside) (?:some )?time|grab (?:a )?(?:quick )?(?:call|chat))\b/i,
  /\b(?:got|have) (?:some|any) time (?:this|next) (?:week|month|afternoon)\b/i,
];

function inferScope(text: string): OpenAvailabilityScope {
  const t = text.toLowerCase();
  // Order matters — more specific wins.
  if (/\b(this afternoon|later today|today)\b/.test(t)) return 'today';
  if (/\btomorrow\b/.test(t)) return 'tomorrow';
  if (/\b(this week or next|early next week|sometime soon|whenever you'?re free|soon|in the (?:next )?(?:few|coming) (?:days|weeks))\b/.test(t)) return 'soon';
  if (/\bthis week\b/.test(t)) return 'this_week';
  return 'default';
}

function inferFormality(text: string): OpenAvailabilityFormality {
  // Loose heuristic: capitalized salutations + longer sentences + absence of
  // contractions/emojis lean formal; lowercase + contractions lean casual.
  const t = text.trim();
  const casualHits = (t.match(/\b(hey|hi|yo|cool|awesome|btw|gonna|wanna|let'?s|lmk)\b/gi) || []).length;
  const formalHits = (t.match(/\b(dear|kind regards|best regards|sincerely|please advise|at your earliest convenience|would be delighted|kindly)\b/gi) || []).length;
  if (formalHits > casualHits) return 'formal';
  // Contractions push casual; sentences > 25 words push formal.
  const avgWords = t.split(/[.!?]+/).filter(Boolean).reduce((acc, s) => acc + s.split(/\s+/).length, 0) / Math.max(1, t.split(/[.!?]+/).filter(Boolean).length);
  if (avgWords > 22) return 'formal';
  return 'casual';
}

export function detectOpenAvailabilityRequest(
  texts: Array<string | null | undefined>,
): OpenAvailabilityRequest | null {
  // Skip if the sender has already proposed specific times — that's
  // handled by AvailabilityCheckCard (Scenario 2).
  if (inboundProposedTimes(texts)) return null;
  for (const raw of texts) {
    if (!raw) continue;
    const text = String(raw).replace(/<[^>]+>/g, ' ');
    if (text.trim().length < 6) continue;
    if (OPEN_PHRASE_PATTERNS.some((re) => re.test(text))) {
      return { scope: inferScope(text), formality: inferFormality(text) };
    }
  }
  return null;
}

/**
 * Debounced (500ms) dispatcher. Caller invokes on every keystroke; we
 * only fire once the user stops typing for half a second to avoid
 * thrashing the listener.
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
export function dispatchComposeBody(detail: ComposeBodyDetail) {
  if (typeof window === 'undefined') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    window.dispatchEvent(new CustomEvent<ComposeBodyDetail>(COMPOSE_BODY_EVENT, { detail }));
  }, 500);
}