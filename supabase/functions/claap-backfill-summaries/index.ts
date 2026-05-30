import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function analyzeOne(meetingId: string) {
  const r = await fetch(`${SB_URL}/functions/v1/claap-analyze-meeting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE}`,
    },
    body: JSON.stringify({ meeting_id: meetingId }),
  });
  const text = await r.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, body: parsed ?? text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SB_URL, SERVICE);
    const body = await req.json().catch(() => ({} as any));
    const { meeting_id, claap_id, limit } = body || {};

    // Single-recording mode (used by the UI Refresh button).
    if (meeting_id || claap_id) {
      let id = meeting_id as string | undefined;
      if (!id && claap_id) {
        const { data: row } = await admin
          .from('claap_meetings')
          .select('id')
          .eq('claap_id', claap_id)
          .maybeSingle();
        id = row?.id;
      }
      if (!id) return json({ ok: false, error: 'meeting not found' }, 404);
      const res = await analyzeOne(id);
      return json({ ok: res.ok, single: true, meeting_id: id, result: res });
    }

    // Batch backfill mode.
    const max = Math.min(Number(limit) || 25, 100);
    const { data: rows, error } = await admin
      .from('claap_meetings')
      .select('id, claap_id, title')
      .is('ai_summary', null)
      .not('transcript', 'is', null)
      .limit(max);
    if (error) throw error;

    const results: any[] = [];
    for (const row of rows ?? []) {
      const res = await analyzeOne(row.id);
      results.push({ id: row.id, claap_id: row.claap_id, title: row.title, ok: res.ok, status: res.status });
    }
    return json({
      ok: true,
      candidates: rows?.length ?? 0,
      backfilled: results.filter((r) => r.ok).length,
      results,
    });
  } catch (e) {
    console.error('claap-backfill-summaries error', e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});