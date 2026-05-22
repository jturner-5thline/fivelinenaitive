import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ReqBody {
  user_ids: string[];
  time_min: string;
  time_max: string;
}

interface TeammateResult {
  user_id: string;
  email: string | null;
  display_name: string | null;
  connected: boolean;
  busy: { start: string; end: string }[];
  error?: string;
}

async function fetchBusy(
  grantId: string,
  startUnix: number,
  endUnix: number,
): Promise<{ start: string; end: string }[]> {
  const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
  url.searchParams.set("calendar_id", "primary");
  url.searchParams.set("start", String(startUnix));
  url.searchParams.set("end", String(endUnix));
  url.searchParams.set("limit", "200");
  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${NYLAS_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Nylas ${resp.status}: ${txt.slice(0, 120)}`);
  }
  const data = await resp.json();
  const events = (data?.data || []) as any[];
  const busy: { start: string; end: string }[] = [];
  for (const e of events) {
    // Skip transparent/free and cancelled
    if (e.status === "cancelled") continue;
    if (e.busy === false) continue;
    const w = e.when || {};
    if (typeof w.start_time === "number" && typeof w.end_time === "number") {
      busy.push({
        start: new Date(w.start_time * 1000).toISOString(),
        end: new Date(w.end_time * 1000).toISOString(),
      });
    } else if (w.start_date && w.end_date) {
      // all-day; skip from busy
      continue;
    }
  }
  return busy;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!NYLAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReqBody = await req.json();
    if (!Array.isArray(body.user_ids) || body.user_ids.length === 0) {
      return new Response(JSON.stringify({ teammates: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userIds = body.user_ids.slice(0, 25);
    const startUnix = Math.floor(new Date(body.time_min).getTime() / 1000);
    const endUnix = Math.floor(new Date(body.time_max).getTime() / 1000);

    const [{ data: profiles }, { data: tokens }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, email, display_name")
        .in("user_id", userIds),
      supabase
        .from("gmail_tokens")
        .select("user_id, grant_id")
        .in("user_id", userIds),
    ]);

    const profileMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profileMap.set(p.user_id, p));
    const grantMap = new Map<string, string>();
    (tokens || []).forEach((t: any) => {
      if (t.grant_id) grantMap.set(t.user_id, t.grant_id);
    });

    const results: TeammateResult[] = await Promise.all(
      userIds.map(async (uid) => {
        const profile = profileMap.get(uid) || {};
        const grantId = grantMap.get(uid);
        const base: TeammateResult = {
          user_id: uid,
          email: profile.email || null,
          display_name: profile.display_name || null,
          connected: !!grantId,
          busy: [],
        };
        if (!grantId) return base;
        try {
          base.busy = await fetchBusy(grantId, startUnix, endUnix);
        } catch (e: any) {
          base.error = e?.message || "failed";
        }
        return base;
      }),
    );

    return new Response(JSON.stringify({ teammates: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[teammates-availability] error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});