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

    // event_id may be either calendar_events.id (uuid) OR the provider's event_id string.
    // Try uuid first; fall back to provider event_id scoped to caller's org members.
    const { data: myMem } = await admin
      .from('company_members').select('company_id').eq('user_id', userId);
    const myOrgs = (myMem || []).map((r: any) => r.company_id);
    if (myOrgs.length === 0) return json({ error: 'forbidden' }, 403);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event_id);
    let evt: any = null;
    if (isUuid) {
      const { data } = await admin
        .from('calendar_events')
        .select('id, user_id, title, start_time, end_time, organizer_email, attendees, event_id')
        .eq('id', event_id)
        .maybeSingle();
      evt = data;
    }
    if (!evt) {
      // Lookup by provider event_id among any user in caller's org(s).
      const { data: orgUsers } = await admin
        .from('company_members').select('user_id').in('company_id', myOrgs);
      const userIds = Array.from(new Set((orgUsers || []).map((r: any) => r.user_id)));
      if (userIds.length === 0) return json({ error: 'forbidden' }, 403);
      const { data: rows } = await admin
        .from('calendar_events')
        .select('id, user_id, title, start_time, end_time, organizer_email, attendees, event_id')
        .eq('event_id', event_id)
        .in('user_id', userIds)
        .limit(1);
      evt = (rows || [])[0] || null;
    }
    if (!evt) {
      // Fall back to body-provided meeting context — still allow scoring without DB row.
      const ctx = body?.meeting_context;
      if (!ctx) return json({ error: 'event not found' }, 404);
      evt = {
        id: event_id,
        user_id: userId,
        title: ctx.title || null,
        start_time: ctx.start_time || null,
        end_time: ctx.end_time || null,
        organizer_email: ctx.organizer_email || null,
        attendees: ctx.attendees || [],
      };
    }

    // Tenancy: event owner must share an org with caller (when from DB).
    let org_company_id: string;
    if (evt.user_id && evt.user_id !== userId) {
      const { data: ownerMem } = await admin
        .from('company_members').select('company_id').eq('user_id', evt.user_id);
      const myOrgSet = new Set(myOrgs);
      const shared = (ownerMem || []).map((r: any) => r.company_id).find((c: string) => myOrgSet.has(c));
      if (!shared) return json({ error: 'forbidden' }, 403);
      org_company_id = shared;
    } else {
      org_company_id = myOrgs[0];
    }

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
    // entity_id must be a uuid (calendar_events.id). If we only have a provider string, skip the link.
    const entityId = typeof evt.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evt.id) ? evt.id : null;

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

    if (entityId) {
      const { error: linkErr } = await admin.from('claap_recording_links').upsert({
        recording_id: canonical.id,
        entity_type: 'meeting',
        entity_id: entityId,
        link_role: 'primary_meeting',
        source: 'manual',
        confidence: isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
        created_by: userId,
      }, { onConflict: 'recording_id,link_role,entity_id', ignoreDuplicates: true });
      if (linkErr) return json({ error: linkErr.message }, 500);
    }

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