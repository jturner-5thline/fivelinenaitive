import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One-shot backfill: populate `embedding` for every vdr_document_chunks row
 * where embedding IS NULL. Re-runnable. Bounded by `max_chunks` per call
 * to stay under edge function CPU/time limits.
 *
 * POST body (all optional):
 *   { max_chunks?: number = 500, batch_size?: number = 20 }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const maxChunks = Math.min(Math.max(Number(body.max_chunks) || 500, 1), 2000);
    const batchSize = Math.min(Math.max(Number(body.batch_size) || 20, 1), 50);

    const { data: chunks, error: fetchErr } = await supabase
      .from("vdr_document_chunks")
      .select("id, chunk_text")
      .is("embedding", null)
      .limit(maxChunks);

    if (fetchErr) throw fetchErr;

    const total = chunks?.length ?? 0;
    let embedded = 0;
    let failures = 0;
    let firstError: string | null = null;
    let firstStatus: number | null = null;

    for (let i = 0; i < total; i += batchSize) {
      const slice = chunks!.slice(i, i + batchSize);

      const updates = await Promise.all(
        slice.map(async (row) => {
          const input = String(row.chunk_text ?? "").slice(0, 8000);
          if (!input.trim()) return { id: row.id, embedding: null, ok: false, status: 0 };
          try {
            const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "openai/text-embedding-3-small",
                input,
              }),
            });
            if (!res.ok) {
              const txt = await res.text();
              if (!firstError) { firstError = txt.slice(0, 300); firstStatus = res.status; }
              return { id: row.id, embedding: null, ok: false, status: res.status };
            }
            const j = await res.json();
            const vec = j?.data?.[0]?.embedding ?? null;
            return { id: row.id, embedding: vec, ok: !!vec, status: 200 };
          } catch (e) {
            if (!firstError) firstError = String(e);
            return { id: row.id, embedding: null, ok: false, status: -1 };
          }
        }),
      );

      for (const u of updates) {
        if (!u.ok || !u.embedding) { failures++; continue; }
        const { error: upErr } = await supabase
          .from("vdr_document_chunks")
          .update({ embedding: u.embedding as any })
          .eq("id", u.id);
        if (upErr) {
          failures++;
          if (!firstError) firstError = upErr.message;
        } else {
          embedded++;
        }
      }
    }

    const { count: remaining } = await supabase
      .from("vdr_document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null);

    return new Response(
      JSON.stringify({
        considered: total,
        embedded,
        failures,
        remaining,
        first_error: firstError,
        first_error_status: firstStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("backfill-vdr-embeddings fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});