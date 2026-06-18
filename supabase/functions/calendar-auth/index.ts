import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_CLIENT_ID = Deno.env.get("NYLAS_CLIENT_ID");
const NYLAS_API_URI = "https://api.us.nylas.com";
// SECURITY/CORRECTNESS: redirect_uri MUST exactly match the URI registered
// in the Nylas application allowlist. We hardcode it server-side so that
// origin variance (naitive.co, www.naitive.co, preview/lovable.app, localhost)
// can never cause `invalid_query_params` from Nylas. Mirrors gmail-auth.
const NYLAS_REDIRECT_URI = "https://naitive.co/integrations?calendar_callback=true";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AuthRequest {
  action: "get_auth_url" | "exchange_code" | "disconnect";
  code?: string;
  redirect_uri?: string;
}

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

    const body: AuthRequest = await req.json();
    console.log("Calendar auth action:", body.action, "for user:", user.id);

    if (!NYLAS_API_KEY || !NYLAS_CLIENT_ID) {
      return new Response(JSON.stringify({ error: "Nylas integration not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (body.action) {
      case "get_auth_url": {
        // Use Nylas Hosted OAuth — same as Gmail auth but for calendar access
        const params = new URLSearchParams({
          client_id: NYLAS_CLIENT_ID,
          redirect_uri: NYLAS_REDIRECT_URI,
          response_type: "code",
          provider: "google",
          state: user.id,
        });

        const authUrl = `${NYLAS_API_URI}/v3/connect/auth?${params.toString()}`;

        return new Response(JSON.stringify({ auth_url: authUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "exchange_code": {
        if (!body.code) {
          return new Response(JSON.stringify({ error: "code required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Exchange authorization code for Nylas grant
        const tokenResponse = await fetch(`${NYLAS_API_URI}/v3/connect/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: NYLAS_CLIENT_ID,
            client_secret: NYLAS_API_KEY,
            code: body.code,
            redirect_uri: NYLAS_REDIRECT_URI,
            grant_type: "authorization_code",
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          console.error("Nylas token exchange error:", tokenData);
          return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.message || "Failed to exchange code" }), {
            status: tokenResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const grantId = tokenData.grant_id;
        const email = tokenData.email;

        if (!grantId) {
          return new Response(JSON.stringify({ error: "No grant_id returned from Nylas" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Store grant in gmail_tokens (shared table for Nylas grants)
        const { error: upsertError } = await supabase
          .from("gmail_tokens")
          .upsert({
            user_id: user.id,
            account_id: grantId,
            grant_id: grantId,
            email_address: email || null,
            access_token: null,
            refresh_token: null,
            expires_at: null,
            token_type: "nylas",
            scope: "gmail",
          }, { onConflict: "user_id" });

        if (upsertError) {
          console.error("Grant storage error:", upsertError);
          return new Response(JSON.stringify({ error: "Failed to store grant" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Nylas Calendar connected for user: ${user.id}, grant: ${grantId}`);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        // Get grant_id before deleting
        const { data: tokenData } = await supabase
          .from("gmail_tokens")
          .select("grant_id")
          .eq("user_id", user.id)
          .single();

        // Revoke the Nylas grant
        if (tokenData?.grant_id) {
          try {
            await fetch(`${NYLAS_API_URI}/v3/grants/${tokenData.grant_id}`, {
              method: "DELETE",
              headers: {
                "Authorization": `Bearer ${NYLAS_API_KEY}`,
                "Accept": "application/json",
              },
            });
          } catch (e) {
            console.error("Failed to revoke Nylas grant:", e);
          }
        }

        const { error: deleteError } = await supabase
          .from("gmail_tokens")
          .delete()
          .eq("user_id", user.id);

        if (deleteError) {
          console.error("Disconnect error:", deleteError);
          return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    console.error("Calendar auth error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
