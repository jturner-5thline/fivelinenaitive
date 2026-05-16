import { sendClaudeMessage } from '@/services/claude';
import {
  type AIDealFilterSpec,
  type DealFilterRule,
  sanitizeRules,
} from '@/lib/dealFilterEngine';

export interface NlFilterContext {
  stages: { id: string; label: string }[];
  managers: string[];
  lenders: string[];
  dealTypes: { id: string; label: string }[];
  /** ISO date used for relative reasoning. */
  todayIso?: string;
}

const SYSTEM_PROMPT = `You are a filter compiler for the Naitive deal board.
You translate a user's natural-language request into a strict JSON filter
spec that the board can apply. Always answer with a single JSON object —
no prose, no markdown, no code fences.

RESPONSE SHAPE:
{
  "filters": [ { "id": "string", "field": "FIELD", "op": "OP", "value": <any>, "label": "Human readable chip" } ],
  "matchMode": "all" | "any",
  "summary": "Short one-sentence confirmation of what was applied.",
  "replace": boolean,   // true if the user said "clear filters and ..." or "only show"
  "clearAll": boolean,  // true if the request is just "clear filters"
  "clarification": string | null  // set ONLY if the request cannot be understood
}

ALLOWED FIELDS:
  name, company, value (USD number), stage (string id), stage_order (numeric
  pipeline position), status (on-track|at-risk|off-track|on-hold|archived),
  engagementType (guided|advisory|managed-process), dealTypes (array of ids),
  manager (display name), dealOwner (display name), lender (display name),
  lenderCount (number), referredBy (name), closingDate, createdAt,
  updatedAt, retainerFee, milestoneFee, totalFee, isFlagged, onHold.

ALLOWED OPS:
  equals, not_equals, in, not_in, contains, not_contains,
  gt, gte, lt, lte, between, is_null, is_not_null, is_true, is_false,
  before, after, in_last_days, in_next_days, older_than_days.

RULES:
- "without X" / "no X" / "missing X" → op "is_null" on the field.
- "with retainers" / "retainer paid" → field "retainerFee" op "gt" value 0.
- "no retainer" / "without retainer" → field "retainerFee" op "is_null".
- Dollar amounts: parse $5M → 5000000, $1M → 1000000, $500K → 500000.
- "over X" / "greater than X" → gt; "smaller than" / "under" → lt;
  "between A and B" → op "between" value [A, B].
- Pipeline-order phrasing ("X or later", "before X", "after X") → use field
  "stage_order" with op gte/lte/gt/lt and value = stage id (e.g. "final-credit-items").
- Stage equality ("in due diligence") → field "stage", op "equals",
  value = matching stage id from the provided list.
- "this quarter", "last 14 days", "next 30 days" map to closingDate/updatedAt
  with in_last_days / in_next_days / older_than_days.
- "no activity in last N days" → field "updatedAt" op "older_than_days" value N.
- "deals I haven't touched this week" → updatedAt older_than_days 7.
- "running behind" → field "status" op "equals" value "at-risk".
- "funded" / "closed" → field "stage" op "in" value ["funded-invoiced","closed-won"].
- "hide funded" → field "stage" op "not_in" value ["funded-invoiced"].
- "tagged X" → field "dealTypes" op "contains" value "<id-from-dealTypes-list>".
- Combine clauses with "and" → matchMode "all"; "or" → matchMode "any".
- Names: match against the provided manager / lender list case-insensitively.
- If you cannot resolve a field name confidently, set "clarification" to a
  short follow-up question and leave "filters" empty.
- Always populate "label" with a concise chip string like
  "Closing date is missing" or "Value > $5M" or "Manager: Niki".

Return the JSON only.`;

function extractJson(text: string): AIDealFilterSpec | null {
  if (!text) return null;
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try { return JSON.parse(cleaned) as AIDealFilterSpec; } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) as AIDealFilterSpec; } catch { /* ignore */ }
  }
  return null;
}

function buildUserPrompt(query: string, ctx: NlFilterContext): string {
  const today = ctx.todayIso ?? new Date().toISOString().slice(0, 10);
  return [
    `TODAY: ${today}`,
    'STAGES (id — label, in pipeline order):',
    ctx.stages.map((s, i) => `  ${i}. ${s.id} — ${s.label}`).join('\n') || '  (none)',
    `MANAGERS: ${ctx.managers.slice(0, 50).join(', ') || '(none)'}`,
    `LENDERS: ${ctx.lenders.slice(0, 50).join(', ') || '(none)'}`,
    'DEAL TYPES (id — label):',
    ctx.dealTypes.map((t) => `  ${t.id} — ${t.label}`).join('\n') || '  (none)',
    '',
    `USER REQUEST: ${query}`,
  ].join('\n');
}

/**
 * Translate a natural-language filter request into a structured spec.
 * Reusable for tasks/calendar/etc. — only the SYSTEM prompt + context
 * shape would change.
 */
export async function naturalLanguageToDealFilter(
  query: string,
  ctx: NlFilterContext,
): Promise<AIDealFilterSpec> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { filters: [], summary: '', clarification: 'Type a filter request.' };
  }

  // Local fast-path: "clear filters", "reset filters".
  if (/^\s*(clear|reset|remove)\s+(all\s+)?(ai\s+)?filters?\s*\.?$/i.test(trimmed)) {
    return { filters: [], clearAll: true, summary: 'Cleared all AI filters.' };
  }

  const userPrompt = buildUserPrompt(trimmed, ctx);

  const res = await sendClaudeMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0,
    max_tokens: 1200,
    context: 'chat',
    usage: { feature_subtype: 'nl_deal_filter', skip: false },
  });

  if (!res.success) {
    return {
      filters: [],
      clarification: res.error || 'AI is unavailable right now. Try again in a moment.',
    };
  }

  const parsed = extractJson(res.response);
  if (!parsed) {
    return {
      filters: [],
      clarification: "I couldn't translate that into filters. Try rephrasing — e.g. \"deals over $5M\" or \"deals without closing dates\".",
    };
  }

  const cleanRules: DealFilterRule[] = sanitizeRules(parsed.filters);
  return {
    filters: cleanRules,
    matchMode: parsed.matchMode === 'any' ? 'any' : 'all',
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    clarification:
      cleanRules.length === 0 && !parsed.clearAll
        ? parsed.clarification || "I couldn't translate that into filters. Try rephrasing."
        : null,
    replace: Boolean(parsed.replace),
    clearAll: Boolean(parsed.clearAll),
  };
}