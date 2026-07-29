import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAAP_API_TOKEN = Deno.env.get('CLAAP_API_TOKEN') ?? '';
const CACHE_MS = 24 * 60 * 60 * 1000;

type SynthNote = {
  summary_md: string;
  action_items: string[];
  key_takeaways: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? '').trim()).filter(Boolean);
}

function buildNote(summary: string | null, actionItems: string[], keyTakeaways: string[]) {
  const lines: string[] = [];
  lines.push('Summary');
  lines.push(summary?.trim() || 'No summary available yet.');
  lines.push('', 'Action items');
  if (actionItems.length === 0) lines.push('- No action items captured.');
  else actionItems.slice(0, 8).forEach((item) => lines.push(`- ${item}`));
  lines.push('', 'Key takeaways');
  if (keyTakeaways.length === 0) lines.push('- No key takeaways captured.');
  else keyTakeaways.slice(0, 8).forEach((item) => lines.push(`- ${item}`));
  return lines.join('\n');
}

function deterministicFallback(input: {
  title: string | null;
  startedAt: string | null;
  organizerEmail: string | null;
  attendees: string[];
  transcript: string | null;
  dealName: string | null;
  savedNote: string | null;
}): SynthNote {
  const transcriptSnippet = (input.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  const summaryParts = [
    input.title ? `Meeting: ${input.title}.` : null,
    input.dealName ? `Related deal/company context: ${input.dealName}.` : null,
    input.startedAt ? `Scheduled at ${new Date(input.startedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.` : null,
    input.organizerEmail ? `Organizer: ${input.organizerEmail}.` : null,
    input.savedNote ? `Prior saved note: ${input.savedNote.slice(0, 220)}.` : null,
    transcriptSnippet ? `Transcript highlights: ${transcriptSnippet}` : 'Transcript was not available, so this note was synthesized from local meeting metadata.',
  ].filter(Boolean);

  return {
    summary_md: summaryParts.join(' '),
    action_items: [
      input.dealName ? `Follow up on the latest ${input.dealName} discussion points.` : 'Follow up on the meeting discussion points.',
      input.attendees[0] ? `Send recap and next steps to ${input.attendees[0]}.` : 'Send a recap and confirm owners for next steps.',
    ],
    key_takeaways: [
      input.title ? `This synthesized note is anchored to “${input.title}”.` : 'This synthesized note is anchored to the matched meeting.',
      transcriptSnippet ? 'A transcript snippet was available and used in the synthesized summary.' : 'The summary was generated from local metadata because no transcript snippet was available.',
    ],
  };
}

async function loadMeetingContext(admin: ReturnType<typeof createClient>, params: {
  companyIds: string[];
  meetingId?: string;
  recordingExternalId?: string;
  eventId?: string;
}) {
  const { companyIds, meetingId, recordingExternalId, eventId } = params;

  let meeting: Record<string, any> | null = null;
  if (meetingId) {
    const { data } = await admin
      .from('claap_meetings')
      .select('id, claap_id, title, transcript, ai_summary, next_steps, key_decisions, deal_id, company_id, started_at, organizer_email')
      .eq('id', meetingId)
      .maybeSingle();
    meeting = data ?? null;
  }

  let recording: Record<string, any> | null = null;
  if (recordingExternalId) {
    const { data } = await admin
      .from('claap_recordings')
      .select('id, org_company_id, external_id, title, started_at, organizer_email, participants, synthesized_note, synthesized_note_generated_at')
      .eq('external_id', recordingExternalId)
      .in('org_company_id', companyIds)
      .maybeSingle();
    recording = data ?? null;
  }

  if (!recording && meeting?.claap_id) {
    const { data } = await admin
      .from('claap_recordings')
      .select('id, org_company_id, external_id, title, started_at, organizer_email, participants, synthesized_note, synthesized_note_generated_at')
      .eq('external_id', meeting.claap_id)
      .in('org_company_id', companyIds)
      .maybeSingle();
    recording = data ?? null;
  }

  if (!meeting && recording?.external_id) {
    const { data } = await admin
      .from('claap_meetings')
      .select('id, claap_id, title, transcript, ai_summary, next_steps, key_decisions, deal_id, company_id, started_at, organizer_email')
      .eq('claap_id', recording.external_id)
      .maybeSingle();
    meeting = data ?? null;
  }

  let linkedEvent: Record<string, any> | null = null;
  if (eventId) {
    const { data } = await admin
      .from('calendar_events')
      .select('event_id, title, start_time, end_time, organizer_email, attendees, description')
      .eq('event_id', eventId)
      .limit(1)
      .maybeSingle();
    linkedEvent = data ?? null;
  }

  let eventLink: Record<string, any> | null = null;
  if (eventId && (recording?.external_id || meeting?.claap_id)) {
    const { data } = await admin
      .from('event_claap_recordings')
      .select('event_id, recording_id, notes, org_company_id')
      .eq('event_id', eventId)
      .eq('recording_id', recording?.external_id || meeting?.claap_id)
      .maybeSingle();
    eventLink = data ?? null;
  }

  const companyId = eventLink?.org_company_id || recording?.org_company_id || meeting?.company_id || companyIds[0] || null;

  return { meeting, recording, linkedEvent, eventLink, companyId };
}

async function upsertMeetingSynthesizedNote(admin: ReturnType<typeof createClient>, input: {
  meetingId: string;
  companyId: string;
  payload: SynthNote;
  createdBy: string;
  model: string | null;
}) {
  await admin
    .from('meeting_synthesized_notes')
    .upsert({
      meeting_id: input.meetingId,
      org_company_id: input.companyId,
      content: input.payload,
      model: input.model,
      source: 'synthesized',
      created_by: input.createdBy,
    }, { onConflict: 'meeting_id' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SB_URL, SERVICE);
    const body = await req.json().catch(() => ({} as any));
    const action = body?.action || 'single';
    const meetingId = body?.meeting_id as string | undefined;
    const recordingExternalId = body?.recording_id as string | undefined;
    const eventId = body?.event_id as string | undefined;
    const days = Math.max(1, Math.min(Number(body?.days) || 30, 60));

    const { data: memberships } = await admin
      .from('company_members')
      .select('company_id')
      .eq('user_id', authData.user.id);
    const companyIds = (memberships || []).map((row: any) => row.company_id).filter(Boolean);
    if (companyIds.length === 0) return json({ error: 'Forbidden' }, 403);

    if (action === 'status') {
      return json({
        ok: true,
        claap_token_present: !!CLAAP_API_TOKEN,
        claap_key_present: !!(Deno.env.get('CLAAP_API_KEY') ?? ''),
      });
    }

    async function synthesizeOne(input: { meetingId?: string; recordingExternalId?: string; eventId?: string | null }) {
      const context = await loadMeetingContext(admin, {
        companyIds,
        meetingId: input.meetingId,
        recordingExternalId: input.recordingExternalId,
        eventId: input.eventId || undefined,
      });

      const { meeting, recording, linkedEvent, eventLink, companyId } = context;
      if (!meeting && !recording && !linkedEvent) throw new Error('Meeting context not found');

      const recordingId = recording?.external_id || meeting?.claap_id || null;
      const meetingRowId = meeting?.id || null;

      const generatedAt = recording?.synthesized_note_generated_at ? new Date(recording.synthesized_note_generated_at).getTime() : 0;
      const cached = (recording?.synthesized_note as Record<string, unknown> | null) ?? null;
      if (cached && generatedAt > Date.now() - CACHE_MS) {
        const cachedPayload = {
          summary_md: String(cached.summary_md || '').trim(),
          action_items: asTextArray(cached.action_items),
          key_takeaways: asTextArray(cached.key_takeaways),
        };
        if (meetingRowId && companyId) {
          await upsertMeetingSynthesizedNote(admin, {
            meetingId: meetingRowId,
            companyId,
            payload: cachedPayload,
            createdBy: authData.user.id,
            model: 'cached-local-synthesis',
          });
        }
        return {
          source: 'synthesized',
          note: buildNote(cachedPayload.summary_md, cachedPayload.action_items, cachedPayload.key_takeaways),
          payload: cachedPayload,
          recording_id: recordingId,
          meeting_id: meetingRowId,
        };
      }

      const { data: deal } = meeting?.deal_id
        ? await admin.from('deals').select('company').eq('id', meeting.deal_id).maybeSingle()
        : { data: null };

      const attendeeNames = Array.from(new Set([
        ...(Array.isArray(recording?.participants) ? recording!.participants : []).map((p: any) => String(p?.name || p?.email || '').trim()),
        ...(Array.isArray(linkedEvent?.attendees) ? linkedEvent!.attendees : []).map((p: any) => String(p?.display_name || p?.name || p?.email || '').trim()),
      ].filter(Boolean))).slice(0, 8);

      const synthesized = deterministicFallback({
        title: recording?.title || meeting?.title || linkedEvent?.title || null,
        startedAt: recording?.started_at || meeting?.started_at || linkedEvent?.start_time || null,
        organizerEmail: recording?.organizer_email || meeting?.organizer_email || linkedEvent?.organizer_email || null,
        attendees: attendeeNames,
        transcript: null,
        dealName: deal?.company || null,
        savedNote: eventLink?.notes || null,
      });

      if (recording?.id) {
        await admin
          .from('claap_recordings')
          .update({
            synthesized_note: synthesized,
            synthesized_note_generated_at: new Date().toISOString(),
          })
          .eq('id', recording.id);
      }

      if (meetingRowId && companyId) {
        await upsertMeetingSynthesizedNote(admin, {
          meetingId: meetingRowId,
          companyId,
          payload: synthesized,
          createdBy: authData.user.id,
          model: 'local-metadata-synthesizer',
        });
      }

      return {
        source: 'synthesized',
        note: buildNote(synthesized.summary_md, synthesized.action_items, synthesized.key_takeaways),
        payload: synthesized,
        recording_id: recordingId,
        meeting_id: meetingRowId,
      };
    }

    if (action === 'batch') {
      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data: links, error } = await admin
        .from('event_claap_recordings')
        .select('event_id, recording_id, recorded_at, org_company_id')
        .in('org_company_id', companyIds)
        .gte('recorded_at', sinceIso);
      if (error) throw error;

      const results = [] as Array<{ recording_id: string; source: string }>;
      const seen = new Set<string>();
      for (const link of links || []) {
        if (!link.recording_id || seen.has(link.recording_id)) continue;
        seen.add(link.recording_id);
        const result = await synthesizeOne({ recordingExternalId: link.recording_id, eventId: link.event_id });
        results.push({ recording_id: result.recording_id, source: result.source });
      }

      return json({
        ok: true,
        claap_token_present: !!CLAAP_API_TOKEN,
        processed: results.length,
        synthesized: results.filter((r) => r.source === 'synthesized').length,
        results,
      });
    }

    if (!recordingExternalId && !meetingId && !eventId) return json({ error: 'recording_id, meeting_id, or event_id required' }, 400);
    const result = await synthesizeOne({
      meetingId,
      recordingExternalId,
      eventId: eventId || null,
    });
    return json({
      ok: true,
      claap_token_present: !!CLAAP_API_TOKEN,
      source: result.source,
      recording_id: result.recording_id,
      meeting_id: result.meeting_id,
      note: result.note,
      synthesized_note: result.payload,
    });
  } catch (error) {
    console.error('synthesize-meeting-note error', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});