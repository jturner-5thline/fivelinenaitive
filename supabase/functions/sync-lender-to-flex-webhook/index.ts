import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
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
  flex_lender_id: string | null;
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
    
    // Validate FLEX_API_URL
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

    // Parse request body from the database trigger
    const body = await req.json();
    const { lender_id, event, flex_lender_id } = body;

    if (!lender_id) {
      console.error("No lender_id provided in webhook payload");
      return new Response(
        JSON.stringify({ error: "lender_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Auto-sync webhook triggered for lender: ${lender_id}, event: ${event}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the lender data
    const { data: lender, error: lenderError } = await supabase
      .from("master_lenders")
      .select("*")
      .eq("id", lender_id)
      .single();

    if (lenderError || !lender) {
      console.error("Error fetching lender:", lenderError);
      return new Response(
        JSON.stringify({ error: "Lender not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const l = lender as MasterLender;

    // Transform lender for Flex format
    const flexLender = {
      id: l.id,
      naitive_lender_id: l.id,
      flex_lender_id: l.flex_lender_id,
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
      active: l.active !== false,
      source_updated_at: l.updated_at,
      sync_source: "naitive",
    };

    const syncPayload = {
      event: "lender_updated",
      source: "naitive",
      lender: flexLender,
    };

    console.log(`Auto-syncing lender "${l.name}" to FLEx`);

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
    console.log(`FLEx auto-sync response (${flexResponse.status}):`, responseText);

    if (!flexResponse.ok) {
      console.error(`FLEx auto-sync error: ${flexResponse.status} - ${responseText}`);
      // Log the sync failure but don't throw - we don't want to affect the original update
      await supabase.from("integration_logs").insert({
        integration_type: "flex_lender_sync",
        event_type: "auto_sync_failed",
        status: "error",
        error_message: `FLEx returned ${flexResponse.status}: ${responseText}`,
        payload: syncPayload,
      });
      
      return new Response(
        JSON.stringify({ 
          error: "Failed to auto-sync lender to FLEx", 
          details: responseText,
          status: flexResponse.status 
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log successful sync
    await supabase.from("integration_logs").insert({
      integration_type: "flex_lender_sync",
      event_type: "auto_sync_success",
      status: "success",
      payload: { lender_id: l.id, lender_name: l.name },
      response: { status: flexResponse.status },
    });

    console.log(`Successfully auto-synced lender "${l.name}" to FLEx`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Auto-synced "${l.name}" to FLEx`,
        lender_id: l.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in sync-lender-to-flex-webhook:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
