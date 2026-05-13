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

/**
 * Detect bullet-style multi-question prompts (lines starting with ·, •, -, *,
 * or "o ") and, if found, return a formatted bullet/sub-bullet response where
 * every question is repeated verbatim under a "·" line and each answer is
 * placed on the following "o" line. Unknown questions get a neutral fallback
 * so the structure stays 1:1 with the input.
 *
 * Returns null when the input is not a bullet list of questions.
 */
const BULLET_LINE_RE = /^[\s]*([·•\-\*]|o\b)[\s\t]+(.+\S)\s*$/i;

export function matchDemoDealBulletAnswers(question: string): string | null {
  if (!question) return null;
  const lines = question.split(/\r?\n/);
  const questions: string[] = [];
  let bulletCount = 0;
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ');
    if (!line.trim()) continue;
    const m = line.match(BULLET_LINE_RE);
    if (!m) {
      // Any non-bullet, non-empty line disqualifies bullet-mode.
      return null;
    }
    const marker = m[1].toLowerCase();
    if (marker === 'o') continue; // ignore stray sub-bullet lines from paste
    bulletCount++;
    questions.push(m[2].trim());
  }
  if (bulletCount < 2 || questions.length === 0) return null;

  const out: string[] = [];
  for (const q of questions) {
    const answer =
      matchDemoDealCannedAnswer(q) ??
      "I don't have a specific figure for that yet — let me know which document or metric to pull from.";
    out.push(`·\t${q}`);
    out.push(`o\t${answer}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}