// Embed Claap transcripts for semantic search via Ask nAItive.
// Modes:
//   POST { transcript_id }              → (re)embed a single transcript
//   POST { transcript_ids: [...] }      → batch specific transcripts
//   POST { backfill: true, limit?: n }  → embed transcripts missing chunks
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims
const CHUNK_CHARS = 1400;
const CHUNK_OVERLAP = 180;
const EMBED_BATCH = 64;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= CHUNK_CHARS) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      // Prefer breaking on paragraph/newline/sentence boundary
      const window = clean.slice(i, end);
      const nl = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
      const dot = window.lastIndexOf(". ");
      const brk = Math.max(nl, dot);
      if (brk > CHUNK_CHARS * 0.4) end = i + brk + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = end - CHUNK_OVERLAP;
    if (i < 0) i = 0;
  }
  return chunks.filter((c) => c.length > 20);
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  return (json.data || []).map((d: any) => d.embedding as number[]);
}

async function embedTranscript(supabase: any, transcriptId: string) {
  const { data: t, error } = await supabase
    .from("claap_transcripts")
    .select("id, deal_id, claap_meeting_id, transcript_text, summary")
    .eq("id", transcriptId)
    .maybeSingle();
  if (error) throw error;
  if (!t || !t.transcript_text || t.transcript_text.length < 40) {
    return { transcript_id: transcriptId, skipped: true, reason: "no_text" };
  }

  const body = t.transcript_text;
  const chunks = chunkText(body);
  // Prepend summary as chunk 0 if present, so summary-level questions still land in vector space.
  if (t.summary && t.summary.trim().length > 30) chunks.unshift(t.summary.trim());

  // Remove existing chunks for this transcript
  await supabase.from("claap_transcript_chunks").delete().eq("transcript_id", transcriptId);

  const rows: any[] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vectors = await embedBatch(batch);
    for (let j = 0; j < batch.length; j++) {
      rows.push({
        transcript_id: t.id,
        claap_meeting_id: t.claap_meeting_id,
        deal_id: t.deal_id,
        chunk_index: i + j,
        chunk_text: batch[j],
        embedding: vectors[j] as any,
        token_estimate: Math.ceil(batch[j].length / 4),
      });
    }
  }

  if (rows.length) {
    const { error: insErr } = await supabase.from("claap_transcript_chunks").insert(rows);
    if (insErr) throw insErr;
  }
  return { transcript_id: transcriptId, chunks: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    let ids: string[] = [];
    if (body.transcript_id) ids = [body.transcript_id];
    else if (Array.isArray(body.transcript_ids)) ids = body.transcript_ids;
    else if (body.backfill) {
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 200);
      const { data } = await supabase
        .from("claap_transcripts")
        .select("id, chunks:claap_transcript_chunks(id)")
        .not("transcript_text", "is", null)
        .order("recorded_at", { ascending: false })
        .limit(500);
      ids = (data || [])
        .filter((r: any) => !(r.chunks && r.chunks.length))
        .slice(0, limit)
        .map((r: any) => r.id);
    } else {
      return new Response(
        JSON.stringify({ error: "Provide transcript_id, transcript_ids, or backfill:true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: any[] = [];
    for (const id of ids) {
      try {
        results.push(await embedTranscript(supabase, id));
      } catch (e) {
        results.push({ transcript_id: id, error: String((e as Error).message || e) });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});