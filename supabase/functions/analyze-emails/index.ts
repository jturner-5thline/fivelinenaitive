import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface EmailForAnalysis {
  cache_id: string;
  subject: string;
  snippet: string;
  body_text?: string;
  from_email: string;
  from_name: string;
}

interface AnalysisResult {
  cache_id: string;
  deal_match: { deal_id: string; deal_name: string } | null;
  category: string;
  sentiment: string;
  priority: string;
  summary: string;
  suggested_action: string | null;
  follow_up_needed: boolean;
  follow_up_by: string | null;
  extracted_data: Record<string, any>;
  signals: string[];
}

serve(async (req: Request): Promise<Response> => {
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

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth with user token
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { emails, settings } = await req.json() as {
      emails: EmailForAnalysis[];
      settings?: {
        auto_tagging?: boolean;
        sentiment_analysis?: boolean;
        signal_detection?: boolean;
        follow_up_reminders?: boolean;
        auto_extract?: boolean;
      };
    };

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's deals for matching
    const { data: membership } = await serviceClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    let dealContext = "No deals available for matching.";
    if (membership?.company_id) {
      const { data: deals } = await serviceClient
        .from("deals")
        .select("id, company, stage, status, value")
        .eq("company_id", membership.company_id)
        .in("status", ["active", "on_hold"])
        .limit(200);

      if (deals && deals.length > 0) {
        dealContext = "Available deals for matching:\n" + deals.map(d =>
          `- ID: ${d.id} | Company: ${d.company} | Stage: ${d.stage} | Status: ${d.status}`
        ).join("\n");
      }

      // Also get lender names for matching
      const { data: lenders } = await serviceClient
        .from("deal_lenders")
        .select("name, deal_id")
        .in("deal_id", (deals || []).map(d => d.id))
        .limit(500);

      if (lenders && lenders.length > 0) {
        const uniqueLenders = [...new Set(lenders.map(l => l.name))].slice(0, 100);
        dealContext += "\n\nKnown lender names: " + uniqueLenders.join(", ");
      }
    }

    // Build prompt
    const emailList = emails.map((e, i) => {
      const content = e.body_text?.slice(0, 1000) || e.snippet || "";
      return `Email ${i + 1} (cache_id: "${e.cache_id}"):
Subject: ${e.subject}
From: ${e.from_name} <${e.from_email}>
Content: ${content}`;
    }).join("\n\n---\n\n");

    const enabledFeatures: string[] = [];
    if (settings?.auto_tagging !== false) enabledFeatures.push("category classification");
    if (settings?.sentiment_analysis !== false) enabledFeatures.push("sentiment analysis");
    if (settings?.signal_detection !== false) enabledFeatures.push("signal detection");
    if (settings?.follow_up_reminders !== false) enabledFeatures.push("follow-up detection");
    if (settings?.auto_extract !== false) enabledFeatures.push("data extraction");

    const systemPrompt = `You are an email intelligence analyst for a deal management platform. Analyze each email and return structured JSON.

${dealContext}

For each email, provide:
1. deal_match: Match to a deal by company name, contact name, or lender name. Return {deal_id, deal_name} or null.
2. category: One of [deal_update, lender_communication, follow_up_needed, terms_discussion, due_diligence, scheduling, internal, newsletter, other]
3. sentiment: One of [positive, negative, neutral, urgent]
4. priority: One of [high, medium, low]
5. summary: One sentence summary of the key point
6. suggested_action: Brief recommended next step, or null
7. follow_up_needed: boolean
8. follow_up_by: ISO date string if follow_up_needed, otherwise null
9. extracted_data: Object with any extracted dollar amounts, dates, rates, company names, lender names
10. signals: Array of detected signals like ["term_sheet_received", "closing_language", "risk_indicator", "loi_mention", "covenant_breach"]

Enabled features: ${enabledFeatures.join(", ")}

Return ONLY a valid JSON array with one object per email. Each object must include the "cache_id" from the input.
Do not include markdown formatting or code blocks. Return raw JSON only.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these emails:\n\n${emailList}` },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({
        error: response.status === 429 ? "Rate limited, retry later" : "AI analysis failed",
        partial: true,
        results: [],
      }), {
        status: response.status === 429 ? 429 : (response.status === 402 ? 402 : 502),
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const responseText: string = aiData?.choices?.[0]?.message?.content || "";

    // Parse JSON response - handle potential markdown wrapping
    let parsed: AnalysisResult[];
    try {
      const cleaned = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      // Tolerate models that wrap the array in an object or add prose: pull first JSON array.
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(arrayMatch ? arrayMatch[0] : cleaned);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", responseText.slice(0, 500));
      return new Response(JSON.stringify({
        error: "Failed to parse AI analysis",
        partial: true,
        results: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store results in email_analysis table
    const inserts = parsed.map((r: AnalysisResult) => ({
      email_cache_id: r.cache_id,
      user_id: user.id,
      deal_id: r.deal_match?.deal_id || null,
      deal_name: r.deal_match?.deal_name || null,
      category: r.category || "other",
      sentiment: r.sentiment || "neutral",
      priority: r.priority || "medium",
      summary: r.summary || null,
      suggested_action: r.suggested_action || null,
      follow_up_needed: r.follow_up_needed || false,
      follow_up_by: r.follow_up_by || null,
      extracted_data: r.extracted_data || {},
      signals: r.signals || [],
    }));

    // Upsert to handle re-analysis
    for (const insert of inserts) {
      const { error: insertErr } = await serviceClient
        .from("email_analysis")
        .upsert(insert, { onConflict: "email_cache_id" });

      if (insertErr) {
        console.error("Insert error for", insert.email_cache_id, insertErr);
      }
    }

    // If deal matching is found, add to activity logs
    for (const r of parsed) {
      if (r.deal_match?.deal_id) {
        await serviceClient.from("activity_logs").insert({
          deal_id: r.deal_match.deal_id,
          user_id: user.id,
          activity_type: "email_intelligence",
          description: `Email from ${emails.find(e => e.cache_id === r.cache_id)?.from_name || "unknown"}: ${r.summary || "analyzed"}`,
          metadata: {
            email_cache_id: r.cache_id,
            category: r.category,
            sentiment: r.sentiment,
            priority: r.priority,
          },
        }).then(() => {}).catch(err => console.error("Activity log error:", err));
      }
    }

    return new Response(JSON.stringify({ results: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("analyze-emails error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
