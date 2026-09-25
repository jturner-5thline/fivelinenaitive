import { supabase } from '@/integrations/supabase/client';
import { sanitizeStatusSuggestion } from '@/lib/staleNoteSanitize';

const FREEMAIL = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com','live.com','msn.com',
  'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net',
  'ymail.com','fastmail.com','hey.com','zoho.com','yandex.com','mail.com','duck.com','tutanota.com',
]);

const domainOf = (a: string) => String(a || '').toLowerCase().split('@')[1]?.replace(/[>\s].*$/, '').trim() ?? '';
const cleanDomain = (raw: string) =>
  String(raw || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
const stripHtml = (s: string) =>
  s.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function latestPart(body: string) {
  const cut = body.search(/(\bOn .{5,120} wrote:|-----Original Message-----|\bFrom: .{3,120}\bSent: )/i);
  return (cut > 40 ? body.slice(0, cut) : body).slice(0, 1500);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripEntity = (s: string) =>
  s.replace(/[,.]?\s*\b(llc|l\.l\.c\.|inc|inc\.|corp|corp\.|corporation|co\.|ltd|ltd\.|lp|l\.p\.|plc|holdings)\b\.?/gi, '').trim();

export interface DraftLenderResult {
  ok: boolean;
  text: string;
  emailCount: number;
  lenderName: string;
  dealName: string;
  reason?: 'no_contacts' | 'no_emails' | 'llm_error';
}

const SYSTEM_PROMPT =
  'You write a funding source status update for an M&A / debt advisory team, based on recent emails with a lender/investor about ONE specific deal. ' +
  'Output exactly ONE concise, natural-language sentence (max ~200 characters) capturing the funding source\'s current stance, feedback, ' +
  'diligence requests, or next steps — e.g. "Reviewing financials; expects to come back with indicative terms by 10/2." or "Passed — too early-stage for their credit box." ' +
  'Base it on the MOST RECENT meaningful exchange. Ignore content about other deals. No prefix, no bullets, no quotes, no signature. Output only the sentence.';

export async function draftLenderStatusFromEmails(dealLenderId: string): Promise<DraftLenderResult> {
  const { data: dl } = await (supabase.from('deal_lenders') as any).select('*').eq('id', dealLenderId).maybeSingle();
  const lender: any = dl || {};
  const lenderName = String(lender.lender_name || 'Funding source');
  const { data: dealRow } = lender.deal_id
    ? await supabase.from('deals').select('company').eq('id', lender.deal_id).maybeSingle()
    : { data: null };
  const dealName = String((dealRow as any)?.company || '').trim();
  const base = { lenderName, dealName, emailCount: 0, text: '', ok: false };

  // 1) Funding source contact emails + domains
  const emails = new Set<string>();
  const addEmail = (e: any) => { const s = String(e || '').trim().toLowerCase(); if (/@/.test(s)) emails.add(s); };
  const contactIds: string[] = [];
  if (lender.selected_contact_id) contactIds.push(lender.selected_contact_id);
  if (lender.master_lender_id) {
    const [{ data: lcs }, { data: ml }] = await Promise.all([
      (supabase.from('lender_contacts') as any).select('email').eq('lender_id', lender.master_lender_id),
      (supabase.from('master_lenders') as any).select('*').eq('id', lender.master_lender_id).maybeSingle(),
    ]);
    (lcs || []).forEach((c: any) => addEmail(c.email));
    if (ml) {
      addEmail(ml.email);
      addEmail(ml.contact_email);
      var mlWebsite = ml.website || ml.website_url || ml.domain || '';
    }
  }
  if (contactIds.length) {
    const { data } = await (supabase.from('lender_contacts') as any).select('email').in('id', contactIds);
    (data || []).forEach((c: any) => addEmail(c.email));
  }
  const domains = new Set<string>();
  emails.forEach((e) => { const d = domainOf(e); if (d && !FREEMAIL.has(d)) domains.add(d); });
  // @ts-ignore - declared in block above
  const w = cleanDomain(typeof mlWebsite === 'string' ? mlWebsite : '');
  if (w && /\./.test(w) && !FREEMAIL.has(w)) domains.add(w);
  if (!emails.size && !domains.size) return { ...base, reason: 'no_contacts' };

  // 2) Deal reference tokens
  const refs = Array.from(new Set([dealName, stripEntity(dealName)].map((s) => s.trim()).filter((s) => s.length >= 3)));
  const refRe = refs.length ? new RegExp(`\\b(${refs.map(escapeRe).join('|')})\\b`, 'i') : null;
  const mentionsDeal = (...parts: any[]) => !refRe || refRe.test(parts.map((p) => String(p || '')).join(' '));
  const matchesLender = (addrs: any[]) =>
    addrs.some((a) => { const s = String(a || '').toLowerCase(); return (s && emails.has(s)) || domains.has(domainOf(s)); });

  const since = new Date(Date.now() - 180 * 86400000);
  const sinceIso = since.toISOString();
  const gDate = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`;
  const terms = [...Array.from(domains), ...Array.from(emails)].slice(0, 10);
  const refQ = refs.length ? ` (${refs.map((r) => `"${r.replace(/"/g, '')}"`).join(' OR ')})` : '';
  const liveQuery = `(${terms.map((t) => `from:${t} OR to:${t} OR cc:${t}`).join(' OR ')})${refQ} after:${gDate}`;

  const live = supabase.functions
    .invoke('gmail-messages', { body: { action: 'list', max_results: 30, query: liveQuery, search_all_mail: true } })
    .then(({ data, error }: any) =>
      error || data?.fallback ? [] : (data?.messages || []).map((m: any) => ({
        gmail_message_id: m.id, subject: m.subject, from_email: m.from_email, from_name: m.from_name,
        to_emails: m.to_emails || [], cc_emails: m.cc_emails || [], received_at: m.received_at,
        _body: m.body_text || stripHtml(m.body_html || '') || m.snippet || '',
      })))
    .catch(() => []);

  const cols = 'gmail_message_id, subject, from_email, from_name, to_emails, cc_emails, received_at, snippet, body_text, body_html';
  const cached = (table: 'gmail_messages' | 'email_cache') =>
    (supabase.from(table as any) as any).select(cols).gte('received_at', sinceIso)
      .order('received_at', { ascending: false }).limit(1000)
      .then((r: any) => (r.data || []).map((m: any) => ({ ...m, _body: m.body_text || stripHtml(m.body_html || '') || m.snippet || '' })))
      .catch(() => []);

  const lists = await Promise.all([live, cached('gmail_messages'), cached('email_cache')]);
  const seen = new Map<string, any>();
  for (const m of lists.flat() as any[]) {
    if (!m.gmail_message_id || seen.has(m.gmail_message_id)) continue;
    if (!matchesLender([m.from_email, ...(m.to_emails || []), ...(m.cc_emails || [])])) continue;
    if (!mentionsDeal(m.subject, m._body, m.snippet)) continue;
    seen.set(m.gmail_message_id, m);
  }
  const top = Array.from(seen.values())
    .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
    .slice(0, 8);
  if (!top.length) return { ...base, reason: 'no_emails' };

  const blocks = top.map((m) => {
    const fromLender = matchesLender([m.from_email]);
    const d = m.received_at ? new Date(m.received_at).toLocaleDateString('en-US') : '';
    return `[${d}] ${fromLender ? 'FROM FUNDING SOURCE' : 'TO FUNDING SOURCE'} — from ${m.from_name || m.from_email}\nSubject: ${m.subject || '(no subject)'}\n${latestPart(m._body || '')}`;
  });
  const userPrompt =
    `Deal: ${dealName || 'Unknown'}\nFunding source: ${lenderName}\nToday: ${new Date().toLocaleDateString('en-US')}\n\n` +
    `Recent emails with this funding source about this deal (newest first):\n\n${blocks.join('\n\n---\n\n')}`;

  const { data, error } = await supabase.functions.invoke('smart-email-ai', {
    body: { action: 'suggest_status_update', dealId: lender.deal_id, systemPrompt: SYSTEM_PROMPT, userPrompt, fastModel: false },
  });
  const raw: string = data?.result?.text || '';
  if (error || data?.error_kind || !raw) return { ...base, emailCount: top.length, reason: 'llm_error' };
  const s = sanitizeStatusSuggestion(raw);
  return { ...base, ok: true, text: s.text || raw.trim(), emailCount: top.length };
}
