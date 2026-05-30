import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasClaapToken, claapGetRecording } from "../_shared/claap-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!hasClaapToken()) {
    return new Response(JSON.stringify({ ok: false, error: "missing_token", token_present: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Recordings missing a summary OR with stale (>24h) sync.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("claap_recordings")
    .select("id, external_id, title, summary, claap_summary_synced_at")
    .or(`summary.is.null,claap_summary_synced_at.is.null,claap_summary_synced_at.lt.${cutoff}`)
    .order("started_at", { ascending: false })
    .limit(50);

  const results: any[] = [];

  // 1) Backfill claap_recordings rows for any claap_meetings.claap_id that
  //    doesn't yet have a paired recording. Without this, the read-path RPC
  //    has nothing to join on and the textarea falls back to synthesized.
  const { data: meetingsMissing } = await supabase
    .from("claap_meetings")
    .select("id, claap_id, title, company_id, started_at, organizer_email")
    .not("claap_id", "is", null)
    .limit(200);
  for (const m of meetingsMissing ?? []) {
    if (!m.claap_id || m.claap_id.startsWith("test-")) continue;
    const { data: existing } = await supabase
      .from("claap_recordings")
      .select("id")
      .eq("org_company_id", m.company_id)
      .eq("external_id", m.claap_id)
      .maybeSingle();
    let recordingRowId = existing?.id ?? null;
    if (!recordingRowId) {
      const { data: inserted, error: insErr } = await supabase
        .from("claap_recordings")
        .insert({
          org_company_id: m.company_id,
          external_id: m.claap_id,
          title: m.title,
          started_at: m.started_at,
          organizer_email: m.organizer_email,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr) {
        results.push({ meeting_id: m.id, ok: false, error: `insert: ${insErr.message}` });
        continue;
      }
      recordingRowId = inserted!.id;
    }
    // Ensure a primary_meeting link exists.
    await supabase
      .from("claap_recording_links")
      .upsert({
        entity_type: "meeting",
        entity_id: m.id,
        recording_id: recordingRowId,
        link_role: "primary_meeting",
        confidence: 1.0,
      }, { onConflict: "recording_id,link_role,entity_id" });
  }

  // Re-pull the stale list so newly-inserted rows get summaries fetched too.
  const { data: stale2 } = await supabase
    .from("claap_recordings")
    .select("id, external_id, title, summary, claap_summary_synced_at")
    .or(`summary.is.null,claap_summary_synced_at.is.null,claap_summary_synced_at.lt.${cutoff}`)
    .order("started_at", { ascending: false })
    .limit(100);
  const toSync = stale2 ?? stale ?? [];
  for (const row of toSync) {
    if (!row.external_id) {
      results.push({ id: row.id, ok: false, error: "no_external_id" });
      continue;
    }
    try {
      const norm = await claapGetRecording(row.external_id);
      if (!norm) {
        results.push({ id: row.id, ok: false, error: "not_found" });
        continue;
      }
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
        results.push({
          id: row.id,
          title: row.title,
          ok: true,
          summary_bytes: norm.summary_md?.length || 0,
          action_items: norm.action_items.length,
        });
      }
    } catch (e) {
      results.push({ id: row.id, ok: false, error: String((e as Error).message || e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    token_present: true,
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});