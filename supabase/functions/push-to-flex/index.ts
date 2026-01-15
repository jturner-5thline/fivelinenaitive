import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FLEX_API_URL = Deno.env.get("FLEX_API_URL");
    const FLEX_API_KEY = Deno.env.get("FLEX_API_KEY");

    if (!FLEX_API_URL) {
      console.error("FLEX_API_URL is not configured");
      return new Response(
        JSON.stringify({ error: "FLEx API URL is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!FLEX_API_KEY) {
      console.error("FLEX_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "FLEx API Key is not configured" }),
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

    // Verify the user's JWT
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
      // Check company membership
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

    // Prepare the payload for FLEx
    const flexPayload = {
      source: "5thline-deal-tracker",
      dealId,
      dealName: deal.company,
      writeUp: writeUpData,
      pushedAt: new Date().toISOString(),
      pushedBy: user.id,
    };

    console.log(`Pushing deal ${dealId} to FLEx:`, JSON.stringify(flexPayload, null, 2));

    // Send to FLEx API
    const flexResponse = await fetch(FLEX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FLEX_API_KEY,
        "Authorization": `Bearer ${FLEX_API_KEY}`,
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
