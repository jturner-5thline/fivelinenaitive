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

function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

// Match calendar titles like "Jane Doe <> naitive" (case-insensitive,
// tolerant of whitespace around the <> separator).
const TITLE_RE = /<>\s*naitive\b/i;

interface ReqBody {
  time_min?: string;
  time_max?: string;
}

interface NaitiveEvent {
  id: string;
  title: string;
  start: string | null; // ISO
  end: string | null;   // ISO
  user_email: string | null;
  user_name: string | null;
  html_link: string | null;
}

async function fetchForGrant(
  grantId: string,
  startUnix: number,
  endUnix: number,
  user: { email: string | null; name: string | null },
): Promise<NaitiveEvent[]> {
  const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
  url.searchParams.set("calendar_id", "primary");
  url.searchParams.set("start", String(startUnix));
  url.searchParams.set("end", String(endUnix));
  url.searchParams.set("limit", "200");
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    console.warn("[naitive-qual-calls-count] nylas err", grantId, resp.status);
    return [];
  }
  const data = await resp.json();
  const raw = (data?.data || []) as any[];
  const out: NaitiveEvent[] = [];
  for (const e of raw) {
    if (e?.status === "cancelled") continue;
    const title: string = e?.title || "";
    if (!TITLE_RE.test(title)) continue;
    const w = e?.when || {};
    const startIso = w.start_time
      ? new Date(w.start_time * 1000).toISOString()
      : (w.start_date || null);
    const endIso = w.end_time
      ? new Date(w.end_time * 1000).toISOString()
      : (w.end_date || null);
    out.push({
      id: String(e.id),
      title,
      start: startIso,
      end: endIso,
      user_email: user.email,
      user_name: user.name,
      html_link: e.html_link || null,
    });
  }
  return out;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!NYLAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;
    const callerEmail = (claimsData.claims.email as string | undefined) || null;

    const body: ReqBody = await req.json().catch(() => ({} as ReqBody));
    if (!body.time_min || !body.time_max) {
      return new Response(JSON.stringify({ error: "time_min and time_max required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let callerDomain = domainOf(callerEmail);
    if (!callerDomain) {
      const { data: p } = await supabase
        .from("profiles").select("email").eq("user_id", callerId).maybeSingle();
      callerDomain = domainOf(p?.email);
    }
    if (!callerDomain) {
      return new Response(JSON.stringify({ error: "Could not resolve caller domain" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All profiles in same domain (including caller).
    const { data: profiles, error: profErr } = await supabase
      .from("profiles").select("user_id, email, display_name, full_name");
    if (profErr) throw profErr;
    const sameDomainIds = (profiles || [])
      .filter((p: any) => domainOf(p.email) === callerDomain)
      .map((p: any) => p.user_id);
    if (sameDomainIds.length === 0) {
      return new Response(JSON.stringify({ count: 0, users: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokens } = await supabase
      .from("gmail_tokens").select("user_id, grant_id").in("user_id", sameDomainIds);
    const profileById = new Map<string, { email: string | null; name: string | null }>();
    for (const p of (profiles || []) as any[]) {
      profileById.set(p.user_id, {
        email: p.email ?? null,
        name: p.display_name ?? p.full_name ?? null,
      });
    }
    const grants: { grantId: string; user: { email: string | null; name: string | null } }[] = [];
    for (const t of (tokens || []) as any[]) {
      if (!t.grant_id) continue;
      grants.push({
        grantId: t.grant_id,
        user: profileById.get(t.user_id) || { email: null, name: null },
      });
    }

    const startUnix = Math.floor(new Date(body.time_min).getTime() / 1000);
    const endUnix = Math.floor(new Date(body.time_max).getTime() / 1000);

    const perGrant = await Promise.all(
      grants.map((g) =>
        fetchForGrant(g.grantId, startUnix, endUnix, g.user).catch(() => [] as NaitiveEvent[]),
      ),
    );
    const events = perGrant.flat().sort((a, b) => {
      const ta = a.start ? new Date(a.start).getTime() : 0;
      const tb = b.start ? new Date(b.start).getTime() : 0;
      return ta - tb;
    });
    const total = events.length;

    return new Response(JSON.stringify({ count: total, users: grants.length, events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[naitive-qual-calls-count] error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});