import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DOCUSIGN_CLIENT_ID = Deno.env.get("DOCUSIGN_CLIENT_ID");
    const DOCUSIGN_CLIENT_SECRET = Deno.env.get("DOCUSIGN_CLIENT_SECRET");
    const DOCUSIGN_REDIRECT_URI = Deno.env.get("DOCUSIGN_REDIRECT_URI");

    if (!DOCUSIGN_CLIENT_ID || !DOCUSIGN_CLIENT_SECRET || !DOCUSIGN_REDIRECT_URI) {
      return new Response(
        JSON.stringify({ error: "DocuSign credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // ─── GET AUTH URL ─────────────────────────────────────────
    if (action === "get_auth_url") {
      // DocuSign OAuth URL (production)
      const authUrl = new URL("https://account.docusign.com/oauth/auth");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "signature impersonation");
      authUrl.searchParams.set("client_id", DOCUSIGN_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", DOCUSIGN_REDIRECT_URI);
      authUrl.searchParams.set("state", user.id);

      return new Response(
        JSON.stringify({ url: authUrl.toString() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── EXCHANGE CODE ────────────────────────────────────────
    if (action === "exchange_code") {
      const { code, company_id } = body;
      if (!code || !company_id) {
        return new Response(
          JSON.stringify({ error: "code and company_id are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Exchange authorization code for tokens
      const basicAuth = btoa(`${DOCUSIGN_CLIENT_ID}:${DOCUSIGN_CLIENT_SECRET}`);
      const tokenResponse = await fetch("https://account.docusign.com/oauth/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: DOCUSIGN_REDIRECT_URI,
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        console.error("DocuSign token exchange failed:", tokenData);
        return new Response(
          JSON.stringify({ error: "Failed to exchange code", details: tokenData }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user info to find account_id and base_uri
      const userInfoResponse = await fetch("https://account.docusign.com/oauth/userinfo", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      const defaultAccount = userInfo.accounts?.find((a: any) => a.is_default) || userInfo.accounts?.[0];
      const accountId = defaultAccount?.account_id || null;
      const baseUri = defaultAccount?.base_uri || null;
      const accountName = defaultAccount?.account_name || null;

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

      // Upsert tokens (one per company)
      const { error: upsertError } = await supabase
        .from("docusign_tokens")
        .upsert(
          {
            company_id,
            user_id: user.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: expiresAt,
            account_id: accountId,
            base_uri: baseUri,
            account_name: accountName,
          },
          { onConflict: "company_id" }
        );

      if (upsertError) {
        console.error("Failed to store DocuSign tokens:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to store tokens" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          account_name: accountName,
          account_id: accountId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CHECK STATUS ─────────────────────────────────────────
    if (action === "status") {
      const { company_id } = body;
      if (!company_id) {
        return new Response(
          JSON.stringify({ error: "company_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: tokenRecord, error: fetchError } = await supabase
        .from("docusign_tokens")
        .select("account_name, account_id, base_uri, expires_at, updated_at")
        .eq("company_id", company_id)
        .single();

      if (fetchError || !tokenRecord) {
        return new Response(
          JSON.stringify({ connected: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isExpired = new Date(tokenRecord.expires_at) < new Date();

      return new Response(
        JSON.stringify({
          connected: true,
          is_expired: isExpired,
          account_name: tokenRecord.account_name,
          account_id: tokenRecord.account_id,
          last_synced: tokenRecord.updated_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DISCONNECT ───────────────────────────────────────────
    if (action === "disconnect") {
      const { company_id } = body;
      if (!company_id) {
        return new Response(
          JSON.stringify({ error: "company_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await supabase
        .from("docusign_tokens")
        .delete()
        .eq("company_id", company_id);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to disconnect" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── REFRESH TOKEN ────────────────────────────────────────
    if (action === "refresh") {
      const { company_id } = body;
      if (!company_id) {
        return new Response(
          JSON.stringify({ error: "company_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: tokenRecord, error: fetchError } = await supabase
        .from("docusign_tokens")
        .select("*")
        .eq("company_id", company_id)
        .single();

      if (fetchError || !tokenRecord) {
        return new Response(
          JSON.stringify({ error: "No DocuSign connection found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const basicAuth = btoa(`${DOCUSIGN_CLIENT_ID}:${DOCUSIGN_CLIENT_SECRET}`);
      const refreshResponse = await fetch("https://account.docusign.com/oauth/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenRecord.refresh_token,
        }),
      });

      const refreshData = await refreshResponse.json();
      if (!refreshResponse.ok) {
        console.error("DocuSign token refresh failed:", refreshData);
        return new Response(
          JSON.stringify({ error: "Token refresh failed", needs_reauth: true }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const expiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

      await supabase
        .from("docusign_tokens")
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: expiresAt,
        })
        .eq("company_id", company_id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("DocuSign auth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
