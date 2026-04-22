import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const startedAt = new Date().toISOString();
  const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');

  if (!accessToken) {
    return new Response(
      JSON.stringify({
        ok: false,
        checked_at: startedAt,
        error: 'HUBSPOT_ACCESS_TOKEN not configured',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const t0 = Date.now();
  let status = 0;
  let body = '';
  let ok = false;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(
      'https://api.hubapi.com/crm/v3/objects/deals?limit=1',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
    status = res.status;
    body = (await res.text()).slice(0, 500);
    ok = res.ok;
    if (!ok) errorMessage = `HubSpot API ${status}: ${body}`;
  } catch (err: any) {
    errorMessage = err?.message || 'Unknown error';
  }

  const latency_ms = Date.now() - t0;

  try {
    await supabase.from('hubspot_sync_logs').insert({
      direction: 'health_check',
      action: 'auth_health_check',
      status: ok ? 'success' : 'error',
      error_message: errorMessage,
      response_payload: { http_status: status, latency_ms, body_preview: body },
    });
  } catch (_) { /* best effort */ }

  return new Response(
    JSON.stringify({
      ok,
      checked_at: startedAt,
      latency_ms,
      http_status: status,
      error: errorMessage,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
