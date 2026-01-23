import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLEX_API_URL = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1/naitive-flex-sync";

interface WriteUpData {
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
  companyHighlights: Array<{ id: string; title: string; description: string }>;
  financialYears: Array<{ id: string; year: string; revenue: string; gross_margin: string; ebitda: string }>;
  publishAsAnonymous: boolean;
}

interface DataRoomFile {
  name: string;
  category: string;
  url: string | null;
  size_bytes: number;
  content_type: string | null;
}

interface PushToFlexRequest {
  dealId?: string;
  action?: "publish" | "unpublish" | "sync_data_room" | "bulk_sync";
  writeUpData?: WriteUpData;
  dataRoomFiles?: DataRoomFile[];
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

    console.log(`FLEx request from user: ${user.id}`);

    const body: PushToFlexRequest = await req.json();
    const { dealId, action = "publish", writeUpData, dataRoomFiles } = body;

    // Handle bulk sync - sync all deals to Flex
    if (action === "bulk_sync") {
      console.log("Starting bulk sync of all deals to FLEx");
      
      // Get all deals with writeups that have been published
      const { data: allDeals, error: dealsError } = await supabase
        .from("deal_writeups")
        .select(`
          deal_id,
          company_name,
          industry,
          location,
          deal_type,
          billing_model,
          profitability,
          gross_margins,
          capital_ask,
          this_year_revenue,
          last_year_revenue,
          description,
          use_of_funds,
          existing_debt_details,
          data_room_url,
          key_items,
          publish_as_anonymous,
          status
        `)
        .eq("status", "published");
      
      if (dealsError) {
        console.error("Error fetching deals for bulk sync:", dealsError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch deals for sync" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!allDeals || allDeals.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No published deals to sync", synced: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Transform deals for Flex format - include the deal_id as id
      const flexDeals = allDeals.map(d => ({
        id: d.deal_id, // Original Naitive deal UUID
        company_name: d.company_name,
        industry: d.industry,
        state: d.location,
        deal_type: d.deal_type,
        billing_model: d.billing_model || undefined,
        profitability: d.profitability || undefined,
        gross_margins: d.gross_margins || undefined,
        capital_ask: d.capital_ask || undefined,
        this_year_revenue: d.this_year_revenue || undefined,
        last_year_revenue: d.last_year_revenue || undefined,
        description: d.description || undefined,
        use_of_funds: d.use_of_funds || undefined,
        existing_debt: d.existing_debt_details || undefined,
        data_room_url: d.data_room_url || undefined,
        key_items: d.key_items || undefined,
        is_published: !d.publish_as_anonymous,
      }));
      
      const bulkPayload = {
        event: "sync_deals",
        deals: flexDeals,
      };
      
      console.log(`Bulk syncing ${flexDeals.length} deals to FLEx`);
      
      const flexResponse = await fetch(FLEX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
        },
        body: JSON.stringify(bulkPayload),
      });
      
      const responseText = await flexResponse.text();
      console.log(`FLEx bulk sync response (${flexResponse.status}):`, responseText);
      
      if (!flexResponse.ok) {
        console.error(`FLEx bulk sync error: ${flexResponse.status} - ${responseText}`);
        return new Response(
          JSON.stringify({ error: "Bulk sync failed", details: responseText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let flexData;
      try {
        flexData = JSON.parse(responseText);
      } catch {
        flexData = { message: responseText };
      }
      
      // Log bulk sync activity
      await supabase.from("activity_logs").insert({
        deal_id: allDeals[0].deal_id, // Use first deal as reference
        user_id: user.id,
        activity_type: "flex_bulk_sync",
        description: `Bulk synced ${flexDeals.length} deals to FLEx`,
        metadata: { count: flexDeals.length, flexResponse: flexData },
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Bulk synced ${flexDeals.length} deals to FLEx`,
          synced: flexDeals.length,
          flexResponse: flexData
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!dealId) {
      console.error("Missing dealId");
      return new Response(
        JSON.stringify({ error: "dealId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For publish action, writeUpData is required
    if (action === "publish" && !writeUpData) {
      console.error("Missing writeUpData for publish action");
      return new Response(
        JSON.stringify({ error: "writeUpData is required for publish action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For sync_data_room action, dataRoomFiles is required
    if (action === "sync_data_room" && (!dataRoomFiles || dataRoomFiles.length === 0)) {
      console.error("Missing dataRoomFiles for sync_data_room action");
      return new Response(
        JSON.stringify({ error: "dataRoomFiles is required for sync_data_room action" }),
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

    let flexPayload;
    let activityDescription: string;

    if (action === "unpublish") {
      // For unpublish, we need to get the flex_deal_id from the most recent sync
      const { data: lastSync } = await supabase
        .from("flex_sync_history")
        .select("flex_deal_id")
        .eq("deal_id", dealId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!lastSync?.flex_deal_id) {
        console.error("No FLEx deal ID found for unpublish");
        return new Response(
          JSON.stringify({ error: "This deal has not been published to FLEx yet" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      flexPayload = {
        action: "unpublish_deal",
        deal_id: lastSync.flex_deal_id,
      };
      activityDescription = "Deal unpublished from FLEx";
    } else if (action === "sync_data_room") {
      // Get the flex_deal_id from the most recent successful sync
      const { data: lastSync } = await supabase
        .from("flex_sync_history")
        .select("flex_deal_id")
        .eq("deal_id", dealId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Prepare the data room files payload matching FLEx expected format
      const filesPayload = dataRoomFiles!.map(file => ({
        name: file.name,
        category: file.category,
        url: file.url,
      }));

      flexPayload = {
        event: "data_room_sync",
        company_name: deal.company,
        deal_id: lastSync?.flex_deal_id || dealId,
        files: filesPayload,
      };
      activityDescription = `Data room synced to FLEx (${dataRoomFiles!.length} files)`;
    } else {
      // Prepare the payload for FLEx API (publish) - include deal id
      const flexDeal = {
        id: dealId, // Original Naitive deal UUID
        company_name: writeUpData!.companyName,
        industry: writeUpData!.industry,
        state: writeUpData!.location,
        deal_type: writeUpData!.dealType,
        billing_model: writeUpData!.billingModel || undefined,
        profitability: writeUpData!.profitability || undefined,
        gross_margins: writeUpData!.grossMargins || undefined,
        capital_ask: writeUpData!.capitalAsk || undefined,
        this_year_revenue: writeUpData!.thisYearRevenue || undefined,
        last_year_revenue: writeUpData!.lastYearRevenue || undefined,
        description: writeUpData!.description || undefined,
        use_of_funds: writeUpData!.useOfFunds || undefined,
        existing_debt: writeUpData!.existingDebtDetails || undefined,
        data_room_url: writeUpData!.dataRoomUrl || undefined,
        key_items: writeUpData!.keyItems?.length > 0 ? writeUpData!.keyItems : undefined,
        company_highlights: writeUpData!.companyHighlights?.length > 0 ? writeUpData!.companyHighlights : undefined,
        financial_years: writeUpData!.financialYears?.length > 0 ? writeUpData!.financialYears : undefined,
        is_published: !writeUpData!.publishAsAnonymous,
      };

      flexPayload = {
        event: "sync_deals",
        deals: [flexDeal],
      };
      activityDescription = "Deal pushed to FLEx";
    }

    console.log(`${action} deal ${dealId} on FLEx:`, JSON.stringify(flexPayload, null, 2));

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
      
      // Record failed sync
      const failedStatus = action === "unpublish" ? "unpublish_failed" : 
                          action === "sync_data_room" ? "data_room_failed" : "failed";
      await supabase.from("flex_sync_history").insert({
        deal_id: dealId,
        synced_by: user.id,
        status: failedStatus,
        payload: flexPayload,
        error_message: responseText,
      });

      return new Response(
        JSON.stringify({ 
          error: `Failed to ${action} on FLEx`, 
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

    console.log(`Successfully ${action}ed deal ${dealId} on FLEx`);

    // Get the FLEx deal ID from response
    const flexDealId = flexData?.results?.[0]?.id || flexData?.deal_id || null;

    // Record sync history
    const successStatus = action === "unpublish" ? "unpublished" : 
                         action === "sync_data_room" ? "data_room_synced" : "success";
    await supabase.from("flex_sync_history").insert({
      deal_id: dealId,
      flex_deal_id: flexDealId,
      synced_by: user.id,
      status: successStatus,
      payload: flexPayload,
      response: flexData,
    });

    // Log the activity
    const activityType = action === "unpublish" ? "flex_unpublish" : 
                        action === "sync_data_room" ? "flex_data_room" : "flex_push";
    await supabase.from("activity_logs").insert({
      deal_id: dealId,
      user_id: user.id,
      activity_type: activityType,
      description: activityDescription,
      metadata: { flexResponse: flexData },
    });

    const actionMessage = action === "unpublish" ? "unpublished from" : 
                          action === "sync_data_room" ? "data room synced to" : "pushed to";
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Deal ${actionMessage} FLEx successfully`,
        flexResponse: flexData,
        flexDealId
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