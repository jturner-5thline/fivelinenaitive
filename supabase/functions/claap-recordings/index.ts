import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClaapParticipant {
  attended: boolean;
  email: string;
  id: string;
  name: string;
}

interface ClaapRecording {
  id: string;
  createdAt: string;
  durationSeconds: number;
  labels: string[];
  recorder: {
    attended: boolean;
    email: string;
    id: string;
    name: string;
  };
  state: string;
  thumbnailUrl: string;
  title: string;
  transcripts: Array<{
    textUrl: string;
    url: string;
    isActive: boolean;
    isTranscript: boolean;
    langIso2: string;
  }>;
  url: string;
  videoUrl?: string;
  embedUrl?: string;
  meeting?: {
    participants: ClaapParticipant[];
    startingAt?: string;
    endingAt?: string;
    type?: string;
    conferenceUrl?: string;
  };
  // New flat aiFields format (preferred). Returned when the request includes
  // returnAiFields=true. Both this and the legacy insightTemplates shape are
  // delivered during the rollout window until 2026-06-15.
  aiFields?: Array<{
    key: string;
    label: string;
    value: string;
    type: string;
  }>;
  // Legacy nested template shape.
  insightTemplates?: Array<{
    id?: string;
    name?: string;
    insights?: Array<{
      id?: string;
      name?: string;
      sections?: Array<{
        title?: string;
        description?: string;
        content?: string;
        text?: string;
      }>;
    }>;
  }>;
}

/**
 * Flatten Claap insight data into { title, description } entries.
 * Prefers the new aiFields collection; falls back to the legacy
 * insightTemplates -> insights -> sections tree.
 */
function extractClaapInsights(rec: Pick<ClaapRecording, "aiFields" | "insightTemplates">): Array<{ title: string; description: string }> {
  if (Array.isArray(rec?.aiFields) && rec.aiFields.length > 0) {
    return rec.aiFields
      .map((f) => ({
        title: (f?.label || f?.key || "").trim(),
        description: (f?.value ?? "").toString().trim(),
      }))
      .filter((s) => s.title || s.description);
  }
  if (Array.isArray(rec?.insightTemplates) && rec.insightTemplates.length > 0) {
    const out: Array<{ title: string; description: string }> = [];
    for (const tpl of rec.insightTemplates) {
      for (const ins of tpl?.insights ?? []) {
        for (const sec of ins?.sections ?? []) {
          const title = (sec?.title || ins?.name || tpl?.name || "").trim();
          const description = (sec?.description ?? sec?.content ?? sec?.text ?? "").toString().trim();
          if (title || description) out.push({ title, description });
        }
      }
    }
    return out;
  }
  return [];
}

// Simple in-memory cache to survive Claap 429 rate limits across invocations
// while the same edge function instance is warm.
const listCache = new Map<string, { at: number; recordings: unknown[] }>();
const getCache = new Map<string, { at: number; recording: unknown }>();
const CACHE_TTL_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claapApiKey = Deno.env.get("CLAAP_API_KEY");
    if (!claapApiKey) {
      return new Response(JSON.stringify({ error: "Claap API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const recordingId = url.searchParams.get("recordingId");
    const limit = url.searchParams.get("limit") || "20";
    const search = url.searchParams.get("search") || "";

    const claapHeaders = {
      "X-Claap-Key": claapApiKey,
      "Content-Type": "application/json",
    };

    if (action === "list") {
      // Claap hard-caps `limit` at 100 per page and rejects anything larger
      // with a 400 (validation_error). Callers ask for wider windows (e.g.
      // 500) so older meetings stay reachable in the picker, so page through
      // with the pagination cursor instead of sending an oversized limit.
      const requested = Math.max(1, Math.min(Number(limit) || 20, 500));
      const PAGE_SIZE = 100;

      const cacheKey = `limit=${requested}`;
      const cached = listCache.get(cacheKey);
      const fresh = cached && Date.now() - cached.at < CACHE_TTL_MS;
      if (fresh) {
        let recordings = cached!.recordings as ClaapRecording[];
        if (search) {
          const s = search.toLowerCase();
          recordings = recordings.filter((r) =>
            r.title?.toLowerCase().includes(s) ||
            r.recorder?.name?.toLowerCase().includes(s) ||
            r.recorder?.email?.toLowerCase().includes(s) ||
            r.meeting?.participants?.some((p) =>
              p.name?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s)
            ) ||
            r.labels?.some((l: string) => l.toLowerCase().includes(s))
          );
        }
        return new Response(JSON.stringify({ recordings, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await fetch(claapUrl.toString(), {
        method: "GET",
        headers: claapHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claap API error:", errorText);
        // Never return non-2xx from the list path — the UI treats a
        // non-2xx as a hard failure and shows a blank screen. Fall back
        // to the last cached payload (or an empty list) and surface the
        // upstream status as a soft warning instead.
        const stale = listCache.get(cacheKey);
        const recordings = (stale?.recordings as ClaapRecording[] | undefined) ?? [];
        return new Response(
          JSON.stringify({
            recordings,
            cached: !!stale,
            rateLimited: response.status === 429,
            upstreamStatus: response.status,
            warning:
              response.status === 429
                ? "Claap rate limit reached, showing cached recordings"
                : `Claap upstream error (${response.status}), showing cached recordings`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await response.json();
      let recordings = data.result?.recordings || [];

      const withAi = Array.isArray(recordings)
        ? recordings.filter((r: any) => Array.isArray(r?.aiFields) && r.aiFields.length > 0).length
        : 0;
      console.log("[claap] list recordings", recordings.length, "withAiFields=", withAi);

      // Cache the full unfiltered list before applying search.
      listCache.set(cacheKey, { at: Date.now(), recordings: [...recordings] });

      // Filter by search if provided
      if (search) {
        const searchLower = search.toLowerCase();
        recordings = recordings.filter((r: ClaapRecording) =>
          r.title?.toLowerCase().includes(searchLower) ||
          r.recorder?.name?.toLowerCase().includes(searchLower) ||
          r.recorder?.email?.toLowerCase().includes(searchLower) ||
          r.meeting?.participants?.some((p) =>
            p.name?.toLowerCase().includes(searchLower) || p.email?.toLowerCase().includes(searchLower)
          ) ||
          r.labels?.some((l: string) => l.toLowerCase().includes(searchLower))
        );
      }

      // Attach normalized insights so downstream consumers don't have to
      // know about the legacy vs new shape.
      const normalized = recordings.map((r: ClaapRecording) => ({
        ...r,
        insights: extractClaapInsights(r),
      }));
      return new Response(JSON.stringify({ recordings: normalized }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get" && recordingId) {
      // Get single recording details
      const getUrl = new URL(`https://api.claap.io/v1/recordings/${recordingId}`);
      getUrl.searchParams.set("returnAiFields", "true");
      const cachedOne = getCache.get(recordingId);
      if (cachedOne && Date.now() - cachedOne.at < CACHE_TTL_MS) {
        const recording = cachedOne.recording as ClaapRecording;
        const enriched = recording ? { ...recording, insights: extractClaapInsights(recording) } : recording;
        return new Response(JSON.stringify({ recording: enriched, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const response = await fetch(getUrl.toString(), {
        method: "GET",
        headers: claapHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claap API error:", errorText);
        const stale = getCache.get(recordingId);
        const recording = stale ? (stale.recording as ClaapRecording) : null;
        const enriched = recording
          ? { ...recording, insights: extractClaapInsights(recording) }
          : null;
        return new Response(
          JSON.stringify({
            recording: enriched,
            cached: !!stale,
            rateLimited: response.status === 429,
            upstreamStatus: response.status,
            warning:
              response.status === 429
                ? "Claap rate limit reached"
                : `Claap upstream error (${response.status})`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await response.json();
      const recording = data.result?.recording;
      if (recording) {
        console.log(
          "[claap] get recording",
          recordingId,
          "aiFields=",
          Array.isArray((recording as any)?.aiFields) ? (recording as any).aiFields.length : "absent",
          "insightTemplates=",
          Array.isArray((recording as any)?.insightTemplates) ? (recording as any).insightTemplates.length : "absent",
        );
      }
      if (recording) {
        getCache.set(recordingId, { at: Date.now(), recording });
      }
      const enriched = recording
        ? { ...recording, insights: extractClaapInsights(recording) }
        : recording;
      return new Response(JSON.stringify({ recording: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "transcript" && recordingId) {
      // Get recording transcript
      const response = await fetch(`https://api.claap.io/v1/recordings/${recordingId}/transcript?format=text`, {
        method: "GET",
        headers: claapHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claap API error:", errorText);
        return new Response(JSON.stringify({ error: "Failed to fetch transcript" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify({ transcript: data.result?.transcript }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in claap-recordings:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
