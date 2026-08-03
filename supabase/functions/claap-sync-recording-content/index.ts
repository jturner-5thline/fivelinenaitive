import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractClaapExternalId,
  hasClaapToken,
} from "../_shared/claap-api.ts";
import {
  claapFetchRecording,
  markHydrated,
  markRateLimitedRow,
  CallPriority,
} from "../_shared/claap-quota.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const recordingId = (body.recording_id as string | undefined) || null;
  const externalIdInput = (body.external_id as string | undefined) || (body.url as string | undefined) || null;
  // Callers can request priority: user-initiated links/refreshes should send
  // "high"; scheduled backfill sends "low". Default is "normal".
  const priority = ((body.priority as string) || "normal") as CallPriority;
  const force = body.force === true;

  if (!hasClaapToken()) {
    return new Response(JSON.stringify({
      ok: false,
      error: "missing_token",
      message: "CLAAP_API_TOKEN (or legacy CLAAP_API_KEY) is not configured",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Resolve the row + external id.
  let row: any = null;
  let externalId: string | null = null;

  if (recordingId) {
    const { data, error } = await supabase
      .from("claap_recordings")
      .select("id, org_company_id, external_id, title, hydration_complete")
      .eq("id", recordingId)
      .maybeSingle();
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    row = data;
    externalId = data?.external_id || null;
  }

  if (!externalId && externalIdInput) {
    externalId = extractClaapExternalId(externalIdInput);
  }

  if (!externalId) {
    return new Response(JSON.stringify({ ok: false, error: "missing_external_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const fetched = await claapFetchRecording({
    externalId,
    recordingRowId: row?.id ?? null,
    priority,
    force,
    source: force ? "manual-refresh" : "claap-sync-recording-content",
    operation: "get_recording",
  });

  if (fetched.skipped === "already_hydrated") {
    return new Response(JSON.stringify({
      ok: true, skipped: "already_hydrated", recording_id: row?.id ?? null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (fetched.skipped === "out_of_quota" || fetched.skipped === "quota_protect") {
    // Mark a pending refresh so it runs after the quota resets.
    if (row?.id) {
      await supabase.from("claap_recordings").update({
        refresh_requested_at: new Date().toISOString(),
        refresh_priority: priority,
      }).eq("id", row.id);
    }
    return new Response(JSON.stringify({
      ok: false, deferred: true, reason: fetched.skipped, quota: fetched.quota,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (fetched.rateLimited) {
    if (row?.id) await markRateLimitedRow(row.id, fetched.error || "429");
    return new Response(JSON.stringify({
      ok: false, rate_limited: true, error: fetched.error, quota: fetched.quota,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!fetched.ok || !fetched.recording) {
    return new Response(JSON.stringify({ ok: false, error: fetched.error || "claap_recording_not_found", external_id: externalId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const normalized = fetched.recording;
  if (!normalized) {
    return new Response(JSON.stringify({ ok: false, error: "claap_recording_not_found", external_id: externalId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const update = {
    summary: normalized.summary_md,
    action_items: normalized.action_items,
    key_takeaways: normalized.key_takeaways,
    transcript_url: normalized.transcript_url,
    recording_url: normalized.recording_url ?? normalized.url,
    chapters: normalized.chapters,
    transcript_available: !!normalized.transcript_url || !!(normalized.raw as any)?.transcripts?.length,
    claap_summary_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let updated: any = null;
  if (row?.id) {
    const { data, error } = await supabase
      .from("claap_recordings")
      .update(update)
      .eq("id", row.id)
      .select()
      .maybeSingle();
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    updated = data;
    await markHydrated(row.id);
  } else {
    // No DB row yet — try to find by external_id across companies.
    const { data, error } = await supabase
      .from("claap_recordings")
      .update(update)
      .eq("external_id", externalId)
      .select();
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    updated = data?.[0] || null;
  }

  return new Response(JSON.stringify({
    ok: true,
    recording_id: updated?.id || row?.id || null,
    external_id: externalId,
    summary_bytes: normalized.summary_md?.length || 0,
    action_items: normalized.action_items.length,
    key_takeaways: normalized.key_takeaways.length,
    recording_url: update.recording_url,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});