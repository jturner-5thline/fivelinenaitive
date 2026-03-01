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

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

// Hardcoded redirect URI to exactly match Intuit Developer Console registration
const REDIRECT_URI = "https://tgkksvazruzbghssnxde.supabase.co/functions/v1/quickbooks-auth?action=callback";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    console.log(`[QuickBooks Auth] Action: ${action}`);

    // Helper to get user from auth header
    async function getUserId(): Promise<string | null> {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return null;
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return null;
      return user.id;
    }

    // ── CONNECT: Generate OAuth URL and redirect ──
    if (action === "connect" || action === "authorize") {
      const userId = await getUserId();
      if (!userId) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Generate random state and store it in DB
      const state = crypto.randomUUID();
      const { error: stateError } = await supabase
        .from("quickbooks_oauth_states")
        .insert({ user_id: userId, state });

      if (stateError) {
        console.error("[QuickBooks Auth] Failed to store state:", stateError);
        return jsonResponse({ error: "Failed to initiate OAuth" }, 500);
      }

      // Clean up expired states
      await supabase
        .from("quickbooks_oauth_states")
        .delete()
        .lt("expires_at", new Date().toISOString());

      const scope = "com.intuit.quickbooks.accounting";
      const authUrl = `${QB_AUTH_URL}?client_id=${QUICKBOOKS_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(state)}`;

      console.log(`[QuickBooks Auth] Generated auth URL for user ${userId}`);
      console.log(`[QuickBooks Auth] redirect_uri used: ${REDIRECT_URI}`);
      console.log(`[QuickBooks Auth] Full auth URL: ${authUrl}`);

      return jsonResponse({ authUrl });
    }

    // ── CALLBACK: Handle OAuth redirect from Intuit ──
    if (action === "callback") {
      try {
        const code = url.searchParams.get("code");
        const realmId = url.searchParams.get("realmId");
        const state = url.searchParams.get("state");

        if (!code || !realmId || !state) {
          console.error("[QuickBooks Auth] Missing callback params:", { code: !!code, realmId: !!realmId, state: !!state });
          return redirectToApp("error=missing_params");
        }

        // Validate state against DB
        const { data: stateRecord, error: stateError } = await supabase
          .from("quickbooks_oauth_states")
          .select("user_id, expires_at")
          .eq("state", state)
          .maybeSingle();

        if (stateError || !stateRecord) {
          console.error("[QuickBooks Auth] Invalid state:", state, stateError);
          return redirectToApp("error=invalid_state");
        }

        // Check expiry
        if (new Date(stateRecord.expires_at) < new Date()) {
          console.error("[QuickBooks Auth] State expired");
          await supabase.from("quickbooks_oauth_states").delete().eq("state", state);
          return redirectToApp("error=state_expired");
        }

        const userId = stateRecord.user_id;

        // Delete the used state
        await supabase.from("quickbooks_oauth_states").delete().eq("state", state);

        console.log("[QuickBooks Auth] Exchanging code for tokens...");
        console.log(`[QuickBooks Auth] Token exchange redirect_uri: ${REDIRECT_URI}`);
        const tokenResponse = await fetch(QB_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("[QuickBooks Auth] Token exchange failed:", errorText);
          return redirectToApp("error=token_exchange_failed");
        }

        const tokens = await tokenResponse.json();
        console.log("[QuickBooks Auth] Token exchange successful");

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        // Store tokens in quickbooks_tokens table
        const { error: upsertError } = await supabase
          .from("quickbooks_tokens")
          .upsert({
            user_id: userId,
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
          return redirectToApp("error=storage_failed");
        }

        console.log(`[QuickBooks Auth] Tokens stored for user ${userId}, realm ${realmId}`);

        // Redirect back to app on success
        return redirectToApp("qb=success");
      } catch (callbackError) {
        console.error("[QuickBooks Auth] Callback error:", callbackError);
        const msg = callbackError instanceof Error ? callbackError.message : "callback_unknown_error";
        return redirectToApp(`error=${encodeURIComponent(msg)}`);
      }
    }

    // ── STATUS: Check connection status ──
    if (action === "status") {
      const userId = await getUserId();
      if (!userId) {
        return jsonResponse({ connected: false });
      }

      const { data: tokens } = await supabase
        .from("quickbooks_tokens")
        .select("realm_id, expires_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (!tokens) {
        return jsonResponse({ connected: false });
      }

      const isExpired = new Date(tokens.expires_at) < new Date();

      return jsonResponse({
        connected: true,
        realmId: tokens.realm_id,
        isExpired,
        lastSync: tokens.updated_at,
      });
    }

    // ── DISCONNECT: Remove connection ──
    if (action === "disconnect") {
      const userId = await getUserId();
      if (!userId) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      await supabase.from("quickbooks_tokens").delete().eq("user_id", userId);
      await supabase.from("quickbooks_customers").delete().eq("user_id", userId);
      await supabase.from("quickbooks_invoices").delete().eq("user_id", userId);
      await supabase.from("quickbooks_payments").delete().eq("user_id", userId);
      await supabase.from("quickbooks_sync_history").delete().eq("user_id", userId);

      console.log(`[QuickBooks Auth] Disconnected for user ${userId}`);

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("[QuickBooks Auth] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: errorMessage }, 500);
  }
});

function redirectToApp(params: string) {
  const appUrl = Deno.env.get("APP_URL") || "https://preview--fivelinenaitive.lovable.app";
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      "Location": `${appUrl}/integrations?${params}`,
    },
  });
}
