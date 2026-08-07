import { createClient } from 'npm:@supabase/supabase-js@2';
import { hasClaapToken } from '../_shared/claap-api.ts';
import {
  claapFetchRecording,
  shouldDefer,
  getQuotaStatus,
} from '../_shared/claap-quota.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 720]; // attempt n -> wait

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Exported for unit tests.
export function nextRetryAt(attempts: number, now: Date = new Date()): Date {
  const idx = Math.min(Math.max(attempts, 0), BACKOFF_MINUTES.length - 1);
  return new Date(now.getTime() + BACKOFF_MINUTES[idx] * 60_000);
}

export function suggestionIdFor(externalId: string, text: string, idx: number): string {
  // Idempotent key — same recording + same text + same order -> same id.
  const slug = text.toLowerCase().replace(/\s+/g, '-').slice(0, 60);
  return `${externalId}:${idx}:${slug}`;
}

type RecordingRow = {
  id: string;
  external_id: string;
  org_company_id: string | null;
  sync_attempts: number | null;
};

async function syncOneRecording(admin: any, row: RecordingRow) {
  const attempts = (row.sync_attempts ?? 0) + 1;
  try {
    const fetched = await claapFetchRecording({
      externalId: row.external_id,
      recordingRowId: row.id,
      priority: 'low',
      source: 'claap-backfill-summaries',
      operation: 'get_recording',
    });
    if (fetched.skipped === 'already_hydrated') {
      // Row is already hydrated in Supabase — do NOT call Claap again.
      await admin.from('claap_recordings').update({
        sync_attempts: 0,
        last_sync_error: null,
        last_sync_status: 'ok',
        next_sync_at: null,
      }).eq('id', row.id);
      return { ok: true, status: 200, recording_id: row.id, skipped: 'already_hydrated' };
    }
    if (fetched.skipped === 'out_of_quota' || fetched.skipped === 'quota_protect') {
      // Push retry past the quota reset so we stop hammering the API today.
      await admin.from('claap_recordings').update({
        last_sync_status: fetched.skipped,
        next_sync_at: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
      }).eq('id', row.id);
      return { ok: false, status: 429, recording_id: row.id, deferred: fetched.skipped };
    }
    if (fetched.rateLimited) {
      await admin.from('claap_sync_errors').insert({
        recording_id: row.id,
        recording_external_id: row.external_id,
        org_company_id: row.org_company_id,
        error_code: 'rate_limited',
        error_message: fetched.error || '429',
        attempts,
      });
      await admin.from('claap_recordings').update({
        sync_attempts: attempts,
        last_sync_error: (fetched.error || '429').slice(0, 500),
        last_sync_status: 'rate_limited',
        // Retry after the next UTC midnight — quota resets daily.
        next_sync_at: new Date(Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 1,
          0, 5, 0,
        )).toISOString(),
      }).eq('id', row.id);
      return { ok: false, status: 429, recording_id: row.id };
    }
    const normalized = fetched.recording;
    if (!normalized) {
      // 404 from Claap -> log + back off.
      await admin.from('claap_sync_errors').insert({
        recording_id: row.id,
        recording_external_id: row.external_id,
        org_company_id: row.org_company_id,
        error_code: 'not_found',
        error_message: 'Claap returned 404 for recording',
        attempts,
      });
      await admin.from('claap_recordings').update({
        sync_attempts: attempts,
        last_sync_error: 'Claap returned 404 for recording',
        last_sync_status: 'not_found',
        next_sync_at: nextRetryAt(attempts).toISOString(),
      }).eq('id', row.id);
      return { ok: false, status: 404, recording_id: row.id };
    }

    const nowIso = new Date().toISOString();
    await admin.from('claap_recordings').update({
      summary: normalized.summary_md,
      action_items: normalized.action_items,
      key_takeaways: normalized.key_takeaways,
      transcript_url: normalized.transcript_url,
      recording_url: normalized.recording_url ?? normalized.url,
      chapters: normalized.chapters,
      transcript_available: !!normalized.transcript_url || !!(normalized.raw as any)?.transcripts?.length,
      claap_summary_synced_at: nowIso,
      sync_attempts: 0,
      last_sync_error: null,
      last_sync_status: 'ok',
      next_sync_at: null,
      updated_at: nowIso,
    }).eq('id', row.id);

    // Mirror into claap_meetings (if linked via claap_recording_links or by claap_id).
    let meetingIds: string[] = [];
    const { data: links } = await admin
      .from('claap_recording_links')
      .select('entity_id')
      .eq('recording_id', row.id)
      .eq('entity_type', 'meeting');
    meetingIds = (links ?? []).map((l: any) => l.entity_id).filter(Boolean);
    if (meetingIds.length === 0) {
      const { data: byClaapId } = await admin
        .from('claap_meetings')
        .select('id')
        .eq('claap_id', row.external_id);
      meetingIds = (byClaapId ?? []).map((m: any) => m.id);
    }

    for (const meetingId of meetingIds) {
      await admin.from('claap_meetings').update({
        ai_summary: normalized.summary_md,
        next_steps: normalized.action_items.map((a) => a.text).filter(Boolean),
        key_decisions: normalized.key_takeaways,
        updated_at: nowIso,
      }).eq('id', meetingId);

      // Idempotent upsert of meeting_task_suggestions by (scope_key, suggestion_id).
      if (row.org_company_id && normalized.action_items.length > 0) {
        const scopeKey = `recording:${row.id}`;
        const rows = normalized.action_items.map((a, idx) => ({
          org_company_id: row.org_company_id,
          scope_key: scopeKey,
          meeting_id: meetingId,
          recording_id: row.id,
          suggestion_id: suggestionIdFor(row.external_id, a.text, idx),
          text: a.text,
          assignee_email: typeof a.assignee === 'string' && a.assignee.includes('@') ? a.assignee : null,
          external_mention: typeof a.assignee === 'string' && !a.assignee.includes('@') ? a.assignee : null,
          source: 'claap',
          status: 'pending',
        }));
        await admin
          .from('meeting_task_suggestions')
          .upsert(rows, { onConflict: 'scope_key,suggestion_id', ignoreDuplicates: false });
      }
    }

    return { ok: true, status: 200, recording_id: row.id, mirrored_meetings: meetingIds.length };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await admin.from('claap_sync_errors').insert({
      recording_id: row.id,
      recording_external_id: row.external_id,
      org_company_id: row.org_company_id,
      error_code: 'fetch_error',
      error_message: msg.slice(0, 500),
      attempts,
    });
    await admin.from('claap_recordings').update({
      sync_attempts: attempts,
      last_sync_error: msg.slice(0, 500),
      last_sync_status: 'error',
      next_sync_at: nextRetryAt(attempts).toISOString(),
    }).eq('id', row.id);
    return { ok: false, status: 500, recording_id: row.id, error: msg };
  }
}

/**
 * Ensure a claap_recordings row exists for an external Claap id. Recordings
 * that were linked/shared before the nightly sync ran have no local row yet,
 * which used to surface as a hard 404 (`recording_not_found`).
 */
async function ensureRecordingRow(
  admin: any,
  externalId: string,
  orgCompanyId?: string | null,
): Promise<RecordingRow | null> {
  const { data: existing } = await admin
    .from('claap_recordings')
    .select('id, external_id, org_company_id, sync_attempts')
    .eq('external_id', externalId)
    .maybeSingle();
  if (existing) return existing;

  const { data: inserted, error } = await admin
    .from('claap_recordings')
    .insert({ external_id: externalId, org_company_id: orgCompanyId ?? null, sync_attempts: 0 })
    .select('id, external_id, org_company_id, sync_attempts')
    .maybeSingle();
  if (error) {
    // Race: another request inserted it first.
    const { data: retry } = await admin
      .from('claap_recordings')
      .select('id, external_id, org_company_id, sync_attempts')
      .eq('external_id', externalId)
      .maybeSingle();
    return retry ?? null;
  }
  return inserted ?? null;
}

async function resolveRecordingByMeeting(admin: any, meetingId: string): Promise<RecordingRow | null> {
  // Prefer link table.
  const { data: link } = await admin
    .from('claap_recording_links')
    .select('recording_id')
    .eq('entity_type', 'meeting')
    .eq('entity_id', meetingId)
    .limit(1)
    .maybeSingle();
  let recordingId: string | null = link?.recording_id ?? null;

  if (!recordingId) {
    // Fall back to claap_id ↔ external_id.
    const { data: m } = await admin
      .from('claap_meetings')
      .select('claap_id, company_id')
      .eq('id', meetingId)
      .maybeSingle();
    if (m?.claap_id) {
      return await ensureRecordingRow(admin, m.claap_id, m.company_id ?? null);
    }
    return null;
  }

  const { data: r } = await admin
    .from('claap_recordings')
    .select('id, external_id, org_company_id, sync_attempts')
    .eq('id', recordingId)
    .maybeSingle();
  return r ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!hasClaapToken()) {
      return json({ ok: false, error: 'missing_claap_token' }, 200);
    }

    const admin = createClient(SB_URL, SERVICE);
    const body = await req.json().catch(() => ({} as any));
    const { meeting_id, recording_id, claap_id, force, limit, mode } = body || {};

    // Single-target mode (UI Refresh / on-card-open / one-shot deploy hook).
    if (meeting_id || recording_id || claap_id) {
      let row: RecordingRow | null = null;
      if (recording_id) {
        const { data } = await admin
          .from('claap_recordings')
          .select('id, external_id, org_company_id, sync_attempts')
          .eq('id', recording_id)
          .maybeSingle();
        row = data ?? null;
      } else if (meeting_id) {
        row = await resolveRecordingByMeeting(admin, meeting_id);
      } else if (claap_id) {
        row = await ensureRecordingRow(admin, String(claap_id));
      }
      if (!row) return json({ ok: false, error: 'recording_not_found' }, 404);
      if (force) {
        await admin
          .from('claap_recordings')
          .update({ sync_attempts: 0, next_sync_at: null, last_sync_error: null })
          .eq('id', row.id);
        row.sync_attempts = 0;
      }
      const result = await syncOneRecording(admin, row);
      return json({ ok: result.ok, single: true, result });
    }

    // Batch / cron mode.
    const max = Math.min(Number(limit) || 25, 100);
    const all = mode === 'all';
    let query = admin
      .from('claap_recordings')
      .select('id, external_id, org_company_id, sync_attempts, ended_at, started_at, summary, claap_summary_synced_at, action_items')
      .or('summary.is.null,claap_summary_synced_at.is.null')
      .lt('sync_attempts', MAX_ATTEMPTS)
      .limit(max);
    if (!all) {
      // Only rows whose backoff window has elapsed (or never been tried).
      query = query.or(`next_sync_at.is.null,next_sync_at.lte.${new Date().toISOString()}`);
    }
    const { data: rows, error } = await query;
    if (error) throw error;

    // Quota gate: this is a LOW-priority backfill. If we're already in
    // protect mode (>=80% of daily budget) or out of quota, bail out so we
    // don't burn what's left on historical rows and starve user-triggered
    // syncs. This is the guard that was missing when this job ran every 10
    // minutes and steamrolled the Claap API by mid-morning.
    const gate = await shouldDefer('low');
    if (gate.defer) {
      return json({
        ok: false,
        deferred: true,
        reason: gate.quota.outOfQuota ? 'out_of_quota' : 'quota_protect',
        quota: gate.quota,
      });
    }

    const now = Date.now();
    const eligible = (rows ?? []).filter((r: any) => {
      // Treat the call as "ended" if started_at < now - 30min or ended_at < now.
      const ended = r.ended_at ? new Date(r.ended_at).getTime() : null;
      const started = r.started_at ? new Date(r.started_at).getTime() : null;
      if (ended && ended > now) return false;
      if (!ended && started && started > now - 30 * 60_000) return false;
      return true;
    });

    const results: any[] = [];
    for (const row of eligible) {
      // Mid-batch quota re-check — stop the second we cross the threshold.
      const q = await getQuotaStatus();
      if (q.outOfQuota) {
        results.push({ ok: false, deferred: 'out_of_quota', recording_id: (row as any).id });
        break;
      }
      const r = await syncOneRecording(admin, row as RecordingRow);
      results.push(r);
    }
    return json({
      ok: true,
      candidates: eligible.length,
      backfilled: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    console.error('claap-backfill-summaries error', e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});