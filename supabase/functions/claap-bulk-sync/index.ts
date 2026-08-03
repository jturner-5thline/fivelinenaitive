import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasClaapToken } from "../_shared/claap-api.ts";
import {
  claapFetchRecording,
  markHydrated,
  markRateLimitedRow,
  shouldDefer,
  getQuotaStatus,
} from "../_shared/claap-quota.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!hasClaapToken()) {
    return new Response(JSON.stringify({ ok: false, error: "missing_token", token_present: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Bulk sync is a LOW-priority job. If we're in quota-protect mode, bail out
  // early so we don't burn the remaining daily quota on historical backfill.
  const gate = await shouldDefer("low");
  if (gate.defer) {
    return new Response(JSON.stringify({
      ok: false, deferred: true, reason: gate.quota.outOfQuota ? "out_of_quota" : "quota_protect",
      quota: gate.quota,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const results: any[] = [];

  // 1) Backfill claap_recordings rows for any claap_meetings.claap_id that
  //    doesn't yet have a paired recording. Batched via raw SQL for speed —
  //    one INSERT covers everything, then one INSERT for the link rows.
  await supabase.rpc("backfill_claap_recordings_from_meetings");

  // "Hydrate once" — only pick recordings that have NEVER been hydrated (no
  // stored summary + transcript). We deliberately do NOT include the
  // "stale >24h" clause any more: once hydrated, Claap is not called again.
  // Explicit user-triggered refreshes go via `claap-sync-recording-content`
  // with force=true.
  const { data: unhydrated } = await supabase
    .from("claap_recordings")
    .select("id, external_id, title, hydration_complete, next_sync_at, last_sync_status")
    .eq("hydration_complete", false)
    .or("next_sync_at.is.null,next_sync_at.lt." + new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(40);
  const toSync = unhydrated ?? [];
  for (const row of toSync) {
    // Re-check quota mid-run so we stop the second we cross the threshold.
    const q = await getQuotaStatus();
    if (q.outOfQuota) { results.push({ id: row.id, ok: false, deferred: "out_of_quota" }); break; }
    if (!row.external_id) {
      results.push({ id: row.id, ok: false, error: "no_external_id" });
      continue;
    }
    const fetched = await claapFetchRecording({
      externalId: row.external_id,
      recordingRowId: row.id,
      priority: "low",
      source: "claap-bulk-sync",
      operation: "get_recording",
    });
    if (fetched.skipped === "already_hydrated") {
      results.push({ id: row.id, ok: true, skipped: "already_hydrated" });
      continue;
    }
    if (fetched.skipped === "out_of_quota" || fetched.skipped === "quota_protect") {
      results.push({ id: row.id, ok: false, deferred: fetched.skipped });
      break; // stop the batch — every subsequent call would also defer.
    }
    if (fetched.rateLimited) {
      await markRateLimitedRow(row.id, fetched.error || "429");
      results.push({ id: row.id, ok: false, rate_limited: true });
      break;
    }
    if (!fetched.ok || !fetched.recording) {
      results.push({ id: row.id, ok: false, error: fetched.error || "not_found" });
      continue;
    }
    const norm = fetched.recording;
    const { error } = await supabase.from("claap_recordings").update({
        summary: norm.summary_md,
        action_items: norm.action_items,
        key_takeaways: norm.key_takeaways,
        transcript_url: norm.transcript_url,
        recording_url: norm.recording_url ?? norm.url,
        chapters: norm.chapters,
        transcript_available: !!norm.transcript_url || !!(norm.raw as any)?.transcripts?.length,
        claap_summary_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    if (error) {
        results.push({ id: row.id, ok: false, error: error.message });
    } else {
        await markHydrated(row.id);
        results.push({
          id: row.id,
          title: row.title,
          ok: true,
          summary_bytes: norm.summary_md?.length || 0,
          action_items: norm.action_items.length,
        });
    }
  }

  // After syncing summaries, score any recordings that have never been
  // scored. This is what populates deal/contact/company candidates and
  // auto-links to deals (mirroring into deal_claap_recordings so the deal
  // detail page surfaces the call). Without this, recordings only ever
  // get a meeting auto-repair link and never reach a deal.
  const { data: unscored } = await supabase
    .from('claap_recordings')
    .select('id')
    .is('last_scored_at', null)
    .order('started_at', { ascending: false })
    .limit(40);
  const scoreUrl = `${supabaseUrl}/functions/v1/claap-score-recording`;
  const scoreResults: any[] = [];
  for (const r of unscored ?? []) {
    try {
      const resp = await fetch(scoreUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          'x-internal-call': '1',
        },
        body: JSON.stringify({ recording_id: r.id, run_type: 'post_call' }),
      });
      scoreResults.push({ id: r.id, ok: resp.ok, status: resp.status });
    } catch (e) {
      scoreResults.push({ id: r.id, ok: false, error: String((e as Error).message || e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    token_present: true,
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    results,
    scored: scoreResults.length,
    score_results: scoreResults,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});