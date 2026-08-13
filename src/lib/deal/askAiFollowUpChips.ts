/**
 * Derives follow-up prompt chips from the latest AI answer plus deal context so
 * the suggestions track what was just discussed instead of being static.
 */

interface TopicRule {
  /** Matched against the lowercased latest assistant answer. */
  test: RegExp;
  /** Suggestions surfaced when the topic is detected. */
  chips: (dealName?: string) => string[];
}

const TOPIC_RULES: TopicRule[] = [
  {
    test: /\b(lender|funding source|term sheet|draft terms|loi|indication)\b/,
    chips: () => [
      'Which funding sources are still active?',
      'What are the key terms being offered?',
      'Who has passed and why?',
    ],
  },
  {
    test: /\b(ebitda|revenue|financial|margin|cash flow|leverage|debt service|dscr)\b/,
    chips: () => [
      'Show the latest financial trend',
      'How does leverage compare to the ask?',
      'Which financials are still outstanding?',
    ],
  },
  {
    test: /\b(document|file|data room|vdr|statement|agreement|pdf)\b/,
    chips: () => [
      'Which documents support that?',
      'What documents are still missing?',
      'Summarize the latest uploaded document',
    ],
  },
  {
    test: /\b(task|follow[- ]?up|outstanding item|due|overdue|assignee)\b/,
    chips: () => [
      'What is overdue right now?',
      'Who owns the open items?',
      'Draft a follow-up for the open items',
    ],
  },
  {
    test: /\b(call|meeting|transcript|claap|email|thread|conversation)\b/,
    chips: () => [
      'What were the action items from that?',
      'Summarize the latest client conversation',
      'Draft a follow-up email',
    ],
  },
  {
    test: /\b(stage|pipeline|timeline|milestone|close date|closing)\b/,
    chips: () => [
      'What is blocking the next stage?',
      'Is the close date still realistic?',
      'What changed since last week?',
    ],
  },
  {
    test: /\b(risk|concern|issue|blocker|delay|red flag)\b/,
    chips: () => [
      'How do we mitigate that?',
      'Which risks are most urgent?',
      'What should I tell the client?',
    ],
  },
];

/** Always-useful closers appended after topic-specific chips. */
const GENERIC_CHIPS = (dealName?: string) => [
  'What should I do next?',
  dealName ? `Summarize ${dealName} in 3 bullets` : 'Summarize that in 3 bullets',
  'Any risks or blockers?',
];

export const STARTER_CHIPS = [
  'Summarize this deal',
  'What are the outstanding items?',
  'Which funding sources are active?',
  'What happened recently?',
];

/**
 * @param latestAnswer the most recent assistant message content
 * @param dealName used to personalize generic suggestions
 * @param max maximum number of chips returned
 */
export function buildFollowUpChips(
  latestAnswer: string | undefined,
  dealName?: string,
  max = 5,
): string[] {
  if (!latestAnswer?.trim()) return STARTER_CHIPS;
  const text = latestAnswer.toLowerCase();

  const matched = TOPIC_RULES.filter((r) => r.test.test(text)).flatMap((r) => r.chips(dealName));
  const out: string[] = [];
  for (const chip of [...matched, ...GENERIC_CHIPS(dealName)]) {
    if (!out.includes(chip)) out.push(chip);
    if (out.length >= max) break;
  }
  return out;
}
