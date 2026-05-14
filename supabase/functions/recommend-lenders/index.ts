import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Recommendation {
  lenderId: string | null;
  lenderName: string;
  matchScore: number;
  rationale: string;
  components: { type: number; size: number; industry: number; recency: number };
}

function checkSufficiency(deal: any, writeup: any, dsDocs: any[], vdrDocs: any[]) {
  const missing: string[] = [];
  const dealTypes: string[] = (deal?.dealTypes && deal.dealTypes.length > 0)
    ? deal.dealTypes
    : (writeup?.deal_type ? [writeup.deal_type] : []);
  if (dealTypes.length === 0) missing.push("Deal type");
  const dealSize: number | null = deal?.value ?? writeup?.capital_ask ?? null;
  if (!dealSize || dealSize <= 0) missing.push("Deal size");
  const hasFinancials = !!(writeup?.this_year_revenue || writeup?.last_year_revenue || writeup?.financial_years);
  const hasNarrative = !!(writeup?.description || writeup?.company_highlights || writeup?.team || writeup?.key_items);
  const hasDocs = (dsDocs?.length || 0) + (vdrDocs?.length || 0) > 0;
  if (!hasFinancials && !hasNarrative && !hasDocs) {
    missing.push("Deal Space financials, Write Up narrative, or Data Room documents");
  }
  return { ok: missing.length === 0, missing, dealTypes, dealSize };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dealId } = await req.json();
    if (!dealId || typeof dealId !== "string") {
      return new Response(JSON.stringify({ error: "dealId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull the deal (RLS scoped)
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("id, company, value, stage, status, company_id, user_id, business_model, deal_type, narrative")
      .eq("id", dealId)
      .maybeSingle();
    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Write-up (best effort)
    const { data: writeup } = await supabase
      .from("deal_writeups")
      .select(
        "deal_type, capital_ask, industry, location, this_year_revenue, last_year_revenue, financial_years, description, company_highlights, team, key_items, customer_base, sponsorship, billing_model, profitability, gross_margins, b2b_b2c, revenue_type, collateral_available, use_of_funds, existing_debt_items",
      )
      .eq("deal_id", dealId)
      .maybeSingle();

    // Documents
    const [{ data: dsDocs }, { data: vdrDocs }] = await Promise.all([
      supabase
        .from("deal_space_documents")
        .select("filename, folder_path")
        .eq("deal_id", dealId)
        .is("deleted_at", null)
        .limit(50),
      supabase
        .from("vdr_documents")
        .select("name")
        .eq("deal_id", dealId)
        .limit(50),
    ]);

    const dealTypesFromDeal = deal.deal_type
      ? String(deal.deal_type).split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const sufficiency = checkSufficiency(
      { value: deal.value, dealTypes: dealTypesFromDeal },
      writeup,
      dsDocs ?? [],
      vdrDocs ?? [],
    );
    if (!sufficiency.ok) {
      return new Response(
        JSON.stringify({ recommendations: [], sufficiency, generatedAt: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Existing lenders + exclusions
    const [{ data: existingLenders }, { data: exclusions }] = await Promise.all([
      supabase.from("deal_lenders").select("name").eq("deal_id", dealId),
      supabase.from("deal_lender_recommendation_exclusions").select("lender_name").eq("deal_id", dealId),
    ]);
    const excludeSet = new Set<string>([
      ...(existingLenders ?? []).map((l: any) => String(l.name).trim().toLowerCase()),
      ...(exclusions ?? []).map((e: any) => String(e.lender_name).trim().toLowerCase()),
    ]);

    // Master lender directory (RLS scoped — shared directory)
    const { data: masterLenders } = await supabase
      .from("master_lenders")
      .select(
        "id, name, lender_type, loan_types, sub_debt, cash_burn, sponsorship, min_revenue, ebitda_min, min_deal, max_deal, industries, industries_to_avoid, b2b_b2c, refinancing, geo, tier, active, deal_structure_notes, company_requirements",
      )
      .limit(2000);

    const filteredLenders = (masterLenders ?? []).filter((l: any) => {
      if (l.active === false) return false;
      return !excludeSet.has(String(l.name).trim().toLowerCase());
    });

    // Recent activity in last 90 days (lender names that appear on deal_lenders updated recently)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLenderRows } = await supabase
      .from("deal_lenders")
      .select("name")
      .gte("updated_at", ninetyDaysAgo)
      .limit(2000);
    const recentSet = new Set(
      (recentLenderRows ?? []).map((r: any) => String(r.name).trim().toLowerCase()),
    );

    // Trim lender payload for prompt
    const compactLenders = filteredLenders.slice(0, 250).map((l: any) => ({
      id: l.id,
      name: l.name,
      type: l.lender_type,
      loanTypes: l.loan_types,
      industries: l.industries,
      industriesAvoid: l.industries_to_avoid,
      minDeal: l.min_deal,
      maxDeal: l.max_deal,
      sponsorship: l.sponsorship,
      cashBurn: l.cash_burn,
      tier: l.tier,
      notes: (l.deal_structure_notes || "").slice(0, 240),
      recentActivity: recentSet.has(String(l.name).trim().toLowerCase()),
    }));

    const dealContext = {
      name: deal.company ?? null,
      value: deal.value,
      dealTypes: sufficiency.dealTypes,
      industry: writeup?.industry || deal.business_model || null,
      location: writeup?.location || null,
      sponsorship: writeup?.sponsorship || null,
      billingModel: writeup?.billing_model || null,
      revenue: writeup?.this_year_revenue || writeup?.last_year_revenue || null,
      profitability: writeup?.profitability || null,
      grossMargins: writeup?.gross_margins || null,
      collateral: writeup?.collateral_available || null,
      narrative: [deal.narrative, writeup?.description, writeup?.company_highlights, writeup?.team, writeup?.customer_base]
        .filter(Boolean).join("\n\n").slice(0, 4000),
      dataroomDocs: [
        ...(dsDocs ?? []).map((d: any) => d.filename),
        ...(vdrDocs ?? []).map((d: any) => d.name),
      ].slice(0, 30),
    };

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You are an expert capital markets analyst inside the naitive lender CRM. Rank lenders for a specific deal using ONLY the supplied lender directory and deal context.

Scoring rubric (produce a 0-100 match score that is the WEIGHTED AVERAGE of these four sub-scores, each 0-100):
- Deal type alignment (40%): does the lender actively fund the deal types listed (e.g. ABL, Growth Capital, CapEx, Acquisition financing)? Use loanTypes/type/notes.
- Deal size fit (30%): is the deal value within minDeal/maxDeal? Soft penalty if just outside; full credit if comfortably inside.
- Industry match (20%): does the lender's 'industries' include or fit the deal industry, and is it not in industriesAvoid?
- Recent activity (10%): use the recentActivity boolean (true means active in naitive within last 90 days).

Return between 5 and 10 recommendations sorted by matchScore descending. Drop anything below 50. Each rationale must be a single sentence (<=160 chars) referencing a concrete reason (deal type, size band, industry, recent activity).

Respond with strict JSON only matching this shape:
{"recommendations":[{"lenderId":"<uuid|null>","lenderName":"<name>","matchScore":<int 0-100>,"rationale":"<one sentence>","components":{"type":<0-100>,"size":<0-100>,"industry":<0-100>,"recency":<0-100>}}]}
No prose, no markdown, no code fences.`;

    const userMsg = `DEAL CONTEXT:\n${JSON.stringify(dealContext)}\n\nLENDER DIRECTORY (${compactLenders.length} candidates):\n${JSON.stringify(compactLenders)}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!claudeRes.ok) {
      const txt = await claudeRes.text();
      console.error("Claude error", claudeRes.status, txt);
      return new Response(JSON.stringify({ error: "AI provider error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeJson = await claudeRes.json();
    const text: string = claudeJson?.content?.[0]?.text ?? "";
    let parsed: { recommendations?: Recommendation[] } = {};
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch (e) {
      console.error("Failed to parse Claude JSON", text);
      return new Response(JSON.stringify({ error: "Invalid AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lenderById = new Map(filteredLenders.map((l: any) => [l.id, l]));
    const lenderByName = new Map(filteredLenders.map((l: any) => [String(l.name).toLowerCase(), l]));

    const recommendations = (parsed.recommendations ?? [])
      .map((r) => {
        const found = (r.lenderId && lenderById.get(r.lenderId)) ||
          lenderByName.get(String(r.lenderName || "").toLowerCase());
        return {
          lenderId: found?.id ?? r.lenderId ?? null,
          lenderName: found?.name ?? r.lenderName,
          matchScore: Math.max(0, Math.min(100, Math.round(Number(r.matchScore) || 0))),
          rationale: String(r.rationale || "").slice(0, 200),
          components: {
            type: Math.round(Number(r.components?.type) || 0),
            size: Math.round(Number(r.components?.size) || 0),
            industry: Math.round(Number(r.components?.industry) || 0),
            recency: Math.round(Number(r.components?.recency) || 0),
          },
          tier: found?.tier ?? null,
        };
      })
      .filter((r) => r.lenderName && r.matchScore >= 50 && !excludeSet.has(String(r.lenderName).toLowerCase()))
      .slice(0, 10);

    return new Response(
      JSON.stringify({
        recommendations,
        sufficiency,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("recommend-lenders error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});