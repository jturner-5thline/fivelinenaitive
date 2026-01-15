import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLEX_API_URL = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1/naitive-flex-sync";

interface PushToFlexRequest {
  dealId: string;
  writeUpData: {
    companyName: string;
    companyUrl: string;
    linkedinUrl: string;
    dataRoomUrl: string;
    industry: string;
    location: string;
    dealType: string;
    billingModel: string;
    profitability: string;
    grossMargins: string;
    capitalAsk: string;
    thisYearRevenue: string;
    lastYearRevenue: string;
    financialDataAsOf: string | null;
    accountingSystem: string;
    status: string;
    useOfFunds: string;
    existingDebtDetails: string;
    description: string;
    keyItems: Array<{ id: string; title: string; description: string }>;
    publishAsAnonymous: boolean;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NAITIVE_FLEX_SYNC_KEY = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");

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

    console.log(`Push to FLEx request from user: ${user.id}`);

    const body: PushToFlexRequest = await req.json();
    const { dealId, writeUpData } = body;

    if (!dealId || !writeUpData) {
      console.error("Missing required fields:", { dealId: !!dealId, writeUpData: !!writeUpData });
      return new Response(
        JSON.stringify({ error: "dealId and writeUpData are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this deal
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("id, company, user_id, company_id")
      .eq("id", dealId)
      .single();

    if (dealError || !deal) {
      console.error("Deal not found:", dealError);
      return new Response(
        JSON.stringify({ error: "Deal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user owns the deal or is in the same company
    if (deal.user_id !== user.id) {
      const { data: membership } = await supabase
        .from("company_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", deal.company_id)
        .single();

      if (!membership) {
        console.error("User does not have access to this deal");
        return new Response(
          JSON.stringify({ error: "You do not have access to this deal" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Prepare the payload for FLEx API
    const flexDeal = {
      company_name: writeUpData.companyName,
      industry: writeUpData.industry,
      state: writeUpData.location,
      deal_type: writeUpData.dealType,
      billing_model: writeUpData.billingModel || undefined,
      profitability: writeUpData.profitability || undefined,
      gross_margins: writeUpData.grossMargins || undefined,
      capital_ask: writeUpData.capitalAsk || undefined,
      this_year_revenue: writeUpData.thisYearRevenue || undefined,
      last_year_revenue: writeUpData.lastYearRevenue || undefined,
      description: writeUpData.description || undefined,
      use_of_funds: writeUpData.useOfFunds || undefined,
      existing_debt: writeUpData.existingDebtDetails || undefined,
      data_room_url: writeUpData.dataRoomUrl || undefined,
      key_items: writeUpData.keyItems?.length > 0 ? writeUpData.keyItems : undefined,
      is_published: !writeUpData.publishAsAnonymous,
    };

    const flexPayload = {
      action: "sync_deals",
      deals: [flexDeal],
    };

    console.log(`Pushing deal ${dealId} to FLEx:`, JSON.stringify(flexPayload, null, 2));

    // Send to FLEx API
    const flexResponse = await fetch(FLEX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify(flexPayload),
    });

    const responseText = await flexResponse.text();
    console.log(`FLEx API response (${flexResponse.status}):`, responseText);

    if (!flexResponse.ok) {
      console.error(`FLEx API error: ${flexResponse.status} - ${responseText}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to push to FLEx", 
          details: responseText,
          status: flexResponse.status 
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let flexData;
    try {
      flexData = JSON.parse(responseText);
    } catch {
      flexData = { message: responseText };
    }

    console.log(`Successfully pushed deal ${dealId} to FLEx`);

    // Log the activity
    await supabase.from("activity_logs").insert({
      deal_id: dealId,
      user_id: user.id,
      activity_type: "flex_push",
      description: `Deal pushed to FLEx`,
      metadata: { flexResponse: flexData },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Deal pushed to FLEx successfully",
        flexResponse: flexData 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in push-to-flex function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
