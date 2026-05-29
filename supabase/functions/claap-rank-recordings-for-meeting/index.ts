import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { scoreMeetings, type RecordingInput } from '../_shared/claap-scoring.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Inputs:
//   { action: 'rank',    event_id: uuid, recordings: ClaapRecording[] }
//   { action: 'confirm', event_id: uuid, recording: ClaapRecording, confidence: number, reasons?: any[] }
//
// 'rank' returns: { ranked: [{ external_id, score, reasons, evidence }] } sorted desc.
// 'confirm' upserts a canonical claap_recordings row (org-scoped) and inserts
// claap_recording_links { entity_type:'meeting', entity_id:<event_id>, link_role:'primary_meeting',
// source:'manual', confidence } (idempotent on unique key).

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userRes.user.id;

    const admin = createClient(SB_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const action = (body?.action || 'rank') as 'rank' | 'confirm';
    const event_id = body?.event_id as string | undefined;
    if (!event_id) return json({ error: 'event_id required' }, 400);

    // Load the calendar event (tenant gate: must belong to a user in same org as caller).
    const { data: evt, error: evtErr } = await admin
      .from('calendar_events')
      .select('id, user_id, title, start_time, end_time, organizer_email, attendees')
      .eq('id', event_id)
      .maybeSingle();
    if (evtErr || !evt) return json({ error: 'event not found' }, 404);

    // Resolve org for both caller and event owner; they must share a company.
    const { data: myMem } = await admin
      .from('company_members').select('company_id').eq('user_id', userId);
    const { data: ownerMem } = await admin
      .from('company_members').select('company_id').eq('user_id', evt.user_id);
    const myOrgs = new Set((myMem || []).map((r: any) => r.company_id));
    const shared = (ownerMem || []).map((r: any) => r.company_id).find((c: string) => myOrgs.has(c));
    if (!shared) return json({ error: 'forbidden' }, 403);
    const org_company_id: string = shared;

    if (action === 'rank') {
      const recordings = Array.isArray(body?.recordings) ? body.recordings : [];
      const meetingRow = {
        id: evt.id,
        title: evt.title,
        start_time: evt.start_time,
        end_time: evt.end_time,
        organizer_email: evt.organizer_email,
        attendees: evt.attendees || [],
      };
      const ranked = recordings.map((r: any) => {
        const rec: RecordingInput = {
          id: r.id,
          org_company_id,
          title: r.title || null,
          started_at: r.meeting?.startingAt || r.createdAt || null,
          ended_at: r.meeting?.endingAt || null,
          organizer_email: r.recorder?.email || null,
          participants: r.meeting?.participants || [],
          transcript: null,
        };
        const cands = scoreMeetings(rec, [meetingRow]);
        const top = cands[0];
        return {
          external_id: r.id,
          score: top?.score ?? 0,
          reasons: top?.reasons ?? [],
          evidence: top?.evidence ?? {},
        };
      }).sort((a: any, b: any) => b.score - a.score);
      return json({ ranked });
    }

    // confirm
    const rec = body?.recording;
    const confidence = Number(body?.confidence ?? 0);
    const reasons = Array.isArray(body?.reasons) ? body.reasons : [];
    if (!rec?.id) return json({ error: 'recording required' }, 400);

    // Upsert canonical claap_recordings row
    const startedAt = rec?.meeting?.startingAt || rec?.createdAt || null;
    const endedAt = rec?.meeting?.endingAt || null;
    const { data: canonical, error: upErr } = await admin
      .from('claap_recordings')
      .upsert({
        org_company_id,
        external_id: rec.id,
        title: rec.title || null,
        started_at: startedAt,
        ended_at: endedAt,
        organizer_email: rec.recorder?.email || null,
        participants: rec.meeting?.participants || [],
        source_payload: { url: rec.url, thumbnailUrl: rec.thumbnailUrl, durationSeconds: rec.durationSeconds },
        status: 'linked',
      }, { onConflict: 'org_company_id,external_id' })
      .select('id')
      .single();
    if (upErr || !canonical) return json({ error: upErr?.message || 'upsert failed' }, 500);

    const { error: linkErr } = await admin.from('claap_recording_links').upsert({
      recording_id: canonical.id,
      entity_type: 'meeting',
      entity_id: event_id,
      link_role: 'primary_meeting',
      source: 'manual',
      confidence: isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      created_by: userId,
    }, { onConflict: 'recording_id,link_role,entity_id', ignoreDuplicates: true });
    if (linkErr) return json({ error: linkErr.message }, 500);

    return json({ ok: true, recording_id: canonical.id, reasons });
  } catch (e) {
    console.error('claap-rank-recordings-for-meeting error', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}