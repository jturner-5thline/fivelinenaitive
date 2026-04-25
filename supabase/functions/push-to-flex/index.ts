import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLEX_API_URL = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1/naitive-flex-sync";

interface OwnershipEntry {
  id: string;
  owner_name: string;
  ownership_percentage: number;
  owner_url: string | null;
  position: number;
}

interface WriteUpData {
  companyName: string;
  companyUrl: string;
  linkedinUrl: string;
  dataRoomUrl: string;
  industry: string;
  location: string;
  yearFounded: string;
  customerBase: string;
  headcount: string;
  dealType: string;
  billingModel: string;
  profitability: string;
  grossMargins: string;
  capitalAsk: string;
  financialDataAsOf: string | null;
  accountingSystem: string;
  status: string;
  useOfFunds: string;
  existingDebtDetails: string;
  description: string;
  keyItems: Array<{ id: string; title: string; description: string }>;
  companyHighlights: Array<{ id: string; title: string; description: string }>;
  financialYears: Array<{ id: string; year: string; revenue: string; gross_margin: string; ebitda: string }>;
  financialComments: Array<{ id: string; title: string; description: string }>;
  ownership: OwnershipEntry[];
  totalEquityRaised: string;
  publishAsAnonymous: boolean;
  team?: Array<{ name: string; title: string; linkedin?: string }>;
  visibleMetrics?: { yoy_growth: boolean; this_year_revenue: boolean; last_year_revenue: boolean; gross_margins: boolean };
}

interface DataRoomFile {
  name: string;
  category: string;
  url: string | null;
  size_bytes: number;
  content_type: string | null;
}
/** Return the string if it has real content, otherwise undefined. */
function nonEmpty(val: string | null | undefined): string | undefined {
  if (!val) return undefined;
  const stripped = val.trim().replace(/<[^>]*>/g, '').trim();
  return stripped.length > 0 ? val : undefined;
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

    // Demo account restriction: check can_push_flex capability
    const { data: permRow } = await supabase
      .from("user_permissions")
      .select("can_push_flex")
      .eq("user_id", user.id)
      .maybeSingle();

    if (permRow && permRow.can_push_flex === false) {
      console.warn(`Demo user ${user.id} blocked from FLEx push`);
      return new Response(
        JSON.stringify({ error: "Demo account restriction: FLEx push is not available for demo accounts." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
          status,
          deals!inner(manager, companies:company_id(name))
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
        id: d.deal_id,
        company_name: d.company_name,
        industry: d.industry,
        state: d.location,
        deal_type: d.deal_type,
        billing_model: nonEmpty(d.billing_model) ,
        profitability: nonEmpty(d.profitability),
        gross_margins: nonEmpty(d.gross_margins),
        capital_ask: nonEmpty(d.capital_ask),
        this_year_revenue: nonEmpty(d.this_year_revenue),
        last_year_revenue: nonEmpty(d.last_year_revenue),
        description: nonEmpty(d.description),
        use_of_funds: nonEmpty(d.use_of_funds),
        existing_debt: nonEmpty(d.existing_debt_details),
        data_room_url: nonEmpty(d.data_room_url),
        key_items: d.key_items || undefined,
        is_published: !d.publish_as_anonymous,
        deal_manager_name: (d as any).deals?.manager || undefined,
        managing_company: ((d as any).deals?.companies?.name || '').toLowerCase().includes('5th line') ? '5th Line' : ((d as any).deals?.companies?.name || undefined),
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

    // For sync_data_room action, dataRoomFiles must be provided (can be empty array to clear data room)
    if (action === "sync_data_room" && !dataRoomFiles) {
      console.error("Missing dataRoomFiles for sync_data_room action");
      return new Response(
        JSON.stringify({ error: "dataRoomFiles is required for sync_data_room action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this deal
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("id, company, user_id, company_id, manager, companies:company_id(name)")
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

      const managingCompany = (deal as any).companies?.name || '';
      const resolvedManagingCompany = managingCompany.toLowerCase().includes('5th line') ? '5th Line' : managingCompany;
      const dealCompanyName = deal.company || '';
      flexPayload = {
        event: "deal_unpublished",
        deal: {
          id: dealId,
          deal_id: lastSync.flex_deal_id,
          company_name: dealCompanyName,
          managing_company: resolvedManagingCompany,
        },
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
      // Fetch fresh ownership data from DB to ensure URLs are current
      const { data: freshOwnership } = await supabase
        .from("deal_ownership")
        .select("owner_name, ownership_percentage, owner_url")
        .eq("deal_id", dealId)
        .order("position", { ascending: true });

      // Fetch company-level disclaimer from company_settings
      let companyDisclaimer: string | null = null;
      if (deal.company_id) {
        const { data: settings, error: settingsError } = await supabase
          .from("company_settings")
          .select("disclaimer")
          .eq("company_id", deal.company_id)
          .maybeSingle();
        if (settingsError) {
          console.error("Error fetching company disclaimer:", settingsError);
        }
        companyDisclaimer = (settings as any)?.disclaimer || null;
        console.log(`Company disclaimer for company_id ${deal.company_id}: "${companyDisclaimer}"`);
      } else {
        console.log("No company_id on deal, skipping disclaimer fetch");
      }

      // Prepare the payload for FLEx API (publish) - include deal id
      const flexDeal = {
        id: dealId,
        company_name: writeUpData!.companyName,
        company_url: writeUpData!.companyUrl || undefined,
        linkedin_url: writeUpData!.linkedinUrl || undefined,
        industry: writeUpData!.industry,
        state: writeUpData!.location,
        year_founded: (writeUpData as any).yearFounded || undefined,
        customer_base: (writeUpData as any).customerBase || undefined,
        headcount: (writeUpData as any).headcount || undefined,
        deal_type: writeUpData!.dealType,
        billing_model: nonEmpty(writeUpData!.billingModel),
        profitability: nonEmpty(writeUpData!.profitability),
        gross_margins: nonEmpty(writeUpData!.grossMargins),
        capital_ask: nonEmpty(writeUpData!.capitalAsk),
        accounting_system: nonEmpty(writeUpData!.accountingSystem),
        description: nonEmpty(writeUpData!.description),
        use_of_funds: nonEmpty(writeUpData!.useOfFunds),
        existing_debt: nonEmpty(writeUpData!.existingDebtDetails),
        data_room_url: nonEmpty(writeUpData!.dataRoomUrl),
        key_items: writeUpData!.keyItems?.length > 0 ? writeUpData!.keyItems : undefined,
        company_highlights: writeUpData!.companyHighlights?.length > 0 ? writeUpData!.companyHighlights : undefined,
        financial_years: writeUpData!.financialYears?.length > 0 ? writeUpData!.financialYears : undefined,
        financial_comments: writeUpData!.financialComments?.length > 0 ? writeUpData!.financialComments : undefined,
        cap_table: freshOwnership && freshOwnership.length > 0 ? freshOwnership.map(o => ({
          name: o.owner_name,
          ownership: Number(o.ownership_percentage),
          url: o.owner_url || undefined,
        })) : undefined,
        total_equity_raised: writeUpData!.totalEquityRaised || undefined,
        is_published: !writeUpData!.publishAsAnonymous,
        team: writeUpData!.team && writeUpData!.team.length > 0 ? writeUpData!.team : undefined,
        visible_metrics: writeUpData!.visibleMetrics || undefined,
        disclaimer: companyDisclaimer || null,
        deal_manager_name: deal.manager || undefined,
        managing_company: ((deal as any).companies?.name || '').toLowerCase().includes('5th line') ? '5th Line' : ((deal as any).companies?.name || undefined),
      };

      flexPayload = {
        event: "sync_deals",
        deals: [flexDeal],
      };
      activityDescription = "Deal pushed to FLEx";
    }

    console.log(`totalEquityRaised from writeUpData: "${writeUpData?.totalEquityRaised}"`);
    console.log(`${action} deal ${dealId} on FLEx:`, JSON.stringify(flexPayload, null, 2));

    // Use FLEX_API_URL env var for unpublish/data_room actions, fallback to hardcoded for publish/sync
    let targetUrl = FLEX_API_URL;
    if (action === "unpublish" || action === "sync_data_room") {
      const envFlexUrl = Deno.env.get("FLEX_API_URL");
      console.log(`FLEX_API_URL env var: "${envFlexUrl}"`);
      if (envFlexUrl && envFlexUrl.startsWith("http")) {
        // If FLEX_API_URL is a base URL, append the sync endpoint
        targetUrl = envFlexUrl.endsWith("/naitive-flex-sync") ? envFlexUrl : `${envFlexUrl}/naitive-flex-sync`;
      }
    }
    console.log(`Sending to FLEx URL: ${targetUrl}`);

    // Send to FLEx API
    const flexResponse = await fetch(targetUrl, {
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