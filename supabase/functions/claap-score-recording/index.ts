import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  bandFor, roleFor, scoreCompanies, scoreContacts, scoreDeals, scoreMeetings,
  type Candidate, type EntityType, type RunType,
} from '../_shared/claap-scoring.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const recording_id: string | undefined = body.recording_id;
    const run_type: RunType = body.run_type === 'end_of_day' ? 'end_of_day' : 'post_call';
    if (!recording_id) return json({ error: 'recording_id required' }, 400);

    const admin = createClient(SB_URL, SERVICE);
    const { data: rec, error: recErr } = await admin
      .from('claap_recordings').select('*').eq('id', recording_id).maybeSingle();
    if (recErr || !rec) return json({ error: 'recording not found' }, 404);

    // Tenant guard: caller must belong to recording's org.
    const { data: member } = await userClient
      .from('company_members').select('company_id').eq('user_id', userRes.user.id)
      .eq('company_id', rec.org_company_id).maybeSingle();
    if (!member) return json({ error: 'not authorized' }, 403);

    const result = await scoreAndPersist(admin, rec, run_type);
    return json(result);
  } catch (e) {
    console.error('claap-score-recording error', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function scoreAndPersist(admin: any, rec: any, run_type: RunType) {
  const org = rec.org_company_id as string;
  const start = rec.started_at ? new Date(rec.started_at) : null;
  const windowStart = start ? new Date(start.getTime() - 6 * 60 * 60_000).toISOString() : null;
  const windowEnd = start ? new Date(start.getTime() + 6 * 60 * 60_000).toISOString() : null;

  // ---- Pull tenant data ----
  const [meetingsRes, contactsRes, companiesRes, dealsRes, mdlRes, recentRes] = await Promise.all([
    windowStart
      ? admin.from('calendar_events').select('id,title,start_time,end_time,organizer_email,attendees')
          .gte('start_time', windowStart).lte('start_time', windowEnd).limit(200)
      : Promise.resolve({ data: [] }),
    admin.from('contacts').select('id,first_name,last_name,email,primary_company_id,company_id')
      .eq('org_company_id', org).limit(5000),
    admin.from('companies').select('id,name,primary_domain,domains').limit(2000),
    admin.from('deals').select('id,company,stage,updated_at,company_id,crm_company_id').limit(2000),
    admin.from('meeting_deal_links').select('meeting_id,deal_id').limit(5000),
    admin.from('calendar_events').select('attendees')
      .gte('start_time', new Date(Date.now() - 14 * 86_400_000).toISOString()).limit(500),
  ]);

  const recentEmails = new Set<string>(
    (recentRes.data || []).flatMap((m: any) => (m.attendees || []).map((e: string) => e.toLowerCase())),
  );
  const contacts = contactsRes.data || [];
  const recentContactIds = new Set<string>(
    contacts.filter((c: any) => c.email && recentEmails.has(c.email.toLowerCase())).map((c: any) => c.id),
  );
  const contactById = new Map(contacts.map((c: any) => [c.id, c]));
  const activeDealCompanyIds = new Set<string>(
    (dealsRes.data || []).filter((d: any) => d.company_id).map((d: any) => d.company_id),
  );
  const meetingDealById = new Map<string, string>(
    (mdlRes.data || []).map((m: any) => [m.meeting_id, m.deal_id]),
  );

  // ---- Score ----
  const input = {
    id: rec.id, org_company_id: rec.org_company_id, title: rec.title,
    started_at: rec.started_at, ended_at: rec.ended_at,
    organizer_email: rec.organizer_email, participants: rec.participants || [],
    transcript: rec.source_payload?.transcript || null,
  };

  const mCands = scoreMeetings(input, meetingsRes.data || []).slice(0, 5);
  let cCands = scoreContacts(input, contacts, recentContactIds).slice(0, 20);
  let coCands = scoreCompanies(input, companiesRes.data || [], cCands, contactById, activeDealCompanyIds).slice(0, 10);
  const dCands = scoreDeals(input, dealsRes.data || [], mCands[0], meetingDealById, coCands).slice(0, 10);

  // Inheritance: if top meeting strong, promote its company/contacts implicit candidates
  // (already handled via meetingDealById + contact email overlap; left as a hook).

  // ---- Persist ----
  const all: Candidate[] = [...mCands, ...cCands, ...coCands, ...dCands];
  await admin.from('claap_recording_candidates').delete()
    .eq('recording_id', rec.id).eq('run_type', run_type);

  if (all.length) {
    const rows = all.map((c, i) => ({
      recording_id: rec.id, entity_type: c.entity_type, entity_id: c.entity_id,
      score: Number(c.score.toFixed(3)), rank: i,
      reasons: c.reasons, evidence: c.evidence, run_type,
    }));
    await admin.from('claap_recording_candidates').insert(rows);
  }

  // Auto-link >= 0.90 (top per entity_type)
  const byType = new Map<EntityType, Candidate>();
  for (const c of all) {
    if (c.score < 0.90) continue;
    const existing = byType.get(c.entity_type);
    if (!existing || c.score > existing.score) byType.set(c.entity_type, c);
  }
  let autoLinked = 0;
  for (const [et, c] of byType.entries()) {
    const { data: cand } = await admin.from('claap_recording_candidates')
      .select('id').eq('recording_id', rec.id).eq('run_type', run_type)
      .eq('entity_type', et).eq('entity_id', c.entity_id).maybeSingle();
    await admin.from('claap_recording_links').upsert({
      recording_id: rec.id, entity_type: et, entity_id: c.entity_id,
      link_role: roleFor(et), confidence: Number(c.score.toFixed(3)),
      source: run_type === 'end_of_day' ? 'eod' : 'auto',
      candidate_id: cand?.id ?? null,
    }, { onConflict: 'recording_id,link_role,entity_id' });
    autoLinked++;
  }

  const hasReview = all.some(c => bandFor(c.score) === 'review');
  const hasAuto = byType.size > 0;
  const status = hasAuto ? 'linked' : hasReview ? 'review' : 'scored';

  await admin.from('claap_recordings').update({
    status, last_scored_at: new Date().toISOString(),
  }).eq('id', rec.id);

  return { ok: true, candidates: all.length, auto_linked: autoLinked, status };
}