import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────
// extract-deal-fit
// For one or more deals, reads the write-up, notes, narrative, lender
// feedback, tags and key items; summarizes them with an LLM into a canonical
// deal_fit_profiles row (positive/negative signals, exclusions, nuanced
// preferences, risk_flags, summary, embedding). Idempotent via source_hash.
//
// Body: { dealIds?: string[], force?: boolean }
//   - If dealIds is empty, processes the 25 most-recently-updated deals that
//     have a stale (NULL) source_hash.
// ─────────────────────────────────────────────────────────────────────────

const MODEL_VERSION = "gemini-2.5-flash+text-embedding-3-small";
const EXTRACTION_MODEL = "google/gemini-2.5-flash";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIM = 1536;

const arr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function embedText(text: string, key: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000), dimensions: EMBEDDING_DIM }),
  });
  if (!res.ok) { console.error("embed error", res.status, await res.text()); return null; }
  const j = await res.json();
  return j?.data?.[0]?.embedding ?? null;
}

const SYSTEM_PROMPT = `You are a senior capital-markets analyst summarizing a debt-financing deal so that a lender-matching engine can use it.

Output STRICT JSON only with this schema:
{
  "summary": "<=400 char narrative profile, concrete and specific",
  "positive_signals": [ { "signal": "what makes this deal attractive to most lenders", "confidence": 0..1 } ],
  "negative_signals": [ { "signal": "soft friction lenders may dislike", "confidence": 0..1 } ],
  "exclusions": [ { "pattern": "concrete situation that would make many lenders pass", "confidence": 0..1 } ],
  "nuanced_preferences": [ { "preference": "founder-led / sponsor-backed / turnaround / seasonal / etc.", "confidence": 0..1 } ],
  "risk_flags": [ { "flag": "litigation, customer concentration, declining revenue, regulated, etc.", "confidence": 0..1 } ]
}

Be concrete. Reference the deal's actual industry, capital ask, sponsor status, collateral mix, cash burn, customer base, and write-up notes. Never invent facts. If a signal is not supported by evidence, omit it.`;

async function extractFit(text: string, key: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 12000) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) { console.error("extract error", res.status, await res.text()); return null; }
  const j = await res.json();
  const content = j?.choices?.[0]?.message?.content ?? "";
  try { return JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const requestedIds: string[] = Array.isArray(body?.dealIds) ? body.dealIds.slice(0, 25) : [];
    const force = !!body?.force;

    let dealIds: string[] = requestedIds;
    if (!dealIds.length) {
      // Find stale profiles or deals with no profile yet
      const { data: stale } = await supabase
        .from("deal_fit_profiles")
        .select("deal_id")
        .is("source_hash", null)
        .limit(25);
      dealIds = (stale ?? []).map((r: any) => r.deal_id);
      if (dealIds.length < 25) {
        const { data: recent } = await supabase
          .from("deals")
          .select("id")
          .order("updated_at", { ascending: false })
          .limit(25 - dealIds.length);
        for (const d of recent ?? []) if (!dealIds.includes(d.id)) dealIds.push(d.id);
      }
    }
    if (!dealIds.length) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processed = 0, skipped = 0, errors = 0;
    for (const dealId of dealIds) {
      try {
        const { data: deal } = await supabase.from("deals")
          .select("id, company, value, business_model, deal_type, narrative, engagement_type, deal_class, notes, tags, key_signal, pain_points_confirmed, objections_raised, opportunity_type")
          .eq("id", dealId).maybeSingle();
        if (!deal) continue;
        const { data: writeup } = await supabase.from("deal_writeups")
          .select("deal_type, capital_ask, industry, location, this_year_revenue, last_year_revenue, description, company_highlights, customer_base, sponsorship, profitability, gross_margins, b2b_b2c, collateral_available, use_of_funds, cash_burn_ok, year_founded, headcount, total_equity_raised, financial_comments")
          .eq("deal_id", dealId).maybeSingle();
        const { data: dealNotes } = await supabase.from("deal_space_notes")
          .select("title, content, tags").eq("deal_id", dealId).order("updated_at", { ascending: false }).limit(20);
        const { data: dlFeedback } = await supabase.from("deal_lenders")
          .select("name, pass_reason, notes").eq("deal_id", dealId).limit(40);

        const text = [
          `COMPANY: ${deal.company ?? ""}`,
          `CAPITAL_ASK: ${writeup?.capital_ask ?? deal.value ?? ""}`,
          `DEAL_TYPE: ${writeup?.deal_type ?? deal.deal_type ?? ""}`,
          `INDUSTRY: ${writeup?.industry ?? deal.business_model ?? ""}`,
          `SUB_INDUSTRY: ${deal.opportunity_type ?? ""}`,
          `B2B_B2C: ${writeup?.b2b_b2c ?? ""}`,
          `SPONSORSHIP: ${writeup?.sponsorship ?? ""}`,
          `COLLATERAL: ${writeup?.collateral_available ?? ""}`,
          `PROFITABILITY: ${writeup?.profitability ?? ""}`,
          `CASH_BURN_OK: ${writeup?.cash_burn_ok ?? ""}`,
          `USE_OF_FUNDS: ${writeup?.use_of_funds ?? ""}`,
          `REVENUE: ${writeup?.this_year_revenue ?? writeup?.last_year_revenue ?? ""}`,
          `CUSTOMER_BASE: ${writeup?.customer_base ?? ""}`,
          `DESCRIPTION: ${writeup?.description ?? deal.narrative ?? ""}`,
          `HIGHLIGHTS: ${typeof writeup?.company_highlights === "string" ? writeup.company_highlights : JSON.stringify(writeup?.company_highlights ?? "")}`,
          `KEY_SIGNAL: ${deal.key_signal ?? ""}`,
          `PAIN_POINTS: ${deal.pain_points_confirmed ?? ""}`,
          `OBJECTIONS: ${deal.objections_raised ?? ""}`,
          `TAGS: ${arr(deal.tags).join(", ")}`,
          "DEAL_NOTES:",
          ...(dealNotes ?? []).map((n: any) => `- ${n.title}: ${(n.content ?? "").slice(0, 300)}`),
          "LENDER_FEEDBACK_ON_THIS_DEAL:",
          ...(dlFeedback ?? []).filter((d: any) => d.pass_reason || d.notes).map((d: any) => `- ${d.name}: ${d.pass_reason ?? ""} ${d.notes ?? ""}`),
        ].join("\n").slice(0, 12000);

        const hash = await sha256Hex(text + MODEL_VERSION);
        const { data: existing } = await supabase.from("deal_fit_profiles")
          .select("source_hash").eq("deal_id", dealId).maybeSingle();
        if (!force && existing?.source_hash === hash) { skipped++; continue; }

        const extracted = await extractFit(text, LOVABLE_API_KEY);
        if (!extracted) { errors++; continue; }
        const embedding = await embedText(
          `${extracted.summary ?? ""}\n${(extracted.positive_signals ?? []).map((s: any) => s.signal).join("; ")}\n${(extracted.negative_signals ?? []).map((s: any) => s.signal).join("; ")}`,
          LOVABLE_API_KEY,
        );

        const payload = {
          deal_id: dealId,
          summary: String(extracted.summary ?? "").slice(0, 1500),
          positive_signals: extracted.positive_signals ?? [],
          negative_signals: extracted.negative_signals ?? [],
          exclusions: extracted.exclusions ?? [],
          nuanced_preferences: extracted.nuanced_preferences ?? [],
          risk_flags: extracted.risk_flags ?? [],
          embedding: embedding as any,
          source_hash: hash,
          extracted_at: new Date().toISOString(),
          model: MODEL_VERSION,
        };
        const { error: upErr } = await supabase.from("deal_fit_profiles")
          .upsert(payload, { onConflict: "deal_id" });
        if (upErr) { console.error("upsert deal_fit_profiles", upErr); errors++; continue; }
        processed++;
      } catch (e) {
        console.error("deal", dealId, e);
        errors++;
      }
    }

    return new Response(JSON.stringify({ processed, skipped, errors, total: dealIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-deal-fit error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});