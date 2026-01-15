import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReplyPayload {
  deal_id: string;
  info_request_id: string;
  reply_message: string;
  lender_email?: string;
  lender_name?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: ReplyPayload = await req.json();
    console.log("Processing FLEx reply:", payload);

    // Validate required fields
    if (!payload.deal_id || !payload.reply_message) {
      return new Response(JSON.stringify({ error: "Missing required fields: deal_id and reply_message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate message length
    if (payload.reply_message.length > 2000) {
      return new Response(JSON.stringify({ error: "Reply message too long (max 2000 characters)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get deal info
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: deal, error: dealError } = await supabaseAdmin
      .from("deals")
      .select("company, user_id")
      .eq("id", payload.deal_id)
      .single();

    if (dealError || !deal) {
      console.error("Deal not found:", dealError);
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user owns this deal or is in the same company
    if (deal.user_id !== user.id) {
      const { data: isSameCompany } = await supabaseAdmin.rpc('is_same_company_as_user', {
        _current_user_id: user.id,
        _deal_owner_id: deal.user_id
      });
      
      if (!isSameCompany) {
        return new Response(JSON.stringify({ error: "Not authorized to reply to this deal" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get user profile for the reply
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, first_name, email")
      .eq("user_id", user.id)
      .single();

    const replierName = profile?.display_name || profile?.first_name || profile?.email || "Team Member";

    // Get FLEx API configuration
    const flexApiUrl = Deno.env.get("FLEX_API_URL");
    const flexApiKey = Deno.env.get("FLEX_API_KEY");

    let flexSent = false;
    let flexResponse = null;

    // Try to send to FLEx if configured
    if (flexApiUrl && flexApiKey) {
      try {
        // Get the flex_deal_id from sync history
        const { data: syncRecord } = await supabaseAdmin
          .from("flex_sync_history")
          .select("flex_deal_id")
          .eq("deal_id", payload.deal_id)
          .eq("status", "success")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (syncRecord?.flex_deal_id) {
          const response = await fetch(`${flexApiUrl}/api/deals/${syncRecord.flex_deal_id}/replies`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${flexApiKey}`,
            },
            body: JSON.stringify({
              message: payload.reply_message,
              sender_name: replierName,
              sender_email: profile?.email,
              in_reply_to: payload.info_request_id,
              lender_email: payload.lender_email,
            }),
          });

          if (response.ok) {
            flexResponse = await response.json();
            flexSent = true;
            console.log("Reply sent to FLEx successfully:", flexResponse);
          } else {
            const errorText = await response.text();
            console.error("FLEx API error:", response.status, errorText);
          }
        } else {
          console.log("No FLEx sync record found for deal, will log reply locally only");
        }
      } catch (flexError) {
        console.error("Error calling FLEx API:", flexError);
      }
    } else {
      console.log("FLEx API not configured, logging reply locally only");
    }

    // Log the reply as an activity
    const { error: logError } = await supabaseAdmin
      .from("activity_logs")
      .insert({
        deal_id: payload.deal_id,
        activity_type: "flex_info_reply_sent",
        description: `${replierName} replied to ${payload.lender_name || payload.lender_email || "lender"}: "${payload.reply_message.substring(0, 100)}${payload.reply_message.length > 100 ? "..." : ""}"`,
        user_id: user.id,
        metadata: {
          source: "naitive",
          reply_message: payload.reply_message,
          lender_name: payload.lender_name,
          lender_email: payload.lender_email,
          info_request_id: payload.info_request_id,
          flex_sent: flexSent,
          flex_response: flexResponse,
          replier_name: replierName,
          replier_email: profile?.email,
        },
      });

    if (logError) {
      console.error("Failed to log reply activity:", logError);
    }

    // If we have a notification, mark it as read
    if (payload.info_request_id) {
      await supabaseAdmin
        .from("flex_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", payload.info_request_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        flex_sent: flexSent,
        message: flexSent 
          ? "Reply sent to FLEx and logged" 
          : "Reply logged locally (FLEx API not configured or deal not synced)",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing reply:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
