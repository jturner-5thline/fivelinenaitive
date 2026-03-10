import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Validate JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { flex_profile_id, lender_name } = body;

    if (!flex_profile_id) {
      return new Response(
        JSON.stringify({ error: "flex_profile_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `Notifying FLEx about lender approval: profile=${flex_profile_id}, name=${lender_name}`
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

    // Call FLEx's receive-external-sync to update the profile's lender_status
    const syncPayload = {
      type: "UPDATE",
      table: "profiles",
      source_project_id: "naitive",
      record: {
        id: flex_profile_id,
        lender_status: "approved",
        lender_reviewed_at: new Date().toISOString(),
        lender_reviewed_by: user.id,
      },
    };

    const flexResponse = await fetch(`${FLEX_API_URL}/receive-external-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify(syncPayload),
    });

    const responseText = await flexResponse.text();
    console.log(
      `FLEx lender approval response (${flexResponse.status}):`,
      responseText
    );

    // Log result
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabaseAdmin.from("integration_logs").insert({
      integration_type: "flex_lender_approval",
      event_type: flexResponse.ok ? "approval_synced" : "approval_sync_failed",
      status: flexResponse.ok ? "success" : "error",
      error_message: flexResponse.ok
        ? null
        : `FLEx returned ${flexResponse.status}: ${responseText}`,
      payload: {
        flex_profile_id,
        lender_name,
        approved_by: user.id,
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
