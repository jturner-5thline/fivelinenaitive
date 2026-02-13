import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNIPILE_API_KEY = Deno.env.get("UNIPILE_API_KEY");
const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// This edge function handles the Unipile notify_url callback
// When a user completes the hosted auth flow, Unipile sends a POST here
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Unipile callback received:", JSON.stringify(body));

    // Unipile sends: { account_id, name (our user_id), status, provider }
    const accountId = body.account_id;
    const userId = body.name; // We passed user.id as "name" in the hosted auth request
    const status = body.status;

    if (!accountId || !userId) {
      console.error("Missing account_id or user_id in callback");
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "CREATION_SUCCESS") {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const unipileBaseUrl = UNIPILE_DSN?.startsWith("http") ? UNIPILE_DSN : `https://${UNIPILE_DSN}`;

      // Fetch account details to get email address
      let emailAddress = null;
      if (UNIPILE_API_KEY && UNIPILE_DSN) {
        try {
          const accountResponse = await fetch(`${unipileBaseUrl}/api/v1/accounts/${accountId}`, {
            headers: {
              "X-API-KEY": UNIPILE_API_KEY,
              "Accept": "application/json",
            },
          });
          if (accountResponse.ok) {
            const accountData = await accountResponse.json();
            emailAddress = accountData.sources?.[0]?.email || accountData.identifier || null;
          }
        } catch (e) {
          console.error("Failed to fetch account details:", e);
        }
      }

      // Store account info
      const { error: upsertError } = await supabase
        .from("gmail_tokens")
        .upsert({
          user_id: userId,
          account_id: accountId,
          grant_id: accountId,
          email_address: emailAddress,
          access_token: null,
          refresh_token: null,
          expires_at: null,
          token_type: "unipile",
          scope: "gmail",
        }, { onConflict: "user_id" });

      if (upsertError) {
        console.error("Callback storage error:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to store account" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Unipile callback: Gmail connected for user ${userId}, account ${accountId}`);
    } else {
      console.log(`Unipile callback: status=${status} for user ${userId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Unipile callback error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
