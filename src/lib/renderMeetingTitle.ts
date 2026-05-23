/**
 * renderMeetingTitle
 * ------------------
 * Stage-driven, template-based renderer used for AI-generated meeting
 * invite titles and meeting-suggestion email subject lines.
 *
 * Supported tokens (curly braces, case-sensitive):
 *   {company}            — deal.company_name
 *   {deal_name}          — deal.name (falls back to company)
 *   {stage}              — stage.label
 *   {lender}             — deal.lender_name
 *   {partner}            — deal.partner_name
 *   {referrer}           — deal.referrer_name
 *   {user_first_name}    — user.first_name
 *   {user_full_name}     — user.full_name
 *   {today_short}        — now formatted YYYY-MM-DD
 *
 * Behaviour:
 *  - Uses the per-stage template; falls back to the org Default; finally a
 *    hard-coded "[{stage}] {company}".
 *  - Missing tokens render as empty strings.
 *  - Empty parens / brackets ("()", "[]", "<>", "{}") and lone "—" / "-"
 *    separators left over from a missing token are collapsed.
 *  - Doubled whitespace is collapsed; result is trimmed.
 *  - Capped at 100 chars by middle-ellipsizing the company segment,
 *    preserving any leading "[…]" bracket prefix.
 */

export const MEETING_TITLE_TOKENS = [
  '{company}',
  '{deal_name}',
  '{stage}',
  '{lender}',
  '{partner}',
  '{referrer}',
  '{user_first_name}',
  '{user_full_name}',
  '{today_short}',
] as const;

export type MeetingTitleToken = (typeof MEETING_TITLE_TOKENS)[number];

export interface MeetingTitleDeal {
  company_name?: string | null;
  name?: string | null;
  stage_id?: string | null;
  stage_label?: string | null;
  lender_name?: string | null;
  partner_name?: string | null;
  referrer_name?: string | null;
}

export interface MeetingTitleUser {
  first_name?: string | null;
  full_name?: string | null;
}

export interface RenderMeetingTitleArgs {
  deal: MeetingTitleDeal;
  user?: MeetingTitleUser | null;
  now?: Date;
  /** Templates keyed by stage_id; empty string key holds the Default. */
  templates: Record<string, string>;
}

const HARD_FALLBACK = '[{stage}] {company}';
const MAX_LEN = 100;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTodayShort(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildSubstitutions(args: RenderMeetingTitleArgs): Record<string, string> {
  const { deal, user, now } = args;
  const company = (deal.company_name ?? '').trim();
  const dealName = (deal.name ?? '').trim() || company;
  return {
    '{company}': company,
    '{deal_name}': dealName,
    '{stage}': (deal.stage_label ?? '').trim(),
    '{lender}': (deal.lender_name ?? '').trim(),
    '{partner}': (deal.partner_name ?? '').trim(),
    '{referrer}': (deal.referrer_name ?? '').trim(),
    '{user_first_name}': (user?.first_name ?? '').trim(),
    '{user_full_name}': (user?.full_name ?? '').trim(),
    '{today_short}': formatTodayShort(now ?? new Date()),
  };
}

/** Replace tokens, leaving the literal token in place when value is missing. */
function applyTokens(template: string, subs: Record<string, string>): string {
  let out = template;
  for (const [tok, val] of Object.entries(subs)) {
    out = out.split(tok).join(val);
  }
  return out;
}

/** Collapse empty wrapping pairs left over from missing tokens. */
function cleanupEmptyDelimiters(s: string): string {
  let out = s;
  // Walk a few passes — nested cases like "( )" or "([])" can chain.
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out
      // Empty parens / brackets / braces / angle / chevron with only spaces.
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/<\s*>/g, '')
      .replace(/«\s*»/g, '')
      // " — " or " - " surrounded by whitespace at start/end of the cleaned
      // string, or doubled separators left over.
      .replace(/\s+[—-]\s+(?=$|\s*[—-]\s+)/g, ' ')
      .replace(/^[\s—-]+/, '')
      .replace(/[\s—-]+$/, '');
    if (out === before) break;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Squeeze the company segment to fit the cap, preserving the [bracket] prefix. */
function capLength(s: string, company: string): string {
  if (s.length <= MAX_LEN) return s;
  if (!company || company.length < 6 || !s.includes(company)) {
    return s.slice(0, MAX_LEN - 1).trimEnd() + '…';
  }
  const overflow = s.length - MAX_LEN + 1; // +1 for ellipsis
  const keepEach = Math.max(2, Math.floor((company.length - overflow) / 2));
  if (keepEach * 2 + 1 >= company.length) {
    return s.slice(0, MAX_LEN - 1).trimEnd() + '…';
  }
  const shortened = company.slice(0, keepEach) + '…' + company.slice(company.length - keepEach);
  const out = s.replace(company, shortened);
  return out.length <= MAX_LEN ? out : out.slice(0, MAX_LEN - 1).trimEnd() + '…';
}

export function resolveTemplate(stageId: string | null | undefined, templates: Record<string, string>): string {
  if (stageId && templates[stageId]?.trim()) return templates[stageId];
  if (templates['']?.trim()) return templates[''];
  return HARD_FALLBACK;
}

export function renderMeetingTitle(args: RenderMeetingTitleArgs): string {
  const template = resolveTemplate(args.deal.stage_id, args.templates);
  const subs = buildSubstitutions(args);
  const substituted = applyTokens(template, subs);
  const cleaned = cleanupEmptyDelimiters(substituted);
  const company = subs['{company}'];
  return capLength(cleaned, company);
}

/** Default templates seeded into the editor when no row exists yet. */
export const SEED_TEMPLATES: Array<{ matchLabel: RegExp; template: string }> = [
  { matchLabel: /^discovery$/i, template: '[Discovery] {company} × 5th Line' },
  { matchLabel: /^qualification/i, template: '[Qualification] {company} — Intro' },
  { matchLabel: /^term sheet/i, template: '[Term Sheet] {company} — Walkthrough' },
  { matchLabel: /^proposal( issued)?$/i, template: '[Proposal Review] {company} — Proposal Walkthrough' },
  { matchLabel: /^lender(s)?( review| in review)?$/i, template: '[Lender Sync] {company} ({lender})' },
  { matchLabel: /^final credit/i, template: '[Final Credit Items] {company} — Close-out' },
  { matchLabel: /^(funded|invoiced)/i, template: '[Kickoff] {company}' },
];

export const DEFAULT_TEMPLATE_FALLBACK = '[{stage}] {company} — {user_first_name}';