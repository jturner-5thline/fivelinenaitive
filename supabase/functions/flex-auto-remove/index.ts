import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// FLEx sync target — same hard-coded URL used by push-to-flex.
const FLEX_API_URL = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1/naitive-flex-sync";

type TriggerRule = "due_diligence" | "closed_won" | "closed_lost" | "archived";

interface AutoRemovePayload {
  deal_id: string;
  company_id?: string | null;
  trigger_rule: TriggerRule;
  previous_stage?: string | null;
  new_stage?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
}

function isValidPayload(p: unknown): p is AutoRemovePayload {
  if (!p || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  if (typeof x.deal_id !== "string" || x.deal_id.length === 0) return false;
  if (
    x.trigger_rule !== "due_diligence" &&
    x.trigger_rule !== "closed_won" &&
    x.trigger_rule !== "closed_lost" &&
    x.trigger_rule !== "archived"
  ) {
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!isValidPayload(payload)) {
    return new Response(
      JSON.stringify({ error: "Invalid payload: deal_id and trigger_rule are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const {
    deal_id,
    company_id: payloadCompanyId,
    trigger_rule,
    previous_stage,
    new_stage,
    previous_status,
    new_status,
  } = payload;

  console.log(
    `flex-auto-remove invoked: deal=${deal_id}, rule=${trigger_rule}, ` +
      `stage=${previous_stage}->${new_stage}, status=${previous_status}->${new_status}`,
  );

  // Look up the deal (need company name + company_id to send the unpublish payload)
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, company, company_id, companies:company_id(name)")
    .eq("id", deal_id)
    .maybeSingle();

  if (dealError || !deal) {
    console.error("Deal lookup failed", dealError);
    return new Response(
      JSON.stringify({ error: "Deal not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const companyId = deal.company_id ?? payloadCompanyId ?? null;

  // Look up the most recent successful FLEx sync for this deal to get the flex_deal_id.
  const { data: lastSync } = await supabase
    .from("flex_sync_history")
    .select("flex_deal_id")
    .eq("deal_id", deal_id)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // If the deal was never published to FLEx, there's nothing to remove. Record skipped audit.
  if (!lastSync?.flex_deal_id) {
    await supabase.from("flex_auto_removal_audit").insert({
      deal_id,
      company_id: companyId,
      trigger_rule,
      previous_stage,
      new_stage,
      previous_status,
      new_status,
      removal_status: "skipped",
      error_message: "Deal has no successful FLEx sync history; nothing to remove.",
    });
    return new Response(
      JSON.stringify({ success: true, skipped: true, reason: "no_flex_sync" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const flexDealId = lastSync.flex_deal_id;
  const managingCompanyName: string =
    (deal.companies as { name?: string } | null)?.name ?? "";
  const resolvedManagingCompany = managingCompanyName.toLowerCase().includes("5th line")
    ? "5th Line"
    : managingCompanyName || undefined;

  const flexPayload = {
    event: "deal_unpublished",
    deal: {
      id: deal_id,
      deal_id: flexDealId,
      company_name: deal.company || "",
      managing_company: resolvedManagingCompany,
    },
    auto_removal: {
      trigger_rule,
      previous_stage,
      new_stage,
      previous_status,
      new_status,
    },
  };

  // Call FLEx
  const NAITIVE_FLEX_SYNC_KEY = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
  if (!NAITIVE_FLEX_SYNC_KEY) {
    console.error("NAITIVE_FLEX_SYNC_KEY is not configured");
    await supabase.from("flex_auto_removal_audit").insert({
      deal_id,
      company_id: companyId,
      trigger_rule,
      previous_stage,
      new_stage,
      previous_status,
      new_status,
      flex_deal_id: flexDealId,
      removal_status: "failed",
      error_message: "NAITIVE_FLEX_SYNC_KEY not configured",
    });
    return new Response(
      JSON.stringify({ error: "FLEx sync key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const targetUrl = Deno.env.get("FLEX_API_URL")?.startsWith("http")
    ? (Deno.env.get("FLEX_API_URL")!.endsWith("/naitive-flex-sync")
        ? Deno.env.get("FLEX_API_URL")!
        : `${Deno.env.get("FLEX_API_URL")}/naitive-flex-sync`)
    : FLEX_API_URL;

  let flexResponseStatus = 0;
  let flexResponseBody: unknown = null;
  let removalStatus: "success" | "failed" = "failed";
  let errorMessage: string | null = null;

  try {
    const flexResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-key": NAITIVE_FLEX_SYNC_KEY,
      },
      body: JSON.stringify(flexPayload),
    });

    flexResponseStatus = flexResponse.status;
    const text = await flexResponse.text();
    try {
      flexResponseBody = JSON.parse(text);
    } catch {
      flexResponseBody = { raw: text };
    }

    if (flexResponse.ok) {
      removalStatus = "success";
    } else {
      errorMessage = `FLEx returned ${flexResponse.status}: ${text}`;
      console.error(errorMessage);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown fetch error";
    console.error("Failed to reach FLEx:", errorMessage);
  }

  // Audit log
  await supabase.from("flex_auto_removal_audit").insert({
    deal_id,
    company_id: companyId,
    trigger_rule,
    previous_stage,
    new_stage,
    previous_status,
    new_status,
    flex_deal_id: flexDealId,
    removal_status: removalStatus,
    error_message: errorMessage,
    metadata: {
      flex_response_status: flexResponseStatus,
      flex_response_body: flexResponseBody,
    },
  });

  // Mirror in flex_sync_history so existing UI shows the removal.
  if (removalStatus === "success") {
    await supabase.from("flex_sync_history").insert({
      deal_id,
      flex_deal_id: flexDealId,
      status: "unpublished",
      synced_by: "00000000-0000-0000-0000-000000000000",
      payload: flexPayload as unknown as Record<string, unknown>,
      response: flexResponseBody as Record<string, unknown> | null,
    });

    await supabase.from("activity_logs").insert({
      deal_id,
      activity_type: "flex_auto_removed",
      description: `Auto-removed from FLEx (rule: ${trigger_rule})`,
      metadata: {
        trigger_rule,
        previous_stage,
        new_stage,
        previous_status,
        new_status,
      },
    });
  }

  return new Response(
    JSON.stringify({
      success: removalStatus === "success",
      removal_status: removalStatus,
      flex_response_status: flexResponseStatus,
      error: errorMessage,
    }),
    {
      status: removalStatus === "success" ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});