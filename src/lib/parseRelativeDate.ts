import * as chrono from 'chrono-node';

export interface ParsedRelativeDate {
  date: Date | null;
  /** 'high' when chrono returned a calendar-anchored result; 'low' for vague hits; 'none' when nothing matched. */
  confidence: 'high' | 'low' | 'none';
  /** The exact substring chrono matched, when any. */
  matchedText: string | null;
  /** True when the match was found but the resolved date is ambiguous and should be user-confirmed. */
  ambiguous: boolean;
}

/**
 * Parse a natural-language date out of `text`, anchored to `anchorTimestamp`
 * (the timestamp of the source note/meeting/comment — NOT the current time).
 *
 * Examples:
 *   "Chris said he will get back to us by Tuesday." → next Tuesday after the anchor
 *   "Follow up with lender next Thursday."          → that Thursday
 *   "Management will deliver by end of week."       → upcoming Fri/Sun
 *   "Tomorrow at 10am"                              → anchor + 1 day @ 10:00
 *
 * Returns `confidence: 'none'` when nothing parsed — caller must require
 * the user to pick a date before saving.
 */
export function parseRelativeDate(
  text: string,
  anchorTimestamp: string | Date,
): ParsedRelativeDate {
  if (!text || !text.trim()) {
    return { date: null, confidence: 'none', matchedText: null, ambiguous: false };
  }
  const anchor = typeof anchorTimestamp === 'string' ? new Date(anchorTimestamp) : anchorTimestamp;
  const safeAnchor = isNaN(anchor.getTime()) ? new Date() : anchor;

  // chrono-node uses the reference date as "now" for relative resolution
  // ("Tuesday", "next week", "tomorrow"). Forward parsing keeps weekday
  // references in the future relative to the anchor (Friday + "Tuesday"
  // → following Tuesday, not the past one).
  let results: chrono.ParsedResult[] = [];
  try {
    results = chrono.parse(text, safeAnchor, { forwardDate: true });
  } catch {
    return { date: null, confidence: 'none', matchedText: null, ambiguous: false };
  }
  if (!results.length) {
    // Soft fallback: a few common idioms chrono misses.
    const lower = text.toLowerCase();
    if (/\bend of (?:the )?(?:week|wk)\b/.test(lower)) {
      const d = new Date(safeAnchor);
      const day = d.getDay(); // 0=Sun … 5=Fri
      const delta = day <= 5 ? 5 - day : 5 + 7 - day;
      d.setDate(d.getDate() + delta);
      d.setHours(17, 0, 0, 0);
      return { date: d, confidence: 'low', matchedText: 'end of week', ambiguous: true };
    }
    if (/\bend of (?:the )?month\b/.test(lower)) {
      const d = new Date(safeAnchor.getFullYear(), safeAnchor.getMonth() + 1, 0, 17, 0, 0, 0);
      return { date: d, confidence: 'low', matchedText: 'end of month', ambiguous: true };
    }
    return { date: null, confidence: 'none', matchedText: null, ambiguous: false };
  }

  // Prefer the most certain result. chrono ranks by index; the first hit is
  // usually the intended one in short snippets.
  const r = results[0];
  const date = r.start.date();
  // chrono marks each component as certain or implied. Treat as "high"
  // when at least day-of-week or day-of-month was explicitly mentioned.
  const hasDayOfWeek = r.start.isCertain('weekday');
  const hasDayOfMonth = r.start.isCertain('day');
  const hasMonth = r.start.isCertain('month');
  const confident = hasDayOfWeek || hasDayOfMonth || hasMonth || /tomorrow|today|tonight|yesterday/i.test(r.text);
  return {
    date,
    confidence: confident ? 'high' : 'low',
    matchedText: r.text,
    ambiguous: !confident,
  };
}
