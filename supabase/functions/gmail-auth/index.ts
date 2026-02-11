import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_CLIENT_ID = Deno.env.get("NYLAS_CLIENT_ID");
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NYLAS_API_URL = "https://api.us.nylas.com";

interface AuthRequest {
  action: "get_auth_url" | "exchange_code" | "disconnect";
  code?: string;
  redirect_uri?: string;
  email_address?: string;
}

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

    const { action, code, redirect_uri, email_address }: AuthRequest = await req.json();
    console.log(`Nylas auth action: ${action} for user: ${user.id}`);

    if (!NYLAS_CLIENT_ID || !NYLAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Nylas integration not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "get_auth_url": {
        if (!redirect_uri) {
          return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const authUrl = new URL(`${NYLAS_API_URL}/v3/connect/auth`);
        authUrl.searchParams.set("client_id", NYLAS_CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", redirect_uri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("access_type", "offline");
        if (email_address) {
          authUrl.searchParams.set("login_hint", email_address);
        }
        authUrl.searchParams.set("scope", [
          "openid",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.send",
        ].join(" "));
        authUrl.searchParams.set("state", user.id);

        return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "exchange_code": {
        if (!code || !redirect_uri) {
          return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Exchange code for grant via Nylas
        const tokenResponse = await fetch(`${NYLAS_API_URL}/v3/connect/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: NYLAS_CLIENT_ID,
            client_secret: NYLAS_API_KEY,
            code,
            redirect_uri,
            grant_type: "authorization_code",
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || tokenData.error) {
          console.error("Nylas token exchange error:", tokenData);
          return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error || "Token exchange failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const grantId = tokenData.grant_id;
        const emailAddr = tokenData.email;

        // Store grant info in database
        const { error: upsertError } = await supabase
          .from("gmail_tokens")
          .upsert({
            user_id: user.id,
            grant_id: grantId,
            email_address: emailAddr,
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

        console.log(`Nylas Gmail connected for user: ${user.id}, grant: ${grantId}`);
        return new Response(JSON.stringify({ success: true, message: "Gmail connected via Nylas" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        const { error: deleteError } = await supabase
          .from("gmail_tokens")
          .delete()
          .eq("user_id", user.id);

        if (deleteError) {
          console.error("Grant deletion error:", deleteError);
          return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Nylas Gmail disconnected for user: ${user.id}`);
        return new Response(JSON.stringify({ success: true, message: "Gmail disconnected" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: any) {
    console.error("Nylas auth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
