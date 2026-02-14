import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FlexEngagementResponse {
  success: boolean;
  engagement?: {
    views: number;
    downloads: number;
    info_requests: number;
    nda_requests: number;
    term_sheet_requests: number;
    saves: number;
    unique_lenders: number;
  };
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const { deal_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: "deal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the FLEx deal ID from sync history
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: syncRecord } = await serviceClient
      .from("flex_sync_history")
      .select("flex_deal_id")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!syncRecord?.flex_deal_id) {
      // No FLEx mapping - return zeros
      return new Response(
        JSON.stringify({
          success: true,
          engagement: {
            views: 0,
            downloads: 0,
            info_requests: 0,
            nda_requests: 0,
            term_sheet_requests: 0,
            saves: 0,
            unique_lenders: 0,
          },
          source: "no_flex_mapping",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call FLEx API to get engagement stats
    const FLEX_API_URL_DEFAULT = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1";
    let FLEX_API_URL = Deno.env.get("FLEX_API_URL");
    if (!FLEX_API_URL || !FLEX_API_URL.startsWith("http")) {
      FLEX_API_URL = FLEX_API_URL_DEFAULT;
    }

    const NAITIVE_FLEX_SYNC_KEY = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
    if (!NAITIVE_FLEX_SYNC_KEY) {
      console.error("NAITIVE_FLEX_SYNC_KEY not configured");
      return new Response(
        JSON.stringify({ error: "FLEx sync key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching engagement for FLEx deal ${syncRecord.flex_deal_id}`);

    const flexResponse = await fetch(`${FLEX_API_URL}/get-deal-engagement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify({
        deal_id: syncRecord.flex_deal_id,
        source_project_id: "naitive",
      }),
    });

    if (!flexResponse.ok) {
      const errorText = await flexResponse.text();
      console.error(`FLEx API error [${flexResponse.status}]:`, errorText);
      
      // Fall back to local activity_logs data
      return await fallbackToLocalStats(serviceClient, deal_id, corsHeaders);
    }

    const flexData: FlexEngagementResponse = await flexResponse.json();
    
    if (!flexData.success || !flexData.engagement) {
      console.warn("FLEx returned unsuccessful response, falling back to local");
      return await fallbackToLocalStats(serviceClient, deal_id, corsHeaders);
    }

    return new Response(
      JSON.stringify({
        success: true,
        engagement: flexData.engagement,
        source: "flex_api",
        flex_deal_id: syncRecord.flex_deal_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching FLEx engagement:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fallback: count from local activity_logs if FLEx API is unavailable
async function fallbackToLocalStats(supabase: any, dealId: string, headers: Record<string, string>) {
  const { data: activities } = await supabase
    .from("activity_logs")
    .select("activity_type, metadata")
    .eq("deal_id", dealId)
    .like("activity_type", "flex_%");

  const stats = {
    views: 0,
    downloads: 0,
    info_requests: 0,
    nda_requests: 0,
    term_sheet_requests: 0,
    saves: 0,
    unique_lenders: 0,
  };

  const lenderSet = new Set<string>();

  (activities || []).forEach((a: any) => {
    const meta = a.metadata as Record<string, any> | null;
    const lenderKey = meta?.lender_name || meta?.lender_email;
    if (lenderKey) lenderSet.add(lenderKey);

    switch (a.activity_type) {
      case "flex_deal_viewed": case "flex_deal_view": stats.views++; break;
      case "flex_file_downloaded": stats.downloads++; break;
      case "flex_info_requested": stats.info_requests++; break;
      case "flex_nda_requested": stats.nda_requests++; break;
      case "flex_term_sheet_requested": stats.term_sheet_requests++; break;
      case "flex_deal_saved": stats.saves++; break;
    }
  });

  stats.unique_lenders = lenderSet.size;

  return new Response(
    JSON.stringify({
      success: true,
      engagement: stats,
      source: "local_fallback",
    }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
}
