import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
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

async function generateWithAnthropic(prompt: string): Promise<SynthNote | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 900,
      temperature: 0.2,
      system: 'You create concise, professional meeting recap notes for an internal CRM. Return only valid JSON with keys summary_md, action_items, key_takeaways.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.warn('synthesize-meeting-note anthropic error', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const text = data?.content?.map((item: any) => item?.text || '').join('\n') || '';
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Partial<SynthNote>;
    return {
      summary_md: String(parsed.summary_md || '').trim(),
      action_items: asTextArray(parsed.action_items),
      key_takeaways: asTextArray(parsed.key_takeaways),
    };
  } catch (error) {
    console.warn('synthesize-meeting-note parse error', error, text.slice(0, 300));
    return null;
  }
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

    async function synthesizeOne(externalId: string, linkedEventId?: string | null) {
      const { data: recording, error: recordingError } = await admin
        .from('claap_recordings')
        .select('id, org_company_id, external_id, title, started_at, organizer_email, participants, summary, action_items, key_takeaways, synthesized_note, synthesized_note_generated_at')
        .eq('external_id', externalId)
        .in('org_company_id', companyIds)
        .maybeSingle();
      if (recordingError || !recording) throw new Error(recordingError?.message || 'Recording not found');

      const realSummary = (recording.summary || '').trim() || null;
      const realActions = asTextArray(recording.action_items);
      const realTakeaways = asTextArray(recording.key_takeaways);
      if (realSummary || realActions.length > 0 || realTakeaways.length > 0) {
        return {
          source: 'claap',
          note: buildNote(realSummary, realActions, realTakeaways),
          payload: { summary_md: realSummary || '', action_items: realActions, key_takeaways: realTakeaways },
          recording_id: externalId,
        };
      }

      const generatedAt = recording.synthesized_note_generated_at ? new Date(recording.synthesized_note_generated_at).getTime() : 0;
      const cached = recording.synthesized_note as Record<string, unknown> | null;
      if (cached && generatedAt > Date.now() - CACHE_MS) {
        const cachedPayload = {
          summary_md: String(cached.summary_md || '').trim(),
          action_items: asTextArray(cached.action_items),
          key_takeaways: asTextArray(cached.key_takeaways),
        };
        return {
          source: 'synthesized',
          note: buildNote(cachedPayload.summary_md, cachedPayload.action_items, cachedPayload.key_takeaways),
          payload: cachedPayload,
          recording_id: externalId,
        };
      }

      const { data: meeting } = await admin
        .from('claap_meetings')
        .select('id, title, transcript, ai_summary, next_steps, key_decisions, deal_id, company_id')
        .eq('claap_id', externalId)
        .maybeSingle();
      const { data: eventLink } = linkedEventId
        ? await admin.from('event_claap_recordings').select('notes').eq('event_id', linkedEventId).eq('recording_id', externalId).maybeSingle()
        : { data: null };
      const { data: deal } = meeting?.deal_id
        ? await admin.from('deals').select('name, company').eq('id', meeting.deal_id).maybeSingle()
        : { data: null };

      const attendeeNames = (Array.isArray(recording.participants) ? recording.participants : [])
        .map((p: any) => String(p?.name || p?.email || '').trim())
        .filter(Boolean)
        .slice(0, 8);

      const prompt = [
        'Create a concise internal meeting note with three sections: Summary, Action items, Key takeaways.',
        'Return only JSON: {"summary_md": string, "action_items": string[], "key_takeaways": string[]}.',
        `Recording title: ${recording.title || meeting?.title || 'Untitled meeting'}`,
        recording.started_at ? `Scheduled time: ${recording.started_at}` : null,
        recording.organizer_email ? `Organizer: ${recording.organizer_email}` : null,
        attendeeNames.length ? `Attendees: ${attendeeNames.join(', ')}` : null,
        deal ? `Deal context: ${deal.name}${deal.company ? ` (${deal.company})` : ''}` : null,
        eventLink?.notes ? `Prior saved note: ${String(eventLink.notes).slice(0, 600)}` : null,
        meeting?.transcript ? `Transcript snippet:\n${String(meeting.transcript).slice(0, 6000)}` : 'Transcript snippet unavailable.',
      ].filter(Boolean).join('\n\n');

      const synthesized = await generateWithAnthropic(prompt) || deterministicFallback({
        title: recording.title || meeting?.title || null,
        startedAt: recording.started_at,
        organizerEmail: recording.organizer_email,
        attendees: attendeeNames,
        transcript: meeting?.transcript || null,
        dealName: deal?.name || deal?.company || null,
        savedNote: eventLink?.notes || null,
      });

      await admin
        .from('claap_recordings')
        .update({
          synthesized_note: synthesized,
          synthesized_note_generated_at: new Date().toISOString(),
        })
        .eq('id', recording.id);

      return {
        source: 'synthesized',
        note: buildNote(synthesized.summary_md, synthesized.action_items, synthesized.key_takeaways),
        payload: synthesized,
        recording_id: externalId,
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
        const result = await synthesizeOne(link.recording_id, link.event_id);
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

    if (!recordingExternalId) return json({ error: 'recording_id required' }, 400);
    const result = await synthesizeOne(recordingExternalId, eventId || null);
    return json({
      ok: true,
      claap_token_present: !!CLAAP_API_TOKEN,
      source: result.source,
      recording_id: result.recording_id,
      note: result.note,
      synthesized_note: result.payload,
    });
  } catch (error) {
    console.error('synthesize-meeting-note error', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});