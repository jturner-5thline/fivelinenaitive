// notify-comment-mentions: sends a Resend email to each user mentioned in a
// task_comments row and records the send in notification_log (idempotent).
//
// Trigger: client invokes this function with { comment_id } immediately after
// inserting a task comment. The DB trigger has already populated
// task_comments.mentions and fanned out into task_mentions.
//
// Auth: requires a valid Supabase JWT (the commenter). We use the user-scoped
// client to verify the caller can read the comment (RLS), then switch to
// the service-role client to look up recipient emails + write the log.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const RESEND_API_KEY =
  Deno.env.get('RESEND_API_KEY_1') ?? Deno.env.get('RESEND_API_KEY');

const FROM_DOMAIN = Deno.env.get('RESEND_FROM_DOMAIN') || 'updates.naitive.co';
const FROM = `Naitive <notifications@${FROM_DOMAIN}>`;
const APP_URL =
  Deno.env.get('APP_URL') || 'https://www.naitive.co';

// Cold-start log: confirms the verified sender domain in use.
console.log(`[notify-comment-mentions] cold-start FROM_DOMAIN=${FROM_DOMAIN} (RESEND_FROM_DOMAIN ${Deno.env.get('RESEND_FROM_DOMAIN') ? 'set' : 'fallback'})`);

function renderPlain(body: string): string {
  return body.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(opts: {
  commenter: string;
  taskTitle: string;
  body: string;
  link: string;
}): string {
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#0b0e14;color:#e6e9ef;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#13181f;border:1px solid #1f2530;border-radius:12px;padding:24px">
    <p style="margin:0 0 12px;color:#7eb8f7;font-size:13px">You were mentioned</p>
    <h1 style="margin:0 0 16px;font-size:18px;color:#fff">${escapeHtml(opts.taskTitle)}</h1>
    <p style="margin:0 0 8px;color:#9aa3b6;font-size:12px"><strong style="color:#cfd5e0">${escapeHtml(opts.commenter)}</strong> commented:</p>
    <blockquote style="margin:12px 0;padding:12px 14px;background:#0f141b;border-left:3px solid #3b7eff;border-radius:6px;color:#e6e9ef;white-space:pre-wrap;font-size:14px">${escapeHtml(opts.body)}</blockquote>
    <p style="margin:24px 0 0"><a href="${opts.link}" style="display:inline-block;background:#3b7eff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500">Open task</a></p>
    <p style="margin:24px 0 0;color:#5b6173;font-size:11px">Sent by Naitive · You're receiving this because you were @-mentioned.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'unauthorized' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'unauthorized' }, 401);

    const { comment_id } = await req.json();
    if (!comment_id || typeof comment_id !== 'string') {
      return json({ error: 'comment_id required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: c, error: cErr } = await admin
      .from('task_comments')
      .select('id, body, mentions, author_id, task_id, task:task_id(id, title, deal_id)')
      .eq('id', comment_id)
      .single();
    if (cErr || !c) return json({ error: 'comment not found' }, 404);
    if (!Array.isArray(c.mentions) || c.mentions.length === 0) {
      return json({ ok: true, sent: 0, skipped: 'no_mentions' });
    }
    // Only the comment author may trigger this fanout.
    if (c.author_id !== userData.user.id) {
      return json({ error: 'forbidden' }, 403);
    }

    const [{ data: author }, { data: targets }] = await Promise.all([
      admin
        .from('profiles')
        .select('display_name, full_name, first_name, last_name, email')
        .eq('user_id', c.author_id)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('user_id, display_name, full_name, first_name, last_name, email')
        .in('user_id', c.mentions),
    ]);

    const authorName =
      author?.display_name ||
      author?.full_name ||
      [author?.first_name, author?.last_name].filter(Boolean).join(' ') ||
      author?.email ||
      'A teammate';

    const plainBody = renderPlain(c.body);
    const task: any = c.task;
    const deepLink = task?.deal_id
      ? `${APP_URL}/deals?deal=${task.deal_id}&task=${task.id}`
      : `${APP_URL}/tasks?task=${task?.id || c.task_id}`;
    const subject = `You were mentioned on "${task?.title || 'a task'}"`;

    let sent = 0;
    let skipped = 0;
    const failures: any[] = [];

    for (const t of targets ?? []) {
      if (!t.email || t.user_id === c.author_id) {
        skipped++;
        continue;
      }
      // Idempotency check
      const { count } = await admin
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'task_mention')
        .eq('ref_id', c.id)
        .eq('user_id', t.user_id)
        .eq('channel', 'email');
      if (count && count > 0) {
        skipped++;
        continue;
      }

      let providerId: string | null = null;
      let status: 'sent' | 'failed' = 'sent';
      let errMsg: string | null = null;

      try {
        if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
          throw new Error('email_provider_not_configured');
        }
        const resp = await fetch(
          'https://connector-gateway.lovable.dev/resend/emails',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': RESEND_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM,
              to: [t.email],
              reply_to: author?.email || undefined,
              subject,
              html: renderHtml({
                commenter: authorName,
                taskTitle: task?.title || 'a task',
                body: plainBody,
                link: deepLink,
              }),
              text: `${authorName} mentioned you on "${task?.title}":\n\n${plainBody}\n\nOpen: ${deepLink}`,
            }),
          },
        );
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          status = 'failed';
          errMsg = out?.message || `resend_${resp.status}`;
        } else {
          providerId = out?.id || null;
        }
      } catch (e) {
        status = 'failed';
        errMsg = (e as Error).message;
      }

      await admin.from('notification_log').insert({
        kind: 'task_mention',
        ref_id: c.id,
        user_id: t.user_id,
        channel: 'email',
        status,
        provider_message_id: providerId,
        payload: { subject, to: t.email, deep_link: deepLink },
        error: errMsg,
      });

      if (status === 'sent') sent++;
      else failures.push({ user_id: t.user_id, error: errMsg });
    }

    return json({ ok: true, sent, skipped, failed: failures.length, failures });
  } catch (e) {
    console.error('[notify-comment-mentions] error', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}