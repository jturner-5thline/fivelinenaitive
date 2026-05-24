import { supabase } from '@/integrations/supabase/client';
import { sanitizeStatusSuggestion } from '@/lib/staleNoteSanitize';

export interface StatusNudgeContext {
  dealId: string;
  companyName?: string | null;
  stageLabel?: string | null;
  daysInStage?: number | null;
  currentNote?: string | null;
  lendersSent: Array<{ name: string; sentAt?: string | null }>;
  lendersPassed: Array<{ name: string; passedAt?: string | null; reason?: string | null }>;
  recentClientEmails: Array<{ direction: 'in' | 'out'; subject?: string | null; at?: string | null }>;
  lastMeetingSummary?: { at?: string | null; summary?: string | null } | null;
  outstandingItems?: Array<{ title: string; status?: string | null }>;
}

export interface StatusSuggestionResult {
  text: string;
  ok: boolean;
  raw?: string;
  sources: string[];
  errorKind?: 'empty' | 'llm_error' | 'invoke_error' | 'bad_request';
  detail?: string;
}

function buildPrompt(ctx: StatusNudgeContext): string {
  const lines: string[] = [];
  lines.push(`Deal: ${ctx.companyName || 'Unknown'}`);
  if (ctx.stageLabel) lines.push(`Stage: ${ctx.stageLabel}${ctx.daysInStage != null ? ` (${ctx.daysInStage} days in stage)` : ''}`);
  if (ctx.currentNote) lines.push(`Current status note: ${ctx.currentNote}`);
  if (ctx.lendersSent.length) {
    lines.push(`Lenders sent (${ctx.lendersSent.length}): ${ctx.lendersSent.map(l => `${l.name}${l.sentAt ? ` ${l.sentAt}` : ''}`).join(', ')}`);
  }
  if (ctx.lendersPassed.length) {
    lines.push(`Lenders passed (${ctx.lendersPassed.length}): ${ctx.lendersPassed.map(l => `${l.name}${l.reason ? ` — ${l.reason}` : ''}`).join(', ')}`);
  }
  if (ctx.recentClientEmails.length) {
    const last = ctx.recentClientEmails.slice(0, 6)
      .map(e => `${e.at ? `${e.at} ` : ''}${e.direction === 'in' ? 'inbound' : 'outbound'}: ${e.subject || '(no subject)'}`)
      .join('; ');
    lines.push(`Recent emails (last 14d): ${last}`);
  }
  if (ctx.lastMeetingSummary?.summary) {
    lines.push(`Last meeting${ctx.lastMeetingSummary.at ? ` (${ctx.lastMeetingSummary.at})` : ''}: ${ctx.lastMeetingSummary.summary}`);
  }
  if (ctx.outstandingItems?.length) {
    lines.push(`Outstanding items: ${ctx.outstandingItems.map(i => `${i.title}${i.status ? ` [${i.status}]` : ''}`).join(', ')}`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT =
  'You write a 1–2 sentence factual status update for an M&A / debt advisory deal. ' +
  'Strict constraints: maximum 280 characters total, plain prose, no headers, no bullets, ' +
  'no "Topic:"/"Status:" prefix, no signature, no quoted email. Reference at least one ' +
  'concrete datum (lender name, email date, meeting takeaway, or outstanding item). ' +
  'If activity is contradictory, prefer the most recent. Output only the update text.';

/**
 * Returns a sanitized 1–2 sentence status update. Returns ok=false when
 * generation or validation fails so the UI can offer "Generate again".
 */
export async function suggestStatusNoteUpdate(ctx: StatusNudgeContext): Promise<StatusSuggestionResult> {
  const userPrompt = buildPrompt(ctx);
  const sources = collectSources(ctx);
  try {
    const { data, error } = await supabase.functions.invoke('smart-email-ai', {
      body: {
        action: 'suggest_status_update',
        dealId: ctx.dealId,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        fastModel: true,
      },
    });
    if (error) {
      return { text: '', ok: false, sources, errorKind: 'invoke_error', detail: String((error as any)?.message || error) };
    }
    if (data?.error_kind) {
      return { text: '', ok: false, sources, errorKind: data.error_kind, detail: data?.message };
    }
    const raw: string | undefined =
      data?.result?.text ||
      data?.result?.summary ||
      data?.result?.suggestion ||
      data?.text ||
      data?.summary ||
      (typeof data === 'string' ? data : undefined);
    if (!raw || typeof raw !== 'string') {
      return { text: '', ok: false, sources, errorKind: 'empty' };
    }
    const sanitized = sanitizeStatusSuggestion(raw);
    if (!sanitized.ok) {
      return { text: sanitized.text, ok: false, raw, sources, errorKind: 'empty' };
    }
    return { text: sanitized.text, ok: true, raw, sources };
  } catch (e) {
    return { text: '', ok: false, sources, errorKind: 'invoke_error', detail: e instanceof Error ? e.message : String(e) };
  }
}

export function collectSources(ctx: StatusNudgeContext): string[] {
  const out: string[] = [];
  if (ctx.lendersSent.length) {
    const names = ctx.lendersSent.slice(0, 3).map(l => l.name).join(', ');
    out.push(`${ctx.lendersSent.length} lender${ctx.lendersSent.length === 1 ? '' : 's'} sent${names ? ` (${names}${ctx.lendersSent.length > 3 ? ', …' : ''})` : ''}`);
  }
  if (ctx.lendersPassed.length) {
    out.push(`${ctx.lendersPassed.length} lender${ctx.lendersPassed.length === 1 ? '' : 's'} passed`);
  }
  if (ctx.recentClientEmails.length) {
    out.push(`${ctx.recentClientEmails.length} recent client email${ctx.recentClientEmails.length === 1 ? '' : 's'}`);
  }
  if (ctx.lastMeetingSummary?.summary) {
    out.push(`Last meeting summary${ctx.lastMeetingSummary.at ? ` (${ctx.lastMeetingSummary.at})` : ''}`);
  }
  if (ctx.outstandingItems?.length) {
    out.push(`${ctx.outstandingItems.length} outstanding item${ctx.outstandingItems.length === 1 ? '' : 's'}`);
  }
  if (ctx.stageLabel) {
    out.push(`Stage: ${ctx.stageLabel}${ctx.daysInStage != null ? ` (${ctx.daysInStage}d)` : ''}`);
  }
  return out;
}

export function hasSufficientActivity(ctx: StatusNudgeContext): boolean {
  return (
    ctx.lendersSent.length > 0 ||
    ctx.lendersPassed.length > 0 ||
    ctx.recentClientEmails.length > 0 ||
    !!ctx.lastMeetingSummary?.summary ||
    (ctx.outstandingItems?.length ?? 0) > 0
  );
}