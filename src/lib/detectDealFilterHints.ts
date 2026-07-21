/**
 * Lightweight, offline detector that peeks at a user prompt before it is
 * shipped to the Copilot server and reports the intent + deal filters it
 * would likely apply. Used by the Ask naitive confirmation preview so the
 * user can review what the assistant "heard" before any tool runs.
 *
 * Intentionally regex-only — no LLM call, no network — so it stays fast and
 * safe to run on every keystroke-submit. False negatives are acceptable
 * (the prompt just runs like today); false positives should be rare so we
 * don't nag the user for pure Q&A.
 */

export type DealFilterIntent =
  | 'list'
  | 'update'
  | 'summarize'
  | 'compare'
  | 'other';

export interface DetectedFilterChip {
  label: string;
  kind: 'stage' | 'status' | 'value' | 'manager' | 'lender' | 'date' | 'flag' | 'tag' | 'missing';
}

export interface DealFilterPreview {
  intent: DealFilterIntent;
  intentLabel: string;
  filters: DetectedFilterChip[];
}

const STAGE_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(on\s*deck)\b/i, label: 'Stage: On Deck' },
  { re: /\b(in\s*review|reviewing)\b/i, label: 'Stage: In Review' },
  { re: /\b(unresponsive)\b/i, label: 'Stage: Unresponsive' },
  { re: /\b(passed|declined)\b/i, label: 'Stage: Passed' },
  { re: /\b(on\s*hold)\b/i, label: 'Stage: On Hold' },
  { re: /\b(due\s*diligence|dd)\b/i, label: 'Stage: Due Diligence' },
  { re: /\b(terms?\s*(issued|out))\b/i, label: 'Stage: Terms Issued' },
  { re: /\b(signed|term\s*sheet\s*signed)\b/i, label: 'Stage: Signed' },
  { re: /\b(closed(?:[-\s]won)?|funded)\b/i, label: 'Stage: Closed / Funded' },
  { re: /\b(active\s*pipeline)\b/i, label: 'Active Pipeline only' },
];

const STATUS_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(on[-\s]?track)\b/i, label: 'Status: On Track' },
  { re: /\b(at[-\s]?risk|running\s*behind)\b/i, label: 'Status: At Risk' },
  { re: /\b(off[-\s]?track|stalled|stuck)\b/i, label: 'Status: Off Track' },
  { re: /\b(archived)\b/i, label: 'Status: Archived' },
  { re: /\b(flagged)\b/i, label: 'Flagged deals' },
];

const MISSING_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /\bno\s+tasks?\b|without\s+tasks?|missing\s+tasks?|need(?:s)?\s+tasks?/i, label: 'Missing: Tasks' },
  { re: /\bno\s+closing\s+date|missing\s+closing\s+date|without\s+closing\s+date/i, label: 'Missing: Closing date' },
  { re: /\bno\s+lender|without\s+lenders?|missing\s+lenders?/i, label: 'Missing: Lenders' },
  { re: /\bno\s+manager|without\s+managers?|unassigned/i, label: 'Missing: Manager' },
  { re: /\bno\s+retainer|without\s+retainer/i, label: 'Missing: Retainer' },
  { re: /\bno\s+notes?|without\s+notes?/i, label: 'Missing: Notes' },
];

const DATE_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /\bthis\s+quarter\b/i, label: 'Timeframe: This quarter' },
  { re: /\bnext\s+quarter\b/i, label: 'Timeframe: Next quarter' },
  { re: /\bthis\s+week\b/i, label: 'Timeframe: This week' },
  { re: /\bthis\s+month\b/i, label: 'Timeframe: This month' },
  { re: /\blast\s+(\d+)\s+days?\b/i, label: 'Timeframe: Last N days' },
  { re: /\bnext\s+(\d+)\s+days?\b/i, label: 'Timeframe: Next N days' },
  { re: /\bhaven'?t\s+touched\b/i, label: 'No activity recently' },
  { re: /\bstale\b/i, label: 'Stale deals' },
];

const TAG_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(advisory)\b/i, label: 'Tag: Advisory' },
  { re: /\b(abl)\b/i, label: 'Tag: ABL' },
  { re: /\b(finserv)\b/i, label: 'Tag: FinServ' },
  { re: /\b(managed\s*process)\b/i, label: 'Tag: Managed Process' },
  { re: /\b(guided)\b/i, label: 'Tag: Guided' },
];

function detectValueRange(text: string): DetectedFilterChip[] {
  const out: DetectedFilterChip[] = [];
  const money = /\$?\s?(\d+(?:\.\d+)?)\s?(mm|m|k)?\b/gi;
  const over = /(over|greater\s+than|above|more\s+than|>=?)\s+\$?\s?(\d+(?:\.\d+)?)\s?(mm|m|k)?/i.exec(text);
  const under = /(under|less\s+than|below|smaller\s+than|<=?)\s+\$?\s?(\d+(?:\.\d+)?)\s?(mm|m|k)?/i.exec(text);
  const between = /between\s+\$?\s?(\d+(?:\.\d+)?)\s?(mm|m|k)?\s+(?:and|to|-)\s+\$?\s?(\d+(?:\.\d+)?)\s?(mm|m|k)?/i.exec(text);
  if (between) out.push({ kind: 'value', label: `Deal size: ${between[1]}${between[2] ?? ''}–${between[3]}${between[4] ?? ''}` });
  else if (over) out.push({ kind: 'value', label: `Deal size > $${over[2]}${over[3] ?? ''}` });
  else if (under) out.push({ kind: 'value', label: `Deal size < $${under[2]}${under[3] ?? ''}` });
  // consume iterator to avoid unused lint
  void money;
  return out;
}

function detectManagerOrLender(text: string): DetectedFilterChip[] {
  const out: DetectedFilterChip[] = [];
  const mgr = /\b(?:manager|owner|managed\s+by|owned\s+by|assigned\s+to)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/.exec(text);
  if (mgr) out.push({ kind: 'manager', label: `Manager: ${mgr[1]}` });
  const lender = /\b(?:lender|funded\s+by|with\s+lender)\s+([A-Z][A-Za-z0-9&.\-\s]{1,40})/.exec(text);
  if (lender) out.push({ kind: 'lender', label: `Lender: ${lender[1].trim()}` });
  return out;
}

function detectIntent(text: string): { intent: DealFilterIntent; intentLabel: string } {
  const t = text.toLowerCase();
  if (/\b(update|set|mark|change|move|reassign|add|create|send|email|draft)\b/.test(t)) {
    return { intent: 'update', intentLabel: 'Update / take action' };
  }
  if (/\b(summari[sz]e|summary|recap|briefing|overview)\b/.test(t)) {
    return { intent: 'summarize', intentLabel: 'Summarize' };
  }
  if (/\b(compare|vs\.?|versus|difference)\b/.test(t)) {
    return { intent: 'compare', intentLabel: 'Compare' };
  }
  if (/\b(list|show|which|what|who|how many|count|find|any|are there)\b/.test(t)) {
    return { intent: 'list', intentLabel: 'List / lookup' };
  }
  return { intent: 'other', intentLabel: 'Ask' };
}

export function detectDealFilterHints(raw: string): DealFilterPreview | null {
  const text = (raw || '').trim();
  if (!text || text.length < 4) return null;

  // Only preview when the user is talking about deals in some way.
  const isDealShaped =
    /\bdeals?\b|\bpipeline\b|\blenders?\b|\bfunding\b|\bmanaged\s+by\b/i.test(text);
  if (!isDealShaped) return null;

  const filters: DetectedFilterChip[] = [];
  for (const h of STAGE_HINTS) if (h.re.test(text)) filters.push({ kind: 'stage', label: h.label });
  for (const h of STATUS_HINTS) if (h.re.test(text)) filters.push({ kind: 'status', label: h.label });
  for (const h of MISSING_HINTS) if (h.re.test(text)) filters.push({ kind: 'missing', label: h.label });
  for (const h of DATE_HINTS) if (h.re.test(text)) filters.push({ kind: 'date', label: h.label });
  for (const h of TAG_HINTS) if (h.re.test(text)) filters.push({ kind: 'tag', label: h.label });
  filters.push(...detectValueRange(text));
  filters.push(...detectManagerOrLender(text));

  // De-dupe by label.
  const seen = new Set<string>();
  const unique = filters.filter((f) => (seen.has(f.label) ? false : (seen.add(f.label), true)));

  // Only surface the preview when at least one deal filter is detected —
  // per product spec, general Q&A should still run immediately.
  if (unique.length === 0) return null;

  const { intent, intentLabel } = detectIntent(text);
  return { intent, intentLabel, filters: unique };
}