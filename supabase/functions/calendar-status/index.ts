import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon client with user's auth header for token validation
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Use service role client for DB queries
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check gmail_tokens for a Nylas grant (shared connection for email + calendar)
    const { data: tokenRecord, error: fetchError } = await supabase
      .from("gmail_tokens")
      .select("id, grant_id, email_address, created_at, is_demo_seed")
      .eq("user_id", userId)
      .single();

    if (fetchError || !tokenRecord || !tokenRecord.grant_id) {
      // No Nylas grant — the user may still be connected through Microsoft /
      // Outlook, whose events are synced into `calendar_events`. Without this
      // check the calendar popup shows "Calendar isn't connected" even though
      // Integrations correctly reports Outlook as connected.
      const { data: msToken } = await supabase
        .from("microsoft_tokens")
        .select("email_address, status, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (msToken && msToken.status !== "disconnected") {
        return new Response(JSON.stringify({
          connected: true,
          is_expired: false,
          scope: "calendar",
          provider: "microsoft",
          connected_at: msToken.created_at,
          email: msToken.email_address,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ connected: false, message: "Calendar not connected. Connect Google or Microsoft in Integrations." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Demo-seed tenant: synthetic grant, never call Nylas.
    if (tokenRecord.is_demo_seed || tokenRecord.grant_id === "demo-seed") {
      return new Response(JSON.stringify({
        connected: true,
        is_expired: false,
        scope: "calendar",
        source: "demo-seed",
        connected_at: tokenRecord.created_at,
        email: tokenRecord.email_address,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify grant is still valid with Nylas
    let isExpired = false;
    if (NYLAS_API_KEY) {
      try {
        const grantResponse = await fetch(`${NYLAS_API_URI}/v3/grants/${tokenRecord.grant_id}`, {
          headers: {
            "Authorization": `Bearer ${NYLAS_API_KEY}`,
            "Accept": "application/json",
          },
        });
        if (!grantResponse.ok) {
          if (grantResponse.status === 404 || grantResponse.status === 401) {
            isExpired = true;
          }
        }
      } catch (e) {
        console.error("Failed to verify Nylas grant for calendar:", e);
      }
    }

    return new Response(JSON.stringify({
      connected: !isExpired,
      is_expired: isExpired,
      scope: "calendar",
      provider: "nylas",
      connected_at: tokenRecord.created_at,
      email: tokenRecord.email_address,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Calendar status error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
