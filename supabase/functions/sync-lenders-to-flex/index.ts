import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MasterLender {
  id: string;
  name: string;
  email: string | null;
  lender_type: string | null;
  loan_types: string[] | null;
  sub_debt: string | null;
  cash_burn: string | null;
  sponsorship: string | null;
  min_revenue: number | null;
  ebitda_min: number | null;
  min_deal: number | null;
  max_deal: number | null;
  industries: string[] | null;
  industries_to_avoid: string[] | null;
  b2b_b2c: string | null;
  refinancing: string | null;
  company_requirements: string | null;
  deal_structure_notes: string | null;
  geo: string | null;
  contact_name: string | null;
  contact_title: string | null;
  relationship_owners: string | null;
  lender_one_pager_url: string | null;
  referral_lender: string | null;
  referral_fee_offered: string | null;
  referral_agreement: string | null;
  nda: string | null;
  onboarded_to_flex: string | null;
  upfront_checklist: string | null;
  post_term_sheet_checklist: string | null;
  gift_address: string | null;
  tier: string | null;
  active: boolean | null;
  created_at: string;
  updated_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NAITIVE_FLEX_SYNC_KEY = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
    const FLEX_API_URL_DEFAULT = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1";
    
    // Validate FLEX_API_URL - it might be set to an API key by mistake
    let FLEX_API_URL = Deno.env.get("FLEX_API_URL");
    if (!FLEX_API_URL || !FLEX_API_URL.startsWith("http")) {
      console.warn("FLEX_API_URL not set or invalid, using default");
      FLEX_API_URL = FLEX_API_URL_DEFAULT;
    }

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

    console.log(`Lender sync to FLEx requested by user: ${user.id}`);

    // Fetch all master lenders
    const { data: lenders, error: lendersError } = await supabase
      .from("master_lenders")
      .select("*")
      .order("name", { ascending: true });

    if (lendersError) {
      console.error("Error fetching master lenders:", lendersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch lenders" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lenders || lenders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No lenders to sync", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing ${lenders.length} lenders to FLEx`);

    // Transform lenders for Flex format
    const flexLenders = lenders.map((l: MasterLender) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      lender_type: l.lender_type,
      loan_types: l.loan_types,
      sub_debt: l.sub_debt,
      cash_burn: l.cash_burn,
      sponsorship: l.sponsorship,
      min_revenue: l.min_revenue,
      ebitda_min: l.ebitda_min,
      min_deal: l.min_deal,
      max_deal: l.max_deal,
      industries: l.industries,
      industries_to_avoid: l.industries_to_avoid,
      b2b_b2c: l.b2b_b2c,
      refinancing: l.refinancing,
      company_requirements: l.company_requirements,
      deal_structure_notes: l.deal_structure_notes,
      geo: l.geo,
      contact_name: l.contact_name,
      contact_title: l.contact_title,
      relationship_owners: l.relationship_owners,
      lender_one_pager_url: l.lender_one_pager_url,
      referral_lender: l.referral_lender,
      referral_fee_offered: l.referral_fee_offered,
      referral_agreement: l.referral_agreement,
      nda: l.nda,
      onboarded_to_flex: l.onboarded_to_flex,
      upfront_checklist: l.upfront_checklist,
      post_term_sheet_checklist: l.post_term_sheet_checklist,
      gift_address: l.gift_address,
      tier: l.tier,
      active: l.active !== false, // default to true if null
      source_updated_at: l.updated_at,
    }));

    const syncPayload = {
      event: "sync_lenders",
      source: "naitive_master",
      overwrite: true, // This tells Flex to replace their lender database
      lenders: flexLenders,
    };

    console.log(`Sending ${flexLenders.length} lenders to FLEx with overwrite=true`);

    // Send to FLEx API
    const flexResponse = await fetch(`${FLEX_API_URL}/receive-lender-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify(syncPayload),
    });

    const responseText = await flexResponse.text();
    console.log(`FLEx lender sync response (${flexResponse.status}):`, responseText);

    if (!flexResponse.ok) {
      console.error(`FLEx lender sync error: ${flexResponse.status} - ${responseText}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to sync lenders to FLEx", 
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

    console.log(`Successfully synced ${lenders.length} lenders to FLEx`);

    // Log the sync activity
    await supabase.from("activity_logs").insert({
      user_id: user.id,
      activity_type: "flex_lender_sync",
      description: `Synced ${lenders.length} lenders to FLEx (overwrite mode)`,
      metadata: { 
        count: lenders.length, 
        flexResponse: flexData,
        overwrite: true
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully synced ${lenders.length} lenders to FLEx`,
        synced: lenders.length,
        flexResponse: flexData
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in sync-lenders-to-flex function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
