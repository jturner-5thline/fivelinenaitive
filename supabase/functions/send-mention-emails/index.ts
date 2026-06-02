// send-mention-emails — drains public.pending_mention_emails and sends
// Resend transactional emails for @mentions in agenda comments. Invoked
// by pg_cron every minute (auth = CRON_SECRET header).
//
// IMPORTANT: This is the ONLY workflow allowed to send outbound email from
// the Naitive backend besides the pre-existing notification-engine path.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const APP_URL = Deno.env.get('APP_URL') ?? 'https://fivelinenaitive.lovable.app';
const FROM_EMAIL = buildFrom("naitive");
const MAX_ATTEMPTS = 3;

// ---------- Template (exported for testing) ----------
export interface MentionEmailPayload {
  authorName: string;
  recipientName: string;
  periodLabel: string;
  anchorText: string | null;
  commentBody: string;
  deepLink: string;
}

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

/** Strip @[Name](uuid) tokens down to @Name, then escape HTML. */
function sanitizeBody(body: string): { html: string; text: string } {
  const text = body.replace(MENTION_RE, '@$1');
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  return { html, text };
}

export function buildMentionEmail(p: MentionEmailPayload): {
  subject: string; html: string; text: string;
} {
  const subject = `${p.authorName} mentioned you in the ${p.periodLabel} agenda`;
  const body = sanitizeBody(p.commentBody);
  const anchorEsc = (p.anchorText ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f5f7fb;padding:24px;color:#0a2540;">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e6ecf5;">
    <tr><td>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#4db8ff;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;">
          ${(p.authorName[0] || '?').toUpperCase()}
        </div>
        <div>
          <div style="font-weight:600;">${p.authorName}</div>
          <div style="font-size:12px;color:#6b7c93;">mentioned you in ${p.periodLabel}</div>
        </div>
      </div>
      <p style="margin:0 0 12px;color:#334155;">Hi ${p.recipientName},</p>
      ${anchorEsc ? `<blockquote style="margin:0 0 14px;padding:8px 12px;border-left:3px solid #ffd54f;background:#fffaf0;color:#5b4b00;font-style:italic;">${anchorEsc}</blockquote>` : ''}
      <div style="padding:12px 14px;background:#f8fafd;border-radius:10px;border:1px solid #eef2f9;line-height:1.55;color:#1f2937;">
        ${body.html}
      </div>
      <div style="margin-top:22px;text-align:center;">
        <a href="${p.deepLink}" style="display:inline-block;background:#0a2540;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;">View comment</a>
      </div>
      <p style="font-size:11px;color:#9aa5b1;margin-top:24px;text-align:center;">
        You're receiving this because you were @mentioned in an agenda comment.
      </p>
    </td></tr>
  </table>
</body></html>`.trim();
  const text = [
    `${p.authorName} mentioned you in the ${p.periodLabel} agenda`,
    '',
    p.anchorText ? `Anchor: "${p.anchorText}"` : '',
    '',
    body.text,
    '',
    `View comment: ${p.deepLink}`,
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}

// ---------- Handler ----------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: require either the cron secret header or a service-role JWT.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const hdrSecret = req.headers.get('x-cron-secret') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const okAuth =
    (cronSecret && hdrSecret && hdrSecret === cronSecret) ||
    (auth === `Bearer ${serviceKey}` && serviceKey.length > 0);
  if (!okAuth) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const dryRun = (Deno.env.get('DRY_RUN') === '1') ||
    new URL(req.url).searchParams.get('dry_run') === '1';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: jobs, error: jobsErr } = await supabase
    .from('pending_mention_emails')
    .select('id, comment_id, recipient_user_id, attempts')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(50);
  if (jobsErr) {
    return new Response(JSON.stringify({ error: jobsErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const resend = resendKey ? new Resend(resendKey) : null;
  const results: any[] = [];

  for (const job of jobs ?? []) {
    try {
      // Pref check
      const { data: pref } = await supabase
        .from('user_email_preferences')
        .select('agenda_mention_emails')
        .eq('user_id', job.recipient_user_id)
        .maybeSingle();
      if (pref && pref.agenda_mention_emails === false) {
        await supabase.from('pending_mention_emails')
          .update({ status: 'skipped_optout' }).eq('id', job.id);
        results.push({ id: job.id, status: 'skipped_optout' });
        continue;
      }

      // Load comment + thread + agenda
      const { data: comment } = await supabase
        .from('agenda_comments')
        .select('id, thread_id, author_id, body, created_at')
        .eq('id', job.comment_id)
        .maybeSingle();
      if (!comment) {
        await supabase.from('pending_mention_emails')
          .update({ status: 'failed', last_error: 'comment_not_found', attempts: (job.attempts ?? 0) + 1 })
          .eq('id', job.id);
        results.push({ id: job.id, status: 'failed', error: 'comment_not_found' });
        continue;
      }

      const { data: thread } = await supabase
        .from('agenda_comment_threads')
        .select('id, agenda_id, anchor_text')
        .eq('id', comment.thread_id)
        .maybeSingle();

      const { data: agenda } = thread?.agenda_id
        ? await supabase
          .from('insights_agenda')
          .select('id, period_type, period_key')
          .eq('id', thread.agenda_id)
          .maybeSingle()
        : { data: null } as any;

      const [{ data: author }, { data: recipient }] = await Promise.all([
        supabase.from('profiles').select('display_name, email')
          .eq('user_id', comment.author_id).maybeSingle(),
        supabase.from('profiles').select('display_name, email, first_name')
          .eq('user_id', job.recipient_user_id).maybeSingle(),
      ]);

      if (!recipient?.email) {
        await supabase.from('pending_mention_emails')
          .update({ status: 'skipped_no_email' }).eq('id', job.id);
        results.push({ id: job.id, status: 'skipped_no_email' });
        continue;
      }

      const periodLabel = agenda
        ? (agenda.period_type === 'month'
          ? new Date(`${agenda.period_key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
          : agenda.period_key.replace('-Q', ' Q').split(' ').reverse().join(' '))
        : 'recent';

      const deepLink = agenda
        ? `${APP_URL}/insights?view=${agenda.period_type}&period=${encodeURIComponent(agenda.period_key)}&agenda=${agenda.id}&thread=${thread?.id ?? ''}&comment=${comment.id}`
        : `${APP_URL}/insights`;

      const email = buildMentionEmail({
        authorName: author?.display_name || author?.email || 'Someone',
        recipientName: recipient.first_name || recipient.display_name || 'there',
        periodLabel,
        anchorText: thread?.anchor_text ?? null,
        commentBody: comment.body,
        deepLink,
      });

      if (dryRun || !resend) {
        await supabase.from('pending_mention_emails')
          .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
          .eq('id', job.id);
        results.push({ id: job.id, status: 'sent', dryRun: true, to: recipient.email, subject: email.subject, deepLink });
        continue;
      }

      const { error: sendErr } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipient.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (sendErr) {
        const nextAttempts = (job.attempts ?? 0) + 1;
        await supabase.from('pending_mention_emails')
          .update({
            status: nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            attempts: nextAttempts,
            last_error: String(sendErr.message ?? sendErr),
          })
          .eq('id', job.id);
        results.push({ id: job.id, status: 'failed', error: String(sendErr.message ?? sendErr) });
        continue;
      }

      await supabase.from('pending_mention_emails')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
        .eq('id', job.id);
      results.push({ id: job.id, status: 'sent' });
    } catch (e: any) {
      const nextAttempts = (job.attempts ?? 0) + 1;
      await supabase.from('pending_mention_emails')
        .update({
          status: nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts: nextAttempts,
          last_error: String(e?.message ?? e),
        })
        .eq('id', job.id);
      results.push({ id: job.id, status: 'failed', error: String(e?.message ?? e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});