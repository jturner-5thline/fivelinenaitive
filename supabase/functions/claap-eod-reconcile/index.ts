import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { scoreAndPersist } from '../claap-score-recording/index.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// End-of-day reconciliation. Re-scores recordings from the last 48h
// that are still unmapped or low-confidence using fresh data created today.
// Triggered by pg_cron (one nightly invocation per scheduled job).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const tenant_id: string | undefined = body.tenant_id;

    const admin = createClient(SB_URL, SERVICE);
    const since = new Date(Date.now() - 48 * 60 * 60_000).toISOString();

    let q = admin.from('claap_recordings').select('*')
      .gte('started_at', since)
      .in('status', ['new','scored','review']);
    if (tenant_id) q = q.eq('org_company_id', tenant_id);

    const { data: recs, error } = await q.limit(500);
    if (error) throw error;

    let processed = 0, promoted = 0;
    for (const rec of recs || []) {
      try {
        const r = await scoreAndPersist(admin, rec, 'end_of_day');
        processed++;
        if (r.status === 'linked') promoted++;
      } catch (e) {
        console.error('eod score failed for', rec.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, promoted, scanned: recs?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('eod reconcile error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});