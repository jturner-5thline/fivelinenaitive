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
  /**
   * Best-guess Deal Space field(s) that hold the answer for the matched
   * topics. Forwarded to `deal-space-ai` so the model knows where to look
   * first instead of doing a broad RAG sweep — improves both speed and
   * answer precision for well-known lender questions like DSCR, runway,
   * NRR, etc.
   */
  suggestedFields: string[];
}

// Keep this list TIGHT — broad words like "money" cause noise. Each entry
// also declares the Deal Space field(s) most likely to hold the answer so
// the downstream RAG call can search the right corner first.
//
// Field labels mirror the canonical Deal Space sections / write-up columns:
//   • Financials        → P&L statements, financial model, gross/operating margin
//   • Debt schedule     → existing_debt_details, covenants, lender terms
//   • Collateral        → collateral_available, security interest table
//   • Use of funds      → use_of_funds (write-up)
//   • Cap table         → equity raised, ownership
//   • Write-up          → company description, highlights, key items
//   • SaaS metrics      → ARR/MRR/NRR/GRR/churn — usually in financial model
//   • Unit economics    → CAC, LTV, payback, contribution margin
//   • Credit metrics    → DSCR, FCCR, ICR, leverage ratios
const FINANCE_KEYWORDS: Array<{
  topic: string;
  pattern: RegExp;
  fields: string[];
}> = [
  // ── Top-line / SaaS revenue ─────────────────────────────────────────
  {
    topic: 'ARR / MRR',
    pattern: /\b(arr|mrr|annual recurring|monthly recurring|recurring revenue)\b/i,
    fields: ['Financials (Revenue)', 'Write-up: revenue_type / billing_model'],
  },
  {
    topic: 'Revenue',
    pattern: /\brevenue|top.?line|gross sales|net sales|bookings\b/i,
    fields: ['Financials (P&L)', 'Write-up: last_year_revenue / this_year_revenue'],
  },
  {
    topic: 'Net revenue retention',
    pattern: /\b(net revenue retention|nrr|net dollar retention|ndr|gross retention|grr|expansion revenue|net retention)\b/i,
    fields: ['Financials (SaaS metrics)', 'Customer cohort analysis'],
  },
  {
    topic: 'Customer concentration',
    pattern: /\b(customer concentration|top \d+ customers?|concentration risk|largest customer|key accounts?)\b/i,
    fields: ['Financials (Customer breakdown)', 'Write-up: company_highlights'],
  },
  {
    topic: 'Churn',
    pattern: /\b(churn|attrition|cancellation rate|logo churn|gross churn|net churn)\b/i,
    fields: ['Financials (SaaS metrics)', 'Customer cohort analysis'],
  },
  // ── Profitability & margins ─────────────────────────────────────────
  {
    topic: 'EBITDA / Profit',
    pattern: /\bebitda|adjusted ebitda|operating (income|profit)|net income|operating profit\b/i,
    fields: ['Financials (P&L)', 'Write-up: profitability'],
  },
  {
    topic: 'Margins',
    pattern: /\b(gross|operating|contribution|net|ebitda) margin|margin profile\b/i,
    fields: ['Financials (P&L)', 'Write-up: gross_margins'],
  },
  // ── Cash, runway, working capital ───────────────────────────────────
  {
    topic: 'Cash / Liquidity',
    pattern: /\bcash (balance|on hand|position|reserves?)|liquidity|cash flow statement\b/i,
    fields: ['Financials (Balance Sheet)', 'QuickBooks: Bank/Credit balances'],
  },
  {
    topic: 'Runway',
    pattern: /\brunway|months? of cash|cash runway\b/i,
    fields: ['Financials (Cash + monthly burn)'],
  },
  {
    topic: 'Burn rate',
    pattern: /\b(burn rate|gross burn|net burn|monthly burn|cash burn)\b/i,
    fields: ['Financials (Operating cash flow)'],
  },
  {
    topic: 'Working capital',
    pattern: /\bworking capital|days? sales? outstanding|dso|days? payable|dpo|inventory days|cash conversion cycle\b/i,
    fields: ['Financials (Balance Sheet)'],
  },
  // ── Debt, leverage, credit metrics ──────────────────────────────────
  {
    topic: 'Existing debt',
    pattern: /\b(existing )?debt|loan|credit facility|term loan|revolver|line of credit|loc|note payable|mezzanine|sub debt|subordinated\b/i,
    fields: ['Debt schedule', 'Write-up: existing_debt_details'],
  },
  {
    topic: 'Leverage',
    pattern: /\bleverage|debt[\s/-]to[\s-]?ebitda|debt\/ebitda|net debt|total debt ratio|leverage ratio|funded debt\b/i,
    fields: ['Debt schedule', 'Financials (Debt / EBITDA)'],
  },
  {
    topic: 'DSCR / Coverage',
    pattern: /\b(dscr|debt service coverage|fccr|fixed charge coverage|interest coverage|icr|tdsc|coverage ratio)\b/i,
    fields: ['Debt schedule', 'Financials (EBITDA / Debt service)'],
  },
  {
    topic: 'Covenants',
    pattern: /\bcovenants?|covenant compliance|maintenance covenant|incurrence covenant|negative covenant\b/i,
    fields: ['Debt schedule (covenants)', 'Loan agreement attachments'],
  },
  {
    topic: 'Amortization',
    pattern: /\bamortization|amort schedule|principal payments?|maturity( date)?|repayment schedule\b/i,
    fields: ['Debt schedule'],
  },
  // ── Collateral & security ───────────────────────────────────────────
  {
    topic: 'Collateral',
    pattern: /\bcollateral|security interest|lien|encumbrance|pledged assets|ucc|first lien|second lien|guarant(?:y|ee)\b/i,
    fields: ['Collateral schedule', 'Write-up: collateral_available'],
  },
  // ── Use of funds & deployment ───────────────────────────────────────
  {
    topic: 'Use of funds',
    pattern: /\buse of (funds|proceeds)|deployment plan|capital plan|sources and uses\b/i,
    fields: ['Write-up: use_of_funds'],
  },
  // ── Capital structure ───────────────────────────────────────────────
  {
    topic: 'Valuation / Cap table',
    pattern: /\bvaluation|enterprise value|ev\/(?:ebitda|revenue|arr)|equity value|cap table|fully diluted|preference stack|liquidation preference\b/i,
    fields: ['Cap table', 'Write-up: total_equity_raised / sponsorship'],
  },
  // ── Unit economics ──────────────────────────────────────────────────
  {
    topic: 'Unit economics',
    pattern: /\b(cac|customer acquisition cost|ltv|lifetime value|ltv[:\s/]?cac|payback period|magic number|rule of 40)\b/i,
    fields: ['Financials (SaaS metrics)', 'Sales efficiency model'],
  },
  // ── People ──────────────────────────────────────────────────────────
  {
    topic: 'Headcount',
    pattern: /\bheadcount|employees|fte|team size|org chart\b/i,
    fields: ['Write-up: headcount', 'Org chart attachments'],
  },
  // ── Pipeline / forecast ─────────────────────────────────────────────
  {
    topic: 'Pipeline / Forecast',
    pattern: /\b(sales )?pipeline|booked|backlog|forecast|projections?|budget\b/i,
    fields: ['Financials (Forecast)', 'Sales pipeline reports'],
  },
  // ── Capex / Opex ────────────────────────────────────────────────────
  {
    topic: 'Capex / Opex',
    pattern: /\bcapex|opex|operating expenses|capital expenditures?|maintenance capex|growth capex\b/i,
    fields: ['Financials (P&L / Cash flow)'],
  },
  // ── Tax & compliance ────────────────────────────────────────────────
  {
    topic: 'Taxes',
    pattern: /\btax returns?|tax filings?|effective tax rate|nol|net operating loss\b/i,
    fields: ['Financials (Tax returns)', 'VDR: tax documents'],
  },
  // ── Customers / contracts (separate from churn above) ───────────────
  {
    topic: 'Customers',
    pattern: /\b(customers?|logos?|contract length|average contract value|acv|tcv|term length|renewal terms?)\b/i,
    fields: ['Financials (Customer breakdown)', 'Write-up: company_highlights'],
  },
  // ── Outstanding diligence ───────────────────────────────────────────
  {
    topic: 'Outstanding items',
    pattern: /\boutstanding|missing|pending items?|checklist|diligence list|open items?\b/i,
    fields: ['Outstanding items checklist'],
  },
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

function topicsFor(sentence: string): { topics: string[]; fields: string[] } {
  const topics: string[] = [];
  const fieldSet = new Set<string>();
  for (const { topic, pattern, fields } of FINANCE_KEYWORDS) {
    if (pattern.test(sentence)) {
      topics.push(topic);
      for (const f of fields) fieldSet.add(f);
    }
  }
  return { topics, fields: Array.from(fieldSet) };
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

    const { topics, fields } = topicsFor(sentence);
    if (topics.length === 0) continue;

    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: hashId(key), text: sentence, topics, suggestedFields: fields });
    if (out.length >= 12) break;
  }

  return out;
}
