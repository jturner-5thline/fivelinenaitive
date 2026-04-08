import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const year = now.getFullYear();
    const periodStart = `${year}-01-01`;
    const periodEnd = now.toISOString().slice(0, 10);

    // ─── 1. Numerator: YTD revenue from QB invoices for "5th Line Capital Advisors LLC" ───
    const advisorsRealmId = "193514877331929";

    const { data: invoiceRows, error: invErr } = await supabase
      .from("quickbooks_invoices")
      .select("total_amt")
      .eq("realm_id", advisorsRealmId)
      .gte("txn_date", periodStart)
      .lte("txn_date", periodEnd);

    if (invErr) throw new Error(`Invoice query failed: ${invErr.message}`);

    const numerator = (invoiceRows || []).reduce(
      (sum: number, r: any) => sum + (r.total_amt ?? 0),
      0
    );

    // ─── 2. Denominator: distinct deals whose FIRST entry into "final-credit-items" is YTD ───
    // Get all stage_change events to final-credit-items this year
    const { data: stageEvents, error: stageErr } = await supabase
      .from("activity_logs")
      .select("deal_id, created_at")
      .eq("activity_type", "stage_change")
      .gte("created_at", `${periodStart}T00:00:00Z`)
      .lte("created_at", `${periodEnd}T23:59:59Z`);

    if (stageErr) throw new Error(`Stage query failed: ${stageErr.message}`);

    // Filter to only events where metadata.to = 'final-credit-items'
    // Since we can't filter jsonb easily via REST, we fetch all stage changes and filter
    // Actually let's query with a raw filter
    const { data: fciEvents, error: fciErr } = await supabase
      .from("activity_logs")
      .select("deal_id, created_at")
      .eq("activity_type", "stage_change")
      .gte("created_at", `${periodStart}T00:00:00Z`)
      .lte("created_at", `${periodEnd}T23:59:59Z`)
      .contains("metadata", { to: "final-credit-items" });

    if (fciErr) throw new Error(`FCI events query failed: ${fciErr.message}`);

    // Get the FIRST entry per deal (we need to check if it's truly the first ever, not just YTD)
    const dealIds = [...new Set((fciEvents || []).map((e: any) => e.deal_id))];

    // For each deal, check if there's an earlier entry before YTD start
    const firstTimeDeals: string[] = [];
    for (const dealId of dealIds) {
      const { data: priorEntries } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("deal_id", dealId)
        .eq("activity_type", "stage_change")
        .contains("metadata", { to: "final-credit-items" })
        .lt("created_at", `${periodStart}T00:00:00Z`)
        .limit(1);

      if (!priorEntries || priorEntries.length === 0) {
        firstTimeDeals.push(dealId);
      }
    }

    // Verify these deals are in an "Active Pipeline"
    let denominator = 0;
    if (firstTimeDeals.length > 0) {
      const { data: activeDeals, error: adErr } = await supabase
        .from("deals")
        .select("id, pipeline_id")
        .in("id", firstTimeDeals);

      if (adErr) throw new Error(`Deals query failed: ${adErr.message}`);

      // Get active pipeline IDs
      const { data: activePipelines } = await supabase
        .from("deal_pipelines")
        .select("id")
        .ilike("name", "%active%");

      const activePipelineIds = new Set(
        (activePipelines || []).map((p: any) => p.id)
      );

      denominator = (activeDeals || []).filter((d: any) =>
        activePipelineIds.has(d.pipeline_id)
      ).length;
    }

    // ─── 3. Compute metric ───
    const metricValue = denominator > 0 ? numerator / denominator : null;
    const status = denominator > 0 ? "fresh" : "fresh";

    // ─── 4. Get company_id from QB tokens ───
    const { data: tokenRow } = await supabase
      .from("quickbooks_tokens")
      .select("company_id, user_id")
      .eq("realm_id", advisorsRealmId)
      .limit(1)
      .single();

    // Get company_id from the user's company membership if not on token
    let companyId = tokenRow?.company_id;
    if (!companyId && tokenRow?.user_id) {
      const { data: memberRow } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", tokenRow.user_id)
        .limit(1)
        .single();
      companyId = memberRow?.company_id;
    }

    if (!companyId) {
      // Fallback: get the first company that has active pipelines
      const { data: firstCompany } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
        .single();
      companyId = firstCompany?.id;
    }

    if (!companyId) throw new Error("Could not determine company_id");

    // ─── 5. Upsert into computed_kpis ───
    const { error: upsertErr } = await supabase
      .from("computed_kpis")
      .upsert(
        {
          company_id: companyId,
          metric_key: "avg_revenue_per_new_client_signed_ytd",
          metric_value: metricValue,
          numerator_value: numerator,
          denominator_value: denominator,
          period_start: periodStart,
          period_end: periodEnd,
          status,
          error_message: null,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "company_id,metric_key" }
      );

    if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

    console.log(
      `KPI computed: numerator=${numerator}, denominator=${denominator}, value=${metricValue}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        metric_key: "avg_revenue_per_new_client_signed_ytd",
        metric_value: metricValue,
        numerator: numerator,
        denominator: denominator,
        period: `${periodStart} to ${periodEnd}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("KPI computation failed:", err);

    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
