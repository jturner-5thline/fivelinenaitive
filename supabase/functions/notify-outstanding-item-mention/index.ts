// notify-outstanding-item-mention: emails users @mentioned in an outstanding
// item's comment or notes field.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildFrom, getFromAddress, logColdStartFrom } from '../_shared/resendFrom.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY_1') ?? Deno.env.get('RESEND_API_KEY');
const FROM = buildFrom('Naitive', 'notifications');
const APP_URL = Deno.env.get('APP_URL') || 'https://www.naitive.co';

logColdStartFrom('notify-outstanding-item-mention');

function renderPlain(body: string): string {
  return body.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderHtml(o: { author: string; itemText: string; source: string; body: string; link: string }): string {
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#0b0e14;color:#e6e9ef;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#13181f;border:1px solid #1f2530;border-radius:12px;padding:24px">
    <p style="margin:0 0 12px;color:#7eb8f7;font-size:13px">You were mentioned on an outstanding item</p>
    <h1 style="margin:0 0 16px;font-size:18px;color:#fff">${escapeHtml(o.itemText)}</h1>
    <p style="margin:0 0 8px;color:#9aa3b6;font-size:12px"><strong style="color:#cfd5e0">${escapeHtml(o.author)}</strong> wrote in ${escapeHtml(o.source)}:</p>
    <blockquote style="margin:12px 0;padding:12px 14px;background:#0f141b;border-left:3px solid #3b7eff;border-radius:6px;color:#e6e9ef;white-space:pre-wrap;font-size:14px">${escapeHtml(o.body)}</blockquote>
    <p style="margin:24px 0 0"><a href="${o.link}" style="display:inline-block;background:#3b7eff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500">Open deal</a></p>
    <p style="margin:24px 0 0;color:#5b6173;font-size:11px">Sent by Naitive · You're receiving this because you were @-mentioned.</p>
  </div></body></html>`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'unauthorized' }, 401);

    const { item_id, source, body } = await req.json();
    if (!item_id || typeof item_id !== 'string') return json({ error: 'item_id required' }, 400);
    if (!body || typeof body !== 'string') return json({ error: 'body required' }, 400);

    const mentioned = [
      ...new Set(
        [...body.matchAll(/@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g)].map((m) => m[2]),
      ),
    ].filter((id) => id !== userData.user.id);
    if (mentioned.length === 0) return json({ ok: true, sent: 0, skipped: 'no_mentions' });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Caller must be able to see the item under RLS.
    const { data: item } = await userClient
      .from('outstanding_items')
      .select('id, text, deal_id')
      .eq('id', item_id)
      .maybeSingle();
    if (!item) return json({ error: 'item not found' }, 404);

    const [{ data: author }, { data: targets }] = await Promise.all([
      admin.from('profiles').select('display_name, full_name, first_name, last_name, email').eq('user_id', userData.user.id).maybeSingle(),
      admin.from('profiles').select('user_id, display_name, email').in('user_id', mentioned),
    ]);

    const authorName =
      author?.display_name ||
      author?.full_name ||
      [author?.first_name, author?.last_name].filter(Boolean).join(' ') ||
      author?.email ||
      'A teammate';
    const plainBody = renderPlain(body);
    const sourceLabel = source === 'notes' ? 'the item notes' : 'a comment';
    const link = `${APP_URL}/deals?deal=${item.deal_id}`;
    const subject = `${authorName} mentioned you on "${item.text}"`;

    let sent = 0;
    const failures: any[] = [];

    for (const t of targets ?? []) {
      if (!t.email) continue;
      try {
        if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error('email_provider_not_configured');
        const resp = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': RESEND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM,
            to: [t.email],
            reply_to: author?.email || getFromAddress(),
            subject,
            html: renderHtml({ author: authorName, itemText: item.text, source: sourceLabel, body: plainBody, link }),
            text: `${authorName} mentioned you in ${sourceLabel} on "${item.text}":\n\n${plainBody}\n\nOpen: ${link}`,
          }),
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(out?.message || `resend_${resp.status}`);
        sent++;
        await admin.from('notification_log').insert({
          kind: 'outstanding_item_mention',
          ref_id: item.id,
          user_id: t.user_id,
          channel: 'email',
          status: 'sent',
          provider_message_id: out?.id || null,
          payload: { subject, to: t.email, deep_link: link, source },
        });
      } catch (e) {
        failures.push({ user_id: t.user_id, error: (e as Error).message });
        await admin.from('notification_log').insert({
          kind: 'outstanding_item_mention',
          ref_id: item.id,
          user_id: t.user_id,
          channel: 'email',
          status: 'failed',
          payload: { subject, to: t.email, deep_link: link, source },
          error: (e as Error).message,
        });
      }
    }

    return json({ ok: true, sent, failed: failures.length, failures });
  } catch (e) {
    console.error('[notify-outstanding-item-mention] error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
