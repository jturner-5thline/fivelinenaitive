import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUICKBOOKS_CLIENT_ID = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
const QUICKBOOKS_CLIENT_SECRET = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// QuickBooks OAuth URLs
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    console.log(`[QuickBooks Auth] Action: ${action}`);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    if (action === "authorize") {
      // Generate authorization URL
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/quickbooks-auth?action=callback`;
      const scope = "com.intuit.quickbooks.accounting";
      const state = btoa(JSON.stringify({ userId }));

      const authUrl = `${QB_AUTH_URL}?client_id=${QUICKBOOKS_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

      console.log(`[QuickBooks Auth] Generated auth URL for user ${userId}`);

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "callback") {
      // Handle OAuth callback
      const code = url.searchParams.get("code");
      const realmId = url.searchParams.get("realmId");
      const state = url.searchParams.get("state");

      if (!code || !realmId || !state) {
        console.error("[QuickBooks Auth] Missing callback params");
        return new Response("Missing required parameters", { status: 400 });
      }

      let stateData;
      try {
        stateData = JSON.parse(atob(state));
      } catch (e) {
        console.error("[QuickBooks Auth] Invalid state");
        return new Response("Invalid state", { status: 400 });
      }

      const { userId: stateUserId } = stateData;
      const redirectUri = `${SUPABASE_URL}/functions/v1/quickbooks-auth?action=callback`;

      // Exchange code for tokens
      const tokenResponse = await fetch(QB_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error("[QuickBooks Auth] Token exchange failed:", error);
        return new Response(`Token exchange failed: ${error}`, { status: 500 });
      }

      const tokens = await tokenResponse.json();
      console.log("[QuickBooks Auth] Token exchange successful");

      // Calculate expiry time (tokens.expires_in is in seconds)
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Store tokens in database
      const { error: upsertError } = await supabase
        .from("quickbooks_tokens")
        .upsert({
          user_id: stateUserId,
          realm_id: realmId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          token_type: tokens.token_type,
          scope: tokens.scope || "com.intuit.quickbooks.accounting",
        }, {
          onConflict: "user_id,realm_id",
        });

      if (upsertError) {
        console.error("[QuickBooks Auth] Failed to store tokens:", upsertError);
        return new Response("Failed to store tokens", { status: 500 });
      }

      console.log(`[QuickBooks Auth] Tokens stored for user ${stateUserId}, realm ${realmId}`);

      // Redirect back to the app
      const appUrl = Deno.env.get("APP_URL") || "https://id-preview--3072785e-3519-420c-ad58-facf63660c85.lovable.app";
      return Response.redirect(`${appUrl}/integrations?quickbooks=connected`, 302);
    }

    if (action === "status") {
      // Check connection status
      if (!userId) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokens } = await supabase
        .from("quickbooks_tokens")
        .select("realm_id, expires_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (!tokens) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isExpired = new Date(tokens.expires_at) < new Date();

      return new Response(JSON.stringify({
        connected: true,
        realmId: tokens.realm_id,
        isExpired,
        lastSync: tokens.updated_at,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete tokens and synced data
      await supabase.from("quickbooks_tokens").delete().eq("user_id", userId);
      await supabase.from("quickbooks_customers").delete().eq("user_id", userId);
      await supabase.from("quickbooks_invoices").delete().eq("user_id", userId);
      await supabase.from("quickbooks_payments").delete().eq("user_id", userId);
      await supabase.from("quickbooks_sync_history").delete().eq("user_id", userId);

      console.log(`[QuickBooks Auth] Disconnected for user ${userId}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[QuickBooks Auth] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
