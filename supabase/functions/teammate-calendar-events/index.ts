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
  action: "list_teammates" | "list_events";
  target_user_id?: string;
  time_min?: string;
  time_max?: string;
}

function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
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

    const body: ReqBody = await req.json();

    // Resolve caller's email domain (claims first, then profile fallback).
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

    if (body.action === "list_teammates") {
      // All profiles in the same email domain who have a Google grant.
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, first_name, last_name, avatar_url");
      if (profErr) throw profErr;
      const sameDomain = (profiles || []).filter(
        (p: any) => p.user_id !== callerId && domainOf(p.email) === callerDomain,
      );
      const ids = sameDomain.map((p: any) => p.user_id);
      let connectedIds = new Set<string>();
      if (ids.length > 0) {
        const { data: tokens } = await supabase
          .from("gmail_tokens")
          .select("user_id, grant_id")
          .in("user_id", ids);
        connectedIds = new Set((tokens || []).filter((t: any) => !!t.grant_id).map((t: any) => t.user_id));
      }
      const teammates = sameDomain
        .filter((p: any) => connectedIds.has(p.user_id))
        .map((p: any) => ({
          user_id: p.user_id,
          email: p.email,
          display_name: p.display_name
            || [p.first_name, p.last_name].filter(Boolean).join(" ")
            || p.email,
          avatar_url: p.avatar_url || null,
        }))
        .sort((a: any, b: any) => (a.display_name || "").localeCompare(b.display_name || ""));
      return new Response(JSON.stringify({ teammates }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "list_events") {
      const targetId = body.target_user_id;
      if (!targetId) {
        return new Response(JSON.stringify({ error: "target_user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!body.time_min || !body.time_max) {
        return new Response(JSON.stringify({ error: "time_min and time_max required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Domain check against target profile.
      const { data: target } = await supabase
        .from("profiles").select("user_id, email, display_name").eq("user_id", targetId).maybeSingle();
      if (!target || domainOf(target.email) !== callerDomain) {
        return new Response(JSON.stringify({ error: "Not authorized for this teammate" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow } = await supabase
        .from("gmail_tokens").select("grant_id").eq("user_id", targetId).maybeSingle();
      const grantId = tokenRow?.grant_id;
      if (!grantId) {
        return new Response(JSON.stringify({ events: [], not_connected: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const startUnix = Math.floor(new Date(body.time_min).getTime() / 1000);
      const endUnix = Math.floor(new Date(body.time_max).getTime() / 1000);
      const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
      url.searchParams.set("calendar_id", "primary");
      url.searchParams.set("start", String(startUnix));
      url.searchParams.set("end", String(endUnix));
      url.searchParams.set("limit", "200");

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("[teammate-calendar-events] nylas err", resp.status, txt.slice(0, 200));
        if (resp.status === 429) {
          return new Response(JSON.stringify({ events: [], rate_limited: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: `Upstream ${resp.status}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await resp.json();
      const raw = (data?.data || []) as any[];
      const events = raw
        .filter((e: any) => e.status !== "cancelled" && e.busy !== false)
        .map((e: any) => {
          const w = e.when || {};
          const isAllDay = !w.start_time && !!w.start_date;
          const start = w.start_time
            ? new Date(w.start_time * 1000).toISOString()
            : w.start_date || "";
          const end = w.end_time
            ? new Date(w.end_time * 1000).toISOString()
            : w.end_date || "";
          return {
            id: e.id,
            calendar_id: "primary",
            summary: e.title || "Busy",
            title: e.title || "Busy",
            description: null,
            location: e.location || null,
            start,
            end,
            all_day: isAllDay,
            status: e.status || "confirmed",
            updated: null,
            created: null,
            html_link: e.html_link || null,
            htmlLink: e.html_link || null,
            hangout_link: e.conferencing?.details?.url || null,
            hangoutLink: e.conferencing?.details?.url || null,
            conference_data: e.conferencing || null,
            attendees: null,
            organizer: e.organizer_email ? { email: e.organizer_email } : null,
            color: null,
            color_id: null,
            is_teammate_event: true,
          };
        });

      return new Response(JSON.stringify({
        events,
        teammate: { user_id: target.user_id, email: target.email, display_name: target.display_name },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[teammate-calendar-events] error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});