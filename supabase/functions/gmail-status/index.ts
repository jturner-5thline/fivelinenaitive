import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
      return new Response(JSON.stringify({ error: "Unauthorized", connected: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon client with user's auth header for token validation
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token", connected: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Use service role client for DB queries
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if user has a Nylas grant
    const { data: tokenData, error: tokenError } = await supabase
      .from("gmail_tokens")
      .select("id, account_id, grant_id, email_address, scope, created_at, is_demo_seed")
      .eq("user_id", userId)
      .single();

    const grantId = tokenData?.grant_id || tokenData?.account_id;

    if (tokenError || !tokenData || !grantId) {
      return new Response(JSON.stringify({
        connected: false,
        message: "Gmail not connected",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Demo-seed sentinel — short-circuit, skip Nylas verification entirely.
    if (tokenData.is_demo_seed || grantId === "demo-seed") {
      return new Response(JSON.stringify({
        connected: true,
        is_expired: false,
        provider: "gmail",
        source: "demo-seed",
        scope: tokenData.scope,
        connected_at: tokenData.created_at,
        email_address: tokenData.email_address,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optionally verify grant is still valid with Nylas
    let isExpired = false;
    if (NYLAS_API_KEY) {
      // Abort the grant check if Nylas is slow — without this a hung request
      // holds the isolate open until the platform kills it (HTTP 502).
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8_000);
      try {
        const grantResponse = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}`, {
          headers: {
            "Authorization": `Bearer ${NYLAS_API_KEY}`,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });
        if (!grantResponse.ok) {
          const errData = await grantResponse.json().catch(() => ({}));
          console.error("Nylas grant check failed:", errData);
          if (grantResponse.status === 404 || grantResponse.status === 401) {
            isExpired = true;
          }
        } else {
          await grantResponse.text(); // consume body
        }
      } catch (e) {
        console.error("Failed to verify Nylas grant:", e);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return new Response(JSON.stringify({
      connected: true,
      is_expired: isExpired,
      scope: tokenData.scope,
      connected_at: tokenData.created_at,
      email_address: tokenData.email_address,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Gmail status error:", error);
    return new Response(JSON.stringify({ error: error.message, connected: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
