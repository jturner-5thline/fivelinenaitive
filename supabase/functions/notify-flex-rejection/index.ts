import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RejectPayload {
  request_id: string;
  rejection_notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NAITIVE_FLEX_SYNC_KEY = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
    const FLEX_API_URL = Deno.env.get("FLEX_API_URL") || "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1";

    if (!NAITIVE_FLEX_SYNC_KEY) {
      console.error("NAITIVE_FLEX_SYNC_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "FLEx sync key is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify JWT and get user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("Invalid user token:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RejectPayload = await req.json();
    const { request_id, rejection_notes } = body;

    if (!request_id) {
      return new Response(
        JSON.stringify({ error: "request_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing rejection notification for sync request: ${request_id}`);

    // Fetch the sync request
    const { data: syncRequest, error: fetchError } = await supabase
      .from("lender_sync_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (fetchError || !syncRequest) {
      console.error("Error fetching sync request:", fetchError);
      return new Response(
        JSON.stringify({ error: "Sync request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the revert data from the changes_diff (old values)
    const changesDiff = syncRequest.changes_diff as Record<string, { old: unknown; new: unknown }> | null;
    const revertData: Record<string, unknown> = {};
    
    if (changesDiff) {
      // Extract the old values from the diff to send back to Flex
      for (const [field, change] of Object.entries(changesDiff)) {
        revertData[field] = change.old;
      }
    }

    // Build the rejection notification payload
    const rejectionPayload = {
      event: "sync_rejected",
      source: "naitive",
      rejection: {
        flex_lender_id: syncRequest.source_lender_id,
        request_type: syncRequest.request_type,
        lender_name: syncRequest.existing_lender_name || (syncRequest.incoming_data as Record<string, unknown>)?.name,
        rejection_reason: rejection_notes || "Request rejected by Naitive admin",
        rejected_at: new Date().toISOString(),
        rejected_by: user.email || user.id,
        // Send the old data so Flex can revert
        revert_data: revertData,
        // Also include the incoming data that was rejected
        rejected_incoming_data: syncRequest.incoming_data,
      },
    };

    console.log(`Sending rejection notification to FLEx for lender: ${syncRequest.source_lender_id}`);
    console.log("Revert data:", JSON.stringify(revertData));

    // Send rejection notification to FLEx
    const flexResponse = await fetch(`${FLEX_API_URL}/receive-sync-rejection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify(rejectionPayload),
    });

    const responseText = await flexResponse.text();
    console.log(`FLEx rejection notification response (${flexResponse.status}):`, responseText);

    // We don't fail if Flex doesn't receive - just log it
    if (!flexResponse.ok) {
      console.warn(`FLEx rejection notification warning: ${flexResponse.status} - ${responseText}`);
    }

    let flexData;
    try {
      flexData = JSON.parse(responseText);
    } catch {
      flexData = { message: responseText };
    }

    console.log(`Successfully notified FLEx of rejection for lender: ${syncRequest.source_lender_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Rejection notification sent to FLEx",
        flex_lender_id: syncRequest.source_lender_id,
        revert_data: revertData,
        flexResponse: flexData
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in notify-flex-rejection function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
