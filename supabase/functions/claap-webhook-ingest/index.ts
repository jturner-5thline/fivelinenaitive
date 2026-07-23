import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { extractClaapWorkspace } from '../_shared/claap-api.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHARED_SECRET = Deno.env.get('CLAAP_WEBHOOK_SECRET') ?? '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(SB_URL, SERVICE);
  let payload: any = null;
  try {
    const provided = req.headers.get('x-claap-secret') ?? '';
    if (!SHARED_SECRET || provided !== SHARED_SECRET) {
      await admin.from('claap_webhook_log').insert({
        ok: false, status_code: 401, error: 'bad secret', payload: null,
      });
      return json({ error: 'unauthorized' }, 401);
    }
    payload = await req.json().catch(() => ({}));
    const external_id: string = payload.external_id ?? payload.id;
    const org_company_id: string | null = payload.org_company_id ?? null;
    if (!external_id || !org_company_id) {
      await admin.from('claap_webhook_log').insert({
        ok: false, status_code: 400, external_id, org_company_id,
        error: 'missing external_id or org_company_id', payload,
      });
      return json({ error: 'external_id and org_company_id required' }, 400);
    }

    const ws = extractClaapWorkspace(payload);
    const tokenWorkspaceId = Deno.env.get('CLAAP_WORKSPACE_ID') || null;
    const inScope = !tokenWorkspaceId || !ws.id || ws.id === tokenWorkspaceId;

    const { data: rec, error: upErr } = await admin.from('claap_recordings').upsert({
      org_company_id,
      external_id,
      title: payload.title ?? null,
      started_at: payload.started_at ?? null,
      ended_at: payload.ended_at ?? null,
      organizer_email: payload.organizer_email ?? null,
      participants: payload.participants ?? [],
      transcript_available: !!payload.transcript,
      source_payload: payload,
      workspace_id: ws.id,
      workspace_name: ws.name,
      status: 'new',
    }, { onConflict: 'org_company_id,external_id' }).select('id').single();
    if (upErr) throw upErr;

    // Sync scope log — one row per ingest so we can spot cross-workspace misses.
    await admin.from('claap_sync_scope_log').insert({
      source: 'webhook',
      token_workspace_id: tokenWorkspaceId,
      workspace_id: ws.id,
      workspace_name: ws.name,
      external_id,
      in_scope: inScope,
      note: inScope ? null : 'workspace_mismatch',
    });

    // Fire-and-forget score call (service-role auth)
    fetch(`${SB_URL}/functions/v1/claap-score-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE}`,
        'x-internal-call': '1',
      },
      body: JSON.stringify({ recording_id: rec.id, run_type: 'post_call' }),
    }).catch((e) => console.error('score trigger failed', e));

    await admin.from('claap_webhook_log').insert({
      ok: true, status_code: 200, external_id, org_company_id, payload,
    });
    return json({ ok: true, recording_id: rec.id });
  } catch (e) {
    console.error('webhook-ingest error', e);
    await admin.from('claap_webhook_log').insert({
      ok: false, status_code: 500, error: (e as Error).message, payload,
    });
    return json({ error: (e as Error).message }, 500);
  }
});