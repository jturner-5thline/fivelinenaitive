import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check gmail_tokens for a Nylas grant (shared connection for email + calendar)
    const { data: tokenRecord, error: fetchError } = await supabase
      .from("gmail_tokens")
      .select("id, grant_id, email_address, created_at")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !tokenRecord || !tokenRecord.grant_id) {
      return new Response(JSON.stringify({ connected: false, message: "Calendar not connected. Connect your Google account first." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
