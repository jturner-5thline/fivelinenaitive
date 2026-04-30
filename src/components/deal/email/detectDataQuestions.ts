/**
 * detectDataQuestions
 * -------------------
 * Lightweight heuristic that scans an inbound email body for data-style
 * questions a lender / counterparty is likely asking about the deal
 * (financials, debt, collateral, use of funds, etc.).
 *
 * Pure client-side regex — no LLM call. Runs cheaply on every render so the
 * AI Assist panel can decide whether to surface a "Answer from Deal Space"
 * card. The actual answer is fetched on demand via `deal-space-ai`.
 *
 * Detection rules (all conservative — false positives are harmless because
 * the user has to click "Answer" before any AI work happens):
 *  • Sentence ends with "?" AND mentions a finance keyword.
 *  • Sentence starts with a request verb ("can you share / send / provide /
 *    confirm / clarify…") AND mentions a finance keyword.
 *  • Trimmed to ≤ 12 questions, deduped, max 240 chars each.
 */
export interface DetectedQuestion {
  /** Stable id (hash-ish) so React lists are stable across re-renders. */
  id: string;
  /** The question text as it appears in the email (lightly normalized). */
  text: string;
  /** Which keyword(s) matched — used for the chip label. */
  topics: string[];
}

// Keep this list TIGHT — broad words like "money" cause noise.
const FINANCE_KEYWORDS: Array<{ topic: string; pattern: RegExp }> = [
  { topic: 'ARR / MRR',          pattern: /\b(arr|mrr|annual recurring|monthly recurring)\b/i },
  { topic: 'Revenue',            pattern: /\brevenue|top.?line|gross sales|net sales\b/i },
  { topic: 'EBITDA / Profit',    pattern: /\bebitda|operating (income|profit)|net income|profit margin|gross margin\b/i },
  { topic: 'Debt',               pattern: /\b(existing )?debt|leverage|loan|credit facility|term loan|revolver|covenants?\b/i },
  { topic: 'Cash / Runway',      pattern: /\bcash (balance|on hand|position)|runway|burn rate|liquidity\b/i },
  { topic: 'Collateral',         pattern: /\bcollateral|security interest|lien|encumbrance|pledged assets\b/i },
  { topic: 'Use of funds',       pattern: /\buse of (funds|proceeds)|deployment plan\b/i },
  { topic: 'Valuation',          pattern: /\bvaluation|enterprise value|equity value|cap table\b/i },
  { topic: 'Headcount',          pattern: /\bheadcount|employees|fte\b/i },
  { topic: 'Customers / Churn',  pattern: /\bcustomers?|churn|retention|nrr|grr|logos?\b/i },
  { topic: 'Pipeline',           pattern: /\bpipeline|booked|backlog|forecast\b/i },
  { topic: 'Capex / Opex',       pattern: /\bcapex|opex|operating expenses|capital expenditures?\b/i },
  { topic: 'Outstanding items',  pattern: /\boutstanding|missing|pending items?|checklist\b/i },
];

const REQUEST_VERB =
  /^(can you|could you|would you|please|kindly|do you|are there|is there|what(?:'s| is)|how (?:much|many)|share|send|provide|confirm|clarify|let me know|tell me)\b/i;

function splitSentences(input: string): string[] {
  // Normalize whitespace; split on sentence terminators while keeping the punctuation.
  const cleaned = input.replace(/\r/g, '').replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return [];
  // Split on ?, ., or ! followed by space/newline. Keep ? sentences for question detection.
  return cleaned
    .split(/(?<=[?.!])\s+(?=[A-Z(])|\n{1,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 320);
}

function topicsFor(sentence: string): string[] {
  const out: string[] = [];
  for (const { topic, pattern } of FINANCE_KEYWORDS) {
    if (pattern.test(sentence)) out.push(topic);
  }
  return out;
}

function hashId(input: string): string {
  // Tiny non-crypto hash — stable across renders, enough for React keys.
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return `q_${(h >>> 0).toString(36)}`;
}

export function detectDataQuestions(bodyText: string | null | undefined): DetectedQuestion[] {
  if (!bodyText) return [];
  // Strip quoted reply lines ("> ..."), forwarded headers, and signatures so
  // we only analyze the latest message.
  const trimmed = bodyText
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .split(/\n--\s*\n|\nOn .* wrote:\n|\nFrom: /i)[0]
    || bodyText;

  const sentences = splitSentences(trimmed);
  const seen = new Set<string>();
  const out: DetectedQuestion[] = [];

  for (const raw of sentences) {
    const sentence = raw.replace(/\s+/g, ' ').trim();
    if (sentence.length > 240) continue; // very long lines are usually paragraphs, not questions
    const hasQ = sentence.endsWith('?');
    const isRequest = REQUEST_VERB.test(sentence);
    if (!hasQ && !isRequest) continue;

    const topics = topicsFor(sentence);
    if (topics.length === 0) continue;

    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: hashId(key), text: sentence, topics });
    if (out.length >= 12) break;
  }

  return out;
}
