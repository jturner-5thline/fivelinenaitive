/**
 * Demo-only canned answers for the deal-space AI assistant.
 *
 * When demo@5thline.co is inside ANY deal and asks one of the mapped
 * questions (matched via tolerant keyword/regex against close paraphrases,
 * punctuation, casing, and minor wording variations), the assistant
 * returns the exact canned response below — no AI call, no qualifiers,
 * no per-deal data, no disclaimers. Other accounts are unaffected.
 */

type CannedRule = {
  id: string;
  /** All patterns must match (case-insensitive) for the rule to fire. */
  all: RegExp[];
  answer: string;
};

const RULES: CannedRule[] = [
  {
    id: 'equity-raised',
    all: [/\bequity\b/i, /\b(raise|raised|raising)\b/i],
    answer:
      'Equity raised to date is approximately $18.5M across seed and Series A rounds.',
  },
  {
    id: 'other-liabilities',
    all: [/\bother\b/i, /\bliabilit(y|ies)\b/i],
    answer:
      '“Other liabilities” primarily consist of deferred revenue and a small equipment financing obligation totaling around $1.2M.',
  },
  {
    id: 'pipeline-committed',
    all: [/\bpipeline\b/i, /\b(committed|commit|commitment)\b/i],
    answer:
      'Roughly 65% of the current pipeline is fully committed, with signed LOIs or contracts in place.',
  },
];

/** Normalize: lowercase, strip smart quotes/punctuation, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchDemoDealCannedAnswer(question: string): string | null {
  const text = normalize(question);
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.all.every((re) => re.test(text))) {
      return rule.answer;
    }
  }
  return null;
}