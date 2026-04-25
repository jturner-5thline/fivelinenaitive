import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trigger-source, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    let callerUserId: string = "unknown";

    // Check if this is from a DB trigger (no auth needed since verify_jwt=false and it's internal)
    const triggerSource = req.headers.get("x-trigger-source");
    const authHeader = req.headers.get("authorization");

    if (triggerSource === "db_trigger") {
      // Called from database trigger via pg_net - trusted internal call
      callerUserId = "db_trigger";
      console.log("Request from DB trigger - trusted");
    } else if (authHeader) {
      // Called from client - validate JWT
      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error("Auth failed:", authError?.message);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = user.id;
    } else {
      console.error("No auth header and not a DB trigger call");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { flex_profile_id, lender_name, lender_email } = body;

    if (!lender_email) {
      console.error("Missing lender_email in request body");
      return new Response(
        JSON.stringify({ error: "lender_email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `Notifying FLEx about lender approval: email=${lender_email}, name=${lender_name}, profile_id=${flex_profile_id}, caller=${callerUserId}`
    );

    const NAITIVE_FLEX_SYNC_KEY = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
    const FLEX_API_URL_DEFAULT =
      "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1";
    let FLEX_API_URL = Deno.env.get("FLEX_API_URL");
    if (!FLEX_API_URL || !FLEX_API_URL.startsWith("http")) {
      FLEX_API_URL = FLEX_API_URL_DEFAULT;
    }

    if (!NAITIVE_FLEX_SYNC_KEY) {
      console.error("NAITIVE_FLEX_SYNC_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "FLEx sync key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syncPayload = {
      event: "lender_approved",
      source: "naitive",
      lender: {
        id: flex_profile_id,
        email: lender_email,
        name: lender_name,
      },
    };

    console.log(`Sending to FLEx: ${FLEX_API_URL}/naitive-lender-sync`, JSON.stringify(syncPayload));

    const flexResponse = await fetch(`${FLEX_API_URL}/naitive-lender-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify(syncPayload),
    });

    const responseText = await flexResponse.text();
    console.log(
      `FLEx naitive-lender-sync response (${flexResponse.status}):`,
      responseText
    );

    // Log result
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    await supabaseAdmin.from("integration_logs").insert({
      integration_type: "flex_lender_approval",
      event_type: flexResponse.ok ? "approval_synced" : "approval_sync_failed",
      status: flexResponse.ok ? "success" : "error",
      error_message: flexResponse.ok
        ? null
        : `FLEx returned ${flexResponse.status}: ${responseText}`,
      payload: {
        flex_profile_id,
        lender_email,
        lender_name,
        approved_by: callerUserId,
        trigger_source: body.trigger_source || "client",
      },
    });

    if (!flexResponse.ok) {
      console.error(`FLEx lender approval sync failed: ${flexResponse.status}`);
      return new Response(
        JSON.stringify({
          error: "Failed to sync approval to FLEx",
          details: responseText,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Lender "${lender_name}" approval synced to FLEx`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Error in notify-flex-lender-approved:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
