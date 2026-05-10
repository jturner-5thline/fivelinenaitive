import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Contacts.Read",
].join(" ");

// Production redirect URI registered in Azure (no query string).
// The callback page distinguishes Microsoft via the `state` parameter (prefix `ms_`).
const REDIRECT_URI = "https://naitive.co/integrations";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = body.action as string | undefined;

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    if (action === "check_status") {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: "Microsoft credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    if (action === "get_auth_url") {
      const state = "ms_" + crypto.randomUUID();
      const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", MICROSOFT_SCOPES);
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("prompt", "select_account");
      return new Response(JSON.stringify({ url: authUrl.toString(), state }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "exchange_code") {
      const { code, user_id } = body as { code?: string; user_id?: string };
      if (!code || !user_id) {
        return new Response(JSON.stringify({ error: "code and user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenResp = await fetch(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            code,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
            scope: MICROSOFT_SCOPES,
          }),
        },
      );
      const tokens = await tokenResp.json();
      if (!tokenResp.ok) {
        console.error("MS token exchange failed:", tokens);
        return new Response(
          JSON.stringify({ error: "Token exchange failed", details: tokens }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const profileResp = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileResp.json();

      const { error: upsertError } = await supabase
        .from("microsoft_tokens")
        .upsert(
          {
            user_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            email: profile.mail || profile.userPrincipalName,
            display_name: profile.displayName,
            connected_at: new Date().toISOString(),
            scopes: tokens.scope ?? MICROSOFT_SCOPES,
            status: "connected",
            sync_email_enabled: true,
            sync_calendar_enabled: true,
          },
          { onConflict: "user_id" },
        );

      if (upsertError) {
        console.error("Token upsert failed:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to store tokens" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          email: profile.mail || profile.userPrincipalName,
          display_name: profile.displayName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "check_status") {
      const { user_id } = body as { user_id?: string };
      if (!user_id) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await supabase
        .from("microsoft_tokens")
        .select(
          "email, display_name, connected_at, expires_at, status, sync_email_enabled, sync_calendar_enabled, last_email_sync_at, last_calendar_sync_at",
        )
        .eq("user_id", user_id)
        .maybeSingle();

      if (!data || data.status === "disconnected") {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          connected: true,
          email: data.email,
          display_name: data.display_name,
          connected_at: data.connected_at,
          is_expired: new Date(data.expires_at) < new Date(),
          sync_email_enabled: data.sync_email_enabled,
          sync_calendar_enabled: data.sync_calendar_enabled,
          last_email_sync_at: data.last_email_sync_at,
          last_calendar_sync_at: data.last_calendar_sync_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "set_sync_toggle") {
      const { user_id, sync_email_enabled, sync_calendar_enabled } = body as {
        user_id?: string;
        sync_email_enabled?: boolean;
        sync_calendar_enabled?: boolean;
      };
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const update: Record<string, unknown> = {};
      if (typeof sync_email_enabled === "boolean") update.sync_email_enabled = sync_email_enabled;
      if (typeof sync_calendar_enabled === "boolean") update.sync_calendar_enabled = sync_calendar_enabled;
      await supabase.from("microsoft_tokens").update(update).eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const { user_id } = body as { user_id?: string };
      if (user_id) {
        await supabase.from("microsoft_tokens").delete().eq("user_id", user_id);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("microsoft-auth error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});