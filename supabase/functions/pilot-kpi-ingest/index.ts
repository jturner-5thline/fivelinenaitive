import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_EVENTS = new Set([
  'deal_created','initial_login','session_heartbeat','visit',
  'feedback_given','feedback_call_attended','demo_converted','pilot_converted',
]);

// In-memory heartbeat debounce cache (per warm instance). Keyed by user_id|deal_id.
const lastHeartbeat = new Map<string, number>();
const HEARTBEAT_DEBOUNCE_MS = 25_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventType = body?.event_type;
  const dealId = body?.deal_id ?? null;
  const metadata = (body?.metadata && typeof body.metadata === 'object') ? body.metadata : {};

  if (!ALLOWED_EVENTS.has(eventType)) {
    return new Response(JSON.stringify({ error: 'Invalid event_type' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Heartbeat debounce
  if (eventType === 'session_heartbeat') {
    const key = `${userId}|${dealId ?? ''}`;
    const now = Date.now();
    const last = lastHeartbeat.get(key) ?? 0;
    if (now - last < HEARTBEAT_DEBOUNCE_MS) {
      return new Response(JSON.stringify({ ok: true, debounced: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    lastHeartbeat.set(key, now);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Resolve company_id for the user (first membership).
  const { data: member } = await admin
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  const companyId = member?.company_id ?? null;
  if (!companyId) {
    return new Response(JSON.stringify({ error: 'No company membership' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: inserted, error: insErr } = await admin
    .from('pilot_kpi_events')
    .insert({
      company_id: companyId,
      user_id: userId,
      event_type: eventType,
      deal_id: dealId,
      metadata,
    })
    .select('id')
    .single();

  if (insErr) {
    console.error('pilot-kpi-ingest insert failed', insErr);
    return new Response(JSON.stringify({ error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (dealId) {
    await admin
      .from('deal_kpi_links')
      .insert({ deal_id: dealId, kpi_event_id: inserted.id })
      .select('id')
      .maybeSingle();
  }

  return new Response(JSON.stringify({ ok: true, id: inserted.id }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});