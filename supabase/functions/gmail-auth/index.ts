import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AuthRequest {
  action: "get_auth_url" | "exchange_code" | "refresh_token" | "disconnect";
  code?: string;
  redirect_uri?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, code, redirect_uri }: AuthRequest = await req.json();
    console.log(`Gmail auth action: ${action} for user: ${user.id}`);

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Gmail integration not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "get_auth_url": {
        const scopes = [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/userinfo.email",
        ];

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", redirect_uri || "");
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scopes.join(" "));
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
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

        // Exchange code for tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri,
            grant_type: "authorization_code",
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          console.error("Token exchange error:", tokenData);
          return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Calculate expiry time
        const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

        // Store tokens in database
        const { error: upsertError } = await supabase
          .from("gmail_tokens")
          .upsert({
            user_id: user.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_type: tokenData.token_type,
            expires_at: expiresAt.toISOString(),
            scope: tokenData.scope,
          }, { onConflict: "user_id" });

        if (upsertError) {
          console.error("Token storage error:", upsertError);
          return new Response(JSON.stringify({ error: "Failed to store tokens" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Gmail connected for user: ${user.id}`);
        return new Response(JSON.stringify({ success: true, message: "Gmail connected successfully" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "refresh_token": {
        // Get stored refresh token
        const { data: tokenData, error: tokenError } = await supabase
          .from("gmail_tokens")
          .select("refresh_token")
          .eq("user_id", user.id)
          .single();

        if (tokenError || !tokenData) {
          return new Response(JSON.stringify({ error: "No Gmail connection found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Refresh the token
        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: tokenData.refresh_token,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
          }),
        });

        const refreshData = await refreshResponse.json();

        if (refreshData.error) {
          console.error("Token refresh error:", refreshData);
          return new Response(JSON.stringify({ error: "Failed to refresh token" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const expiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));

        // Update stored token
        await supabase
          .from("gmail_tokens")
          .update({
            access_token: refreshData.access_token,
            expires_at: expiresAt.toISOString(),
          })
          .eq("user_id", user.id);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        // Delete tokens from database
        const { error: deleteError } = await supabase
          .from("gmail_tokens")
          .delete()
          .eq("user_id", user.id);

        if (deleteError) {
          console.error("Token deletion error:", deleteError);
          return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Gmail disconnected for user: ${user.id}`);
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
    console.error("Gmail auth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
