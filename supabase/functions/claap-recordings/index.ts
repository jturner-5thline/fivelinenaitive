import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
}

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
      // List recordings
      const claapUrl = new URL("https://api.claap.io/v1/recordings");
      claapUrl.searchParams.set("limit", limit);
      claapUrl.searchParams.set("sort", "created_desc");

      const response = await fetch(claapUrl.toString(), {
        method: "GET",
        headers: claapHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claap API error:", errorText);
        return new Response(JSON.stringify({ error: "Failed to fetch recordings from Claap" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      let recordings = data.result?.recordings || [];

      // Filter by search if provided
      if (search) {
        const searchLower = search.toLowerCase();
        recordings = recordings.filter((r: ClaapRecording) =>
          r.title?.toLowerCase().includes(searchLower) ||
          r.recorder?.name?.toLowerCase().includes(searchLower) ||
          r.labels?.some((l: string) => l.toLowerCase().includes(searchLower))
        );
      }

      return new Response(JSON.stringify({ recordings }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get" && recordingId) {
      // Get single recording details
      const response = await fetch(`https://api.claap.io/v1/recordings/${recordingId}`, {
        method: "GET",
        headers: claapHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claap API error:", errorText);
        return new Response(JSON.stringify({ error: "Failed to fetch recording details" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify({ recording: data.result?.recording }), {
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
