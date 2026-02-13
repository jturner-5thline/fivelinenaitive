import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNIPILE_API_KEY = Deno.env.get("UNIPILE_API_KEY");
const RAW_UNIPILE_DSN = Deno.env.get("UNIPILE_DSN");

// Extract the actual base URL from UNIPILE_DSN, even if it contains a full curl command
function extractBaseUrl(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  // If it contains a curl command, extract the URL after --url
  const urlMatch = dsn.match(/--url\s+(https?:\/\/[^\s']+)/);
  if (urlMatch) return urlMatch[1].replace(/\/api\/.*$/, '');
  // If it starts with https:// directly, use it
  if (dsn.match(/^https?:\/\//)) return dsn.split(/\s/)[0].replace(/\/api\/.*$/, '').replace(/\/+$/, '');
  return `https://${dsn.replace(/\/+$/, '')}`;
}

const UNIPILE_DSN = extractBaseUrl(RAW_UNIPILE_DSN);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AuthRequest {
  action: "get_auth_url" | "exchange_code" | "disconnect";
  account_id?: string;
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

    const { action, account_id, redirect_uri }: AuthRequest = await req.json();
    console.log(`Unipile auth action: ${action} for user: ${user.id}`);

    if (!UNIPILE_API_KEY || !UNIPILE_DSN) {
      return new Response(JSON.stringify({ error: "Unipile integration not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unipileBaseUrl = UNIPILE_DSN!;
    console.log("Using Unipile base URL:", unipileBaseUrl);

    switch (action) {
      case "get_auth_url": {
        if (!redirect_uri) {
          return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate Unipile Hosted Auth Link
        const response = await fetch(`${unipileBaseUrl}/api/v1/hosted/accounts/link`, {
          method: "POST",
          headers: {
            "X-API-KEY": UNIPILE_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            type: "create",
            providers: ["GOOGLE"],
            api_url: unipileBaseUrl,
            expiresOn: new Date(Date.now() + 3600000).toISOString(), // 1 hour
            success_redirect_url: redirect_uri,
            failure_redirect_url: redirect_uri,
            notify_url: `${SUPABASE_URL}/functions/v1/gmail-auth-callback`,
            name: user.id, // Use user ID to identify in callback
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error("Unipile hosted auth error:", data);
          return new Response(JSON.stringify({ error: data.message || "Failed to generate auth link" }), {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ auth_url: data.url }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "exchange_code": {
        // For Unipile, the account_id comes from the callback/notify_url
        // or the user provides it after the hosted auth flow completes
        if (!account_id) {
          return new Response(JSON.stringify({ error: "account_id is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify the account exists in Unipile
        const accountResponse = await fetch(`${unipileBaseUrl}/api/v1/accounts/${account_id}`, {
          headers: {
            "X-API-KEY": UNIPILE_API_KEY,
            "Accept": "application/json",
          },
        });

        const accountData = await accountResponse.json();

        if (!accountResponse.ok) {
          console.error("Unipile account verify error:", accountData);
          return new Response(JSON.stringify({ error: "Failed to verify account" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Store account info in database
        const { error: upsertError } = await supabase
          .from("gmail_tokens")
          .upsert({
            user_id: user.id,
            account_id: account_id,
            grant_id: account_id, // Keep grant_id populated for backward compat
            email_address: accountData.sources?.[0]?.email || accountData.identifier || null,
            access_token: null,
            refresh_token: null,
            expires_at: null,
            token_type: "unipile",
            scope: "gmail",
          }, { onConflict: "user_id" });

        if (upsertError) {
          console.error("Account storage error:", upsertError);
          return new Response(JSON.stringify({ error: "Failed to store account" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Unipile Gmail connected for user: ${user.id}, account: ${account_id}`);
        return new Response(JSON.stringify({ success: true, message: "Gmail connected via Unipile" }), {
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
          console.error("Account deletion error:", deleteError);
          return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Unipile Gmail disconnected for user: ${user.id}`);
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
    console.error("Unipile auth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
