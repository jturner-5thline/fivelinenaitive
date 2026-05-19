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