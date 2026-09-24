import { supabase } from '@/integrations/supabase/client';
import { sanitizeStatusSuggestion } from '@/lib/staleNoteSanitize';

const FREEMAIL = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com','live.com','msn.com',
  'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net',
  'ymail.com','fastmail.com','hey.com','zoho.com','yandex.com','mail.com','duck.com','tutanota.com',
]);

const domainOf = (a: string) => String(a || '').toLowerCase().split('@')[1]?.replace(/[>\s].*$/, '').trim() ?? '';

function stripHtml(s: string) {
  return s.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Drop quoted history so the model reads only the newest part of each email. */
function latestPart(body: string) {
  const cut = body.search(/(\bOn .{5,120} wrote:|-----Original Message-----|\bFrom: .{3,120}\bSent: )/i);
  return (cut > 40 ? body.slice(0, cut) : body).slice(0, 1500);
}

export interface DraftFromEmailsResult {
  ok: boolean;
  text: string;
  emailCount: number;
  reason?: 'no_domains' | 'no_emails' | 'llm_error';
}

const SYSTEM_PROMPT =
  'You write a deal status update for an M&A / debt advisory team, based on recent emails with the client. ' +
  'Output exactly ONE concise, natural-language sentence (max ~200 characters) capturing where things stand ' +
  'and what happens next — e.g. "Client wants to revisit in October." or "Client will send the financials over next week." ' +
  'Base it on the MOST RECENT meaningful exchange. Use short dates like 9/22 only when useful. ' +
  'No prefix, no bullets, no quotes, no signature. Output only the sentence.';

export async function draftStatusFromEmails(dealId: string): Promise<DraftFromEmailsResult> {
  const { data: dealRow } = await supabase.from('deals').select('company, contact_info, company_url').eq('id', dealId).maybeSingle();
  const deal: any = dealRow || {};
  // Include duplicate deals for the same company (contacts are often linked to only one copy).
  const companyName = String(deal.company || '').trim();
  let dealIds = [dealId];
  if (companyName) {
    const { data: sibs } = await supabase.from('deals').select('id, contact_info, company_url').ilike('company', companyName).limit(10);
    (sibs || []).forEach((d: any) => {
      if (!dealIds.includes(d.id)) dealIds.push(d.id);
      if (!deal.contact_info && d.contact_info) deal.contact_info = d.contact_info;
      if (!deal.company_url && d.company_url) deal.company_url = d.company_url;
    });
  }
  const linksRes = await supabase.from('contact_deals').select('contact_id').in('deal_id', dealIds);

  const emails = new Set<string>();
  const ci = String(deal.contact_info || '');
  (ci.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).forEach((e) => emails.add(e.toLowerCase()));
  const contactIds = (linksRes.data || []).map((r: any) => r.contact_id).filter(Boolean);
  if (contactIds.length) {
    const { data } = await supabase.from('contacts').select('email, additional_emails').in('id', contactIds);
    (data || []).forEach((c: any) => {
      if (c.email) emails.add(String(c.email).toLowerCase());
      if (Array.isArray(c.additional_emails)) c.additional_emails.forEach((e: any) => e && emails.add(String(e).toLowerCase()));
    });
  }
  const domains = new Set<string>();
  emails.forEach((e) => { const d = domainOf(e); if (d && !FREEMAIL.has(d)) domains.add(d); });
  if (typeof deal.company_url === 'string') {
    const d = deal.company_url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
    if (d && /\./.test(d) && !FREEMAIL.has(d)) domains.add(d);
  }
  // Company record domain (Companies database) matched by name.
  if (companyName) {
    const { data: cos } = await supabase.from('crm_companies').select('domain, website_url').ilike('name', companyName).limit(5);
    (cos || []).forEach((c: any) => {
      const raw = String(c.domain || c.website_url || '').toLowerCase();
      const d = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
      if (d && /\./.test(d) && !FREEMAIL.has(d)) domains.add(d);
    });
  }
  if (!domains.size && !emails.size) return { ok: false, text: '', emailCount: 0, reason: 'no_domains' };

  const matches = (addrs: (string | null | undefined)[]) =>
    addrs.some((a) => {
      const s = String(a || '').toLowerCase();
      return (s && emails.has(s)) || domains.has(domainOf(s));
    });

  // Recent mail in the signed-in user's synced mailbox (RLS-scoped), filtered
  // by client domain across sender, recipients and CC.
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const cols = 'gmail_message_id, subject, from_email, from_name, to_emails, cc_emails, received_at';
  const fromOr = [
    ...Array.from(domains).map((d) => `from_email.ilike.*@${d.replace(/[,()*%]/g, '')}`),
    ...Array.from(emails).map((e) => `from_email.eq.${e.replace(/[,()]/g, '')}`),
  ].join(',');
  const q = (table: 'gmail_messages' | 'email_cache', withOr: boolean) => {
    let b: any = (supabase.from(table as any) as any).select(cols);
    if (withOr) b = b.or(fromOr);
    return b.gte('received_at', since).order('received_at', { ascending: false }).limit(withOr ? 30 : 1000)
      .then((r: any) => (r.data || []).map((m: any) => ({ ...m, _src: table })));
  };
  // Live mailbox search (catches mail not yet synced into the local cache):
  // any thread where the client domain/address is sender, recipient or CC.
  const liveTerms = [...Array.from(domains), ...Array.from(emails)].slice(0, 12);
  const cutoff = new Date(Date.now() - 90 * 86400000);
  const gDate = `${cutoff.getFullYear()}/${String(cutoff.getMonth() + 1).padStart(2, '0')}/${String(cutoff.getDate()).padStart(2, '0')}`;
  const liveQuery = liveTerms.length
    ? `(${liveTerms.map((t) => `from:${t} OR to:${t} OR cc:${t}`).join(' OR ')}) after:${gDate}`
    : '';
  const live = liveQuery
    ? supabase.functions
        .invoke('gmail-messages', { body: { action: 'list', max_results: 30, query: liveQuery, search_all_mail: true } })
        .then(({ data, error }: any) =>
          error || data?.fallback
            ? []
            : (data?.messages || []).map((m: any) => ({
                gmail_message_id: m.id,
                subject: m.subject,
                from_email: m.from_email,
                from_name: m.from_name,
                to_emails: m.to_emails || [],
                cc_emails: m.cc_emails || [],
                received_at: m.received_at,
                _src: 'live',
                _body: m.body_text || stripHtml(m.body_html || '') || m.snippet || '',
              })),
        )
        .catch(() => [])
    : Promise.resolve([]);
  const lists = await Promise.all([
    live,
    fromOr ? q('gmail_messages', true) : Promise.resolve([]),
    q('gmail_messages', false),
    fromOr ? q('email_cache', true) : Promise.resolve([]),
    q('email_cache', false),
  ]);
  const seen = new Map<string, any>();
  for (const m of lists.flat() as any[]) {
    if (!m.gmail_message_id || seen.has(m.gmail_message_id)) continue;
    if (m._src === 'live' || matches([m.from_email, ...(m.to_emails || []), ...(m.cc_emails || [])])) seen.set(m.gmail_message_id, m);
  }
  const top = Array.from(seen.values())
    .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
    .slice(0, 8);
  if (!top.length) return { ok: false, text: '', emailCount: 0, reason: 'no_emails' };

  const ids = top.map((m) => m.gmail_message_id);
  const [b1, b2] = await Promise.all([
    supabase.from('gmail_messages').select('gmail_message_id, body_text, body_html, snippet').in('gmail_message_id', ids),
    supabase.from('email_cache').select('gmail_message_id, body_text, body_html, snippet').in('gmail_message_id', ids),
  ]);
  const bodyMap = new Map<string, any>();
  for (const b of [...(b1.data || []), ...(b2.data || [])] as any[]) {
    const prev = bodyMap.get(b.gmail_message_id);
    if (!prev || (!prev.body_text && !prev.body_html)) bodyMap.set(b.gmail_message_id, b);
  }

  const blocks = top.map((m) => {
    const b: any = bodyMap.get(m.gmail_message_id) || {};
    const body = latestPart(b.body_text || stripHtml(b.body_html || '') || m._body || b.snippet || '');
    const dir = domains.has(domainOf(m.from_email)) || emails.has(String(m.from_email || '').toLowerCase()) ? 'FROM CLIENT' : 'TO CLIENT';
    const d = m.received_at ? new Date(m.received_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '';
    return `[${d}] ${dir} — from ${m.from_name || m.from_email}\nSubject: ${m.subject || '(no subject)'}\n${body}`;
  });

  const userPrompt =
    `Deal: ${deal.company || 'Unknown'}\nToday: ${new Date().toLocaleDateString('en-US')}\n\n` +
    `Recent emails with the client (newest first):\n\n${blocks.join('\n\n---\n\n')}`;

  const { data, error } = await supabase.functions.invoke('smart-email-ai', {
    body: { action: 'suggest_status_update', dealId, systemPrompt: SYSTEM_PROMPT, userPrompt, fastModel: false },
  });
  const raw: string = data?.result?.text || '';
  if (error || data?.error_kind || !raw) return { ok: false, text: '', emailCount: top.length, reason: 'llm_error' };
  const s = sanitizeStatusSuggestion(raw);
  return { ok: !!s.text, text: s.text || raw.trim(), emailCount: top.length };
}
