// smoke-mention-flow: automated end-to-end smoke for the mention notification
// pipeline. Inserts a task_comment authored by James mentioning Niki, invokes
// notify-comment-mentions, then returns the resulting message_id +
// notification_log row as a downloadable JSON artifact.
//
// Usage:
//   POST /functions/v1/smoke-mention-flow
//   Optional body: { task_id?: string, download?: boolean }
//
// Auth: requires a valid Supabase JWT. Restricted to internal 5th Line users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const JAMES_EMAIL = 'jturner@5thline.co';
const NIKI_EMAIL = 'nheikali@5thline.co';

const INTERNAL_DOMAINS = ['5thline.co', 'naitive.co'];

function jsonResponse(payload: unknown, status = 200, download = false, filename = 'smoke-result.json') {
  const body = JSON.stringify(payload, null, 2);
  const headers: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };
  if (download) {
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  }
  return new Response(body, { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const startedAt = new Date().toISOString();
  const steps: Array<{ name: string; ok: boolean; detail?: unknown; error?: string }> = [];
  const record = (name: string, ok: boolean, detail?: unknown, error?: string) => {
    steps.push({ name, ok, detail, error });
  };

  try {
    // ----- auth check -----
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse({ ok: false, error: 'missing_bearer_token' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: 'invalid_token', detail: userErr?.message }, 401);
    }
    const callerEmail = userData.user.email ?? '';
    const isInternal = INTERNAL_DOMAINS.some((d) => callerEmail.toLowerCase().endsWith(`@${d}`));
    if (!isInternal) {
      return jsonResponse({ ok: false, error: 'forbidden_non_internal', caller: callerEmail }, 403);
    }
    record('auth.verify_caller', true, { caller: callerEmail });

    let body: { task_id?: string; download?: boolean } = {};
    try { body = await req.json(); } catch (_) { /* optional body */ }
    const download = body.download === true;

    // ----- resolve participants -----
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: jamesAuth } = await admin.auth.admin.listUsers();
    const james = jamesAuth?.users?.find((u: any) => u.email === JAMES_EMAIL);
    const niki = jamesAuth?.users?.find((u: any) => u.email === NIKI_EMAIL);
    if (!james || !niki) {
      record('resolve.participants', false, { james: !!james, niki: !!niki }, 'participants_not_found');
      return jsonResponse({ ok: false, steps }, 500);
    }
    record('resolve.participants', true, { james_id: james.id, niki_id: niki.id });

    // ----- pick a task -----
    let taskId = body.task_id;
    if (!taskId) {
      const { data: tasks, error: taskErr } = await admin
        .from('tasks')
        .select('id, title')
        .or(`assigned_to.eq.${james.id},assigned_by.eq.${james.id},assigned_to.eq.${niki.id}`)
        .order('created_at', { ascending: false })
        .limit(1);
      if (taskErr || !tasks || tasks.length === 0) {
        record('resolve.task', false, tasks, taskErr?.message ?? 'no_task_found');
        return jsonResponse({ ok: false, steps }, 500);
      }
      taskId = tasks[0].id;
      record('resolve.task', true, tasks[0]);
    } else {
      record('resolve.task', true, { task_id: taskId, source: 'request_body' });
    }

    // ----- insert smoke comment -----
    const stamp = new Date().toISOString();
    const commentBody =
      `Automated smoke @[Niki Heikali](${niki.id}) — sender wiring check at ${stamp}.`;
    const { data: inserted, error: insertErr } = await admin
      .from('task_comments')
      .insert({
        task_id: taskId,
        author_id: james.id,
        body: commentBody,
        mentions: [niki.id],
      })
      .select('id, created_at, mentions')
      .single();
    if (insertErr || !inserted) {
      record('comment.insert', false, inserted, insertErr?.message);
      return jsonResponse({ ok: false, steps }, 500);
    }
    record('comment.insert', true, inserted);

    // ----- invoke notify-comment-mentions -----
    const notifyUrl = `${SUPABASE_URL}/functions/v1/notify-comment-mentions`;
    const notifyResp = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ comment_id: inserted.id }),
    });
    const notifyText = await notifyResp.text();
    let notifyJson: unknown = notifyText;
    try { notifyJson = JSON.parse(notifyText); } catch (_) { /* keep text */ }
    const notifyOk = notifyResp.ok;
    record('notify.invoke', notifyOk, {
      status: notifyResp.status,
      response: notifyJson,
    }, notifyOk ? undefined : 'notify_function_non_2xx');
    if (!notifyOk) {
      return jsonResponse({ ok: false, steps }, 502);
    }

    // ----- verify notification_log row(s) (poll up to 5s) -----
    let logRows: any[] = [];
    for (let i = 0; i < 10; i++) {
      const { data: rows } = await admin
        .from('notification_log')
        .select('id, kind, ref_id, user_id, channel, status, provider_message_id, error, created_at')
        .eq('ref_id', inserted.id)
        .order('created_at', { ascending: false });
      if (rows && rows.length > 0) { logRows = rows; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    const nikiRow = logRows.find((r) => r.user_id === niki.id) ?? logRows[0];
    if (!nikiRow) {
      record('notification_log.lookup', false, logRows, 'no_log_row_found');
      return jsonResponse({ ok: false, steps, comment_id: inserted.id }, 500);
    }
    const sentOk = nikiRow.status === 'sent' && !!nikiRow.provider_message_id && !nikiRow.error;
    record('notification_log.lookup', sentOk, nikiRow,
      sentOk ? undefined : `status=${nikiRow.status} error=${nikiRow.error}`);

    // ----- summary artifact -----
    const result = {
      ok: sentOk,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      caller: callerEmail,
      participants: { james_id: james.id, niki_id: niki.id, niki_email: NIKI_EMAIL },
      comment: {
        id: inserted.id,
        task_id: taskId,
        created_at: inserted.created_at,
        body: commentBody,
        mentions: inserted.mentions,
      },
      notify_response: notifyJson,
      notification_log: nikiRow,
      message_id: nikiRow.provider_message_id ?? null,
      steps,
    };

    const filename = `mention-smoke-${inserted.id}.json`;
    return jsonResponse(result, sentOk ? 200 : 500, download, filename);
  } catch (err) {
    record('unhandled.exception', false, undefined, (err as Error).message);
    return jsonResponse({ ok: false, steps, error: (err as Error).message }, 500);
  }
});