/**
 * calendar-freebusy
 * -----------------
 * Proxies Nylas v3 calendars/free-busy for the signed-in user's grant,
 * returning per-email busy blocks. Attendees whose free/busy is not
 * shared (Nylas returns an error object for that email, or the call
 * 4xxs on them) are surfaced as `visibility: 'limited'` rather than
 * being silently treated as free.
 *
 * Body: { time_min: ISO, time_max: ISO, emails: string[] }
 * Response: { results: Array<{ email, visibility: 'shared'|'limited',
 *             busy: Array<{ start: ISO, end: ISO }> }> }
 */
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

interface BusyBlock { start: string; end: string }
interface Result {
  email: string;
  visibility: "shared" | "limited";
  busy: BusyBlock[];
  reason?: string;
}

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return ok({ error: "No authorization header" }, 401);
    if (!NYLAS_API_KEY) return ok({ error: "Nylas not configured" }, 500);

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) return ok({ error: "Invalid token" }, 401);
    const userId = claims.claims.sub as string;

    const { data: tok } = await supabase
      .from("gmail_tokens")
      .select("grant_id")
      .eq("user_id", userId)
      .single();
    const grantId = tok?.grant_id;
    if (!grantId) return ok({ error: "Calendar not connected" }, 401);

    const body = await req.json().catch(() => ({}));
    const time_min: string = body?.time_min;
    const time_max: string = body?.time_max;
    const emailsIn: string[] = Array.isArray(body?.emails) ? body.emails : [];
    if (!time_min || !time_max) return ok({ error: "time_min and time_max required" }, 400);

    // Dedupe + cap at 50/batch per Nylas limits.
    const emails = Array.from(new Set(emailsIn.map((e) => String(e).trim().toLowerCase()).filter(Boolean))).slice(0, 50);
    if (emails.length === 0) return ok({ results: [] });

    const startUnix = Math.floor(new Date(time_min).getTime() / 1000);
    const endUnix = Math.floor(new Date(time_max).getTime() / 1000);

    const res = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}/calendars/free-busy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NYLAS_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_time: startUnix,
        end_time: endUnix,
        emails,
      }),
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      console.warn("[calendar-freebusy] nylas non-ok", res.status, json);
      // Surface every attendee as limited rather than failing the whole call.
      const results: Result[] = emails.map((e) => ({
        email: e,
        visibility: "limited",
        busy: [],
        reason: (json && (json.message || json.error)) || `nylas_${res.status}`,
      }));
      return ok({ results, partial: true });
    }

    const rows: any[] = Array.isArray(json?.data) ? json.data : [];
    const byEmail = new Map<string, any>();
    for (const row of rows) {
      if (row?.email) byEmail.set(String(row.email).toLowerCase(), row);
    }

    const results: Result[] = emails.map((email) => {
      const row = byEmail.get(email);
      if (!row || row.object === "error" || row.error) {
        return {
          email,
          visibility: "limited",
          busy: [],
          reason: row?.error || row?.message || "not_shared",
        };
      }
      const busy: BusyBlock[] = Array.isArray(row.time_slots)
        ? row.time_slots
            .filter((s: any) => s?.start_time && s?.end_time)
            .map((s: any) => ({
              start: new Date(s.start_time * 1000).toISOString(),
              end: new Date(s.end_time * 1000).toISOString(),
            }))
        : [];
      return { email, visibility: "shared", busy };
    });

    return ok({ results });
  } catch (e) {
    console.error("[calendar-freebusy] error", e);
    return ok({ error: (e as Error).message || "unexpected" }, 500);
  }
});