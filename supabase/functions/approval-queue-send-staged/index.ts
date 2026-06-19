// Marks a staged email draft as sent and writes an audit row.
// The actual provider send (Gmail/Microsoft) is handled by the existing
// client-side composer; this endpoint records that the user manually
// approved the send so the audit trail is complete.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'Unauthorized' }, 401);
  const userId = userData.user.id;

  const { draft_id, action } = await req.json().catch(() => ({}));
  if (!draft_id || !action) return json({ error: 'draft_id and action required' }, 400);

  const { data: draft, error: loadErr } = await admin
    .from('staged_email_drafts').select('*').eq('id', draft_id).maybeSingle();
  if (loadErr || !draft) return json({ error: 'Draft not found' }, 404);
  if (draft.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  const now = new Date().toISOString();
  if (action === 'send') {
    await admin.from('staged_email_drafts').update({
      status: 'sent', sent_at: now,
    }).eq('id', draft_id);
    if (draft.source_action_id) {
      await admin.from('approval_queue_audit').insert({
        action_queue_id: draft.source_action_id,
        target_object_type: 'staged_email_drafts',
        target_object_id: draft_id,
        action_type: 'draft_email',
        old_values: { status: 'staged' },
        new_values: { status: 'sent', subject: draft.subject, to: draft.to_recipients },
        approver_user_id: userId,
        decision: 'email_sent',
        execution_status: 'success',
      });
    }
    return json({ ok: true });
  }
  if (action === 'cancel') {
    await admin.from('staged_email_drafts').update({
      status: 'cancelled', cancelled_at: now,
    }).eq('id', draft_id);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
});