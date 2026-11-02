import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireInternal, isCompanyMember } from '../_shared/requestAuth.ts';
import { getClaapToken, CLAAP_API_BASE } from '../_shared/claap-api.ts';
import { claapFetchRecording, shouldDefer } from '../_shared/claap-quota.ts';
import { fourYearStart, inWindow, parsePage, retryAt } from './policy.ts';

const Input = z.object({ action: z.enum(['status', 'start', 'resume', 'pause', 'process']).default('process'), company_id: z.string().uuid().optional() });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await requireInternal(req, corsHeaders, { allowUser: true });
  if (!auth.ok) return auth.response;
  const parsed = Input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return reply({ error: 'Invalid action or company' }, 400);
  const body = parsed.data;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Cloud configuration unavailable' }, 503);
  const db = createClient(url, key);
  if (!auth.internal && (!body.company_id || !await isCompanyMember(auth.user.id, body.company_id))) return reply({ error: 'Forbidden' }, 403);
  if (!auth.internal && !['jturner@5thline.co', 'ffustinoni@5thline.co'].includes((auth.user.email ?? '').toLowerCase())) return reply({ error: 'Forbidden' }, 403);
  try {
    if (body.action === 'status') {
      const { data, error } = await db.from('claap_funding_backfill_jobs').select('*').eq('company_id', body.company_id).maybeSingle();
      if (error) throw error;
      return reply({ ok: true, job: data });
    }
    if (['start', 'resume', 'pause'].includes(body.action)) {
      if (!body.company_id) return reply({ error: 'Company required' }, 400);
      const { data: config } = await db.from('claap_integration_config').select('company_id').eq('company_id', body.company_id).eq('is_active', true).maybeSingle();
      if (!config) return reply({ error: 'Active Claap integration required' }, 400);
      const { error } = await db.from('claap_funding_backfill_jobs').upsert({ company_id: body.company_id, created_by: auth.user?.id ?? null, window_start: fourYearStart(), window_end: new Date().toISOString() }, { onConflict: 'company_id', ignoreDuplicates: true });
      if (error) throw error;
      const { error: updateError } = await db.from('claap_funding_backfill_jobs').update({ status: body.action === 'pause' ? 'paused' : 'running', next_run_at: null, updated_at: new Date().toISOString() }).eq('company_id', body.company_id).neq('phase', 'complete');
      if (updateError) throw updateError;
      if (body.action === 'pause') return reply({ ok: true });
    }
    let query = db.from('claap_funding_backfill_jobs').select('*').in('status', ['running', 'deferred']).or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`).limit(1);
    if (body.company_id) query = query.eq('company_id', body.company_id);
    const { data: jobs, error } = await query;
    if (error) throw error;
    const job = jobs?.[0];
    if (!job) return reply({ ok: true, idle: true });
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await db.from('claap_funding_backfill_jobs').update({ lease_until: new Date(Date.now() + 120_000).toISOString() }).eq('id', job.id).or(`lease_until.is.null,lease_until.lt.${now}`).select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) return reply({ ok: true, busy: true });
    const save = async (patch: Record<string, unknown>) => {
      const { error } = await db.from('claap_funding_backfill_jobs').update({ ...patch, lease_until: null, updated_at: new Date().toISOString() }).eq('id', job.id);
      if (error) throw error;
    };
    try {
      const token = getClaapToken();
      if (!token) throw new Error('Claap token unavailable');
      const gate = await shouldDefer('low');
      if (gate.defer) {
        await save({ status: 'deferred', next_run_at: gate.quota.resetAt ?? retryAt(3), last_error: 'Claap quota protected' });
        return reply({ ok: true, deferred: true });
      }
      if (job.phase === 'discovery') {
        const listUrl = new URL(`${CLAAP_API_BASE}/recordings`);
        listUrl.searchParams.set('limit', '20'); listUrl.searchParams.set('createdAfter', job.window_start); listUrl.searchParams.set('sort', 'created_desc');
        if (job.cursor) listUrl.searchParams.set('cursor', job.cursor);
        const response = await fetch(listUrl, { headers: { 'X-Claap-Key': token }, signal: AbortSignal.timeout(20_000) });
        await db.rpc('claap_record_api_call', { _count: 1 });
        if (response.status === 429) await db.rpc('claap_mark_rate_limited');
        if (!response.ok) throw new Error(`Claap list unavailable (${response.status})`);
        const page = parsePage(await response.json());
        if (page.cursor && page.cursor === job.cursor) throw new Error('Claap pagination did not advance');
        let imported = 0;
        for (const raw of page.rows) {
          const started = raw.meeting?.startingAt ?? raw.started_at ?? raw.created_at ?? raw.createdAt;
          if (!raw.id || !inWindow(started, job.window_start, job.window_end)) continue;
          // Never route deals, generate drafts/tasks, or overwrite existing recordings during history discovery.
          const { data: inserted, error } = await db.from('claap_recordings').upsert({ org_company_id: job.company_id, external_id: String(raw.id), title: raw.title ?? raw.name ?? null, started_at: started, ended_at: raw.meeting?.endingAt ?? null, organizer_email: raw.recorder?.email ?? null, participants: raw.meeting?.participants ?? raw.participants ?? [], recording_url: raw.url ?? null, source_payload: { durationSeconds: raw.durationSeconds ?? null }, status: 'new' }, { onConflict: 'org_company_id,external_id', ignoreDuplicates: true }).select('id');
          if (error) throw error;
          imported += inserted?.length ?? 0;
        }
        await save({ cursor: page.cursor, phase: page.cursor ? 'discovery' : 'content', scanned: job.scanned + page.rows.length, imported: job.imported + imported, status: 'running', attempts: 0, last_error: null });
      } else {
        const { data: rows, error } = await db.from('claap_recordings').select('id,external_id,summary,transcript_text,transcript_url,hydration_complete,source_payload').eq('org_company_id', job.company_id).gte('started_at', job.window_start).lte('started_at', job.window_end).or('transcript_text.is.null,hydration_complete.eq.false').or(`next_sync_at.is.null,next_sync_at.lte.${now}`).lt('sync_attempts', 6).order('started_at', { ascending: false }).limit(3);
        if (error) throw error;
        let hydrated = 0, linked = 0;
        for (const row of rows ?? []) {
          if ((await shouldDefer('low')).defer) break;
          const patch: Record<string, unknown> = {};
          if (!row.hydration_complete) {
            const content = await claapFetchRecording({ externalId: row.external_id, recordingRowId: row.id, priority: 'low', source: 'claap-funding-backfill' });
            if (content.skipped && content.skipped !== 'already_hydrated') break;
            if (!content.ok) throw new Error(content.error ?? 'Content unavailable');
            if (content.recording) Object.assign(patch, { summary: content.recording.summary_md ?? row.summary, transcript_url: content.recording.transcript_url ?? row.transcript_url, action_items: content.recording.action_items, key_takeaways: content.recording.key_takeaways, chapters: content.recording.chapters, claap_summary_synced_at: now });
          }
          if (!row.transcript_text) {
            const tx = await fetch(`${CLAAP_API_BASE}/recordings/${encodeURIComponent(row.external_id)}/transcript?format=text`, { headers: { 'X-Claap-Key': token }, signal: AbortSignal.timeout(15_000) });
            await db.rpc('claap_record_api_call', { _count: 1 });
            if (tx.status === 429) { await db.rpc('claap_mark_rate_limited'); throw new Error('Transcript quota reached'); }
            if (!tx.ok) {
              const { error } = await db.from('claap_recordings').update({ sync_attempts: 6, last_sync_error: `Transcript unavailable (${tx.status})`, next_sync_at: retryAt(6) }).eq('id', row.id).eq('org_company_id', job.company_id);
              if (error) throw error;
              continue;
            }
            const payload = tx.headers.get('content-type')?.includes('application/json') ? await tx.json() : await tx.text();
            const text = typeof payload === 'string' ? payload : payload.result?.transcript ?? payload.transcript;
            if (typeof text !== 'string' || !text.trim()) throw new Error('Transcript not ready');
            patch.transcript_text = text; patch.transcript_available = true;
          }
          const { error: updateError } = await db.from('claap_recordings').update(patch).eq('id', row.id).eq('org_company_id', job.company_id);
          if (updateError) throw updateError;
          const contacts = await db.rpc('claap_link_recording_contacts', { p_recording_id: row.id });
          const lenders = await db.rpc('claap_link_recording_funding_sources', { p_recording_id: row.id, p_limit: 1 });
          if (contacts.error || lenders.error) throw contacts.error ?? lenders.error;
          linked += Number(contacts.data ?? 0) + Number(lenders.data ?? 0); hydrated++;
        }
        const { count } = await db.from('claap_recordings').select('id', { count: 'exact', head: true }).eq('org_company_id', job.company_id).gte('started_at', job.window_start).lte('started_at', job.window_end).or('transcript_text.is.null,hydration_complete.eq.false').lt('sync_attempts', 6);
        await save({ hydrated: job.hydrated + hydrated, linked: job.linked + linked, phase: count === 0 ? 'complete' : 'content', status: count === 0 ? 'complete' : 'running', attempts: 0, last_error: null });
      }
      const { data } = await db.from('claap_funding_backfill_jobs').select('*').eq('id', job.id).single();
      return reply({ ok: true, job: data });
    } catch (error) {
      await save({ status: 'deferred', attempts: job.attempts + 1, failures: job.failures + 1, next_run_at: retryAt(job.attempts + 1), last_error: error instanceof Error ? error.message : 'Backfill failed' });
      return reply({ ok: true, deferred: true });
    }
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Backfill unavailable' }, 500); }
});