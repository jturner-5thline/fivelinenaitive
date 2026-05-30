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
  for (const row of stale ?? []) {
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