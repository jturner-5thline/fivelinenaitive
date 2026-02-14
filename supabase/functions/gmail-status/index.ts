import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has a Nylas grant
    const { data: tokenData, error: tokenError } = await supabase
      .from("gmail_tokens")
      .select("id, account_id, grant_id, email_address, scope, created_at")
      .eq("user_id", user.id)
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

    // Optionally verify grant is still valid with Nylas
    let isExpired = false;
    if (NYLAS_API_KEY) {
      try {
        const grantResponse = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}`, {
          headers: {
            "Authorization": `Bearer ${NYLAS_API_KEY}`,
            "Accept": "application/json",
          },
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
