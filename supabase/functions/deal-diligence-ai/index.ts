import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildDealContext, renderDealContextBlock, DEAL_CONTEXT_SYSTEM_FRAGMENT } from "../_shared/dealContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { dealId, messages, action, fileId } = await req.json();
    if (!dealId) throw new Error("dealId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Deterministically fetch structured deal context once and reuse it for
    // every downstream action (section generation, extraction, chat) instead
    // of re-querying and re-formatting per branch.
    const context = await buildDealContext(supabase, dealId, {
      include: { emails: false, recordings: false },
    });
    const deal = context.deal;
    const contextBlock = renderDealContextBlock(context);

    if (action === "generate_section") {
      const { sectionTitle, sectionId, metricsContext } = await req.json().catch(() => ({}));
      
      const sectionPrompt = `${DEAL_CONTEXT_SYSTEM_FRAGMENT}

You are a senior credit analyst writing the "${sectionTitle || "Executive Summary"}" section of an IC screening memo. Use ONLY facts from the payload below.

${contextBlock}

${metricsContext ? `Additional user-supplied metrics:\n${metricsContext}\n\n` : ""}Rules:
- Institutional-grade language, IC-ready.
- Be specific with numbers from the payload; flag estimates vs. confirmed data.
- 2-4 concise paragraphs; do not include the section title; plain text, no markdown headers.
- Cite supporting rows with [cite:<id>] when quoting a document, note, or funding source.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: sectionPrompt }],
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429 || status === 402) {
          return new Response(
            JSON.stringify({ error: status === 429 ? "Rate limit exceeded." : "AI credits exhausted." }),
            { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("AI gateway error");
      }

      const aiData = await response.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      return new Response(
        JSON.stringify({ content, sectionId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "extract") {
      // AI-powered extraction
      const extractionPrompt = `You are a financial data extraction engine for private credit/PE due diligence.
...
Return ONLY valid JSON, no markdown code fences.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: extractionPrompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("AI gateway error");
      }

      const aiData = await response.json();
      const rawContent = aiData.choices?.[0]?.message?.content || "{}";

      // Parse JSON from AI response
      let parsed: any = {};
      try {
        const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse extraction JSON:", rawContent.substring(0, 200));
        parsed = { statements: [], metrics: [], issues: [] };
      }

      return new Response(
        JSON.stringify({
          statements: parsed.statements || [],
          metrics: parsed.metrics || [],
          issues: parsed.issues || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chat action (default)
    const systemPrompt = `${DEAL_CONTEXT_SYSTEM_FRAGMENT}

You are a senior financial analyst for private credit and PE deal diligence. Every fact must come from the JSON payload below — do not invent lenders, numbers, or documents.

${contextBlock}

Instructions:
1. Provide analysis with the rigor of a seasoned investor; be transparent about confidence levels.
2. CITATION RULE: for every fact you reference, include an inline citation using the payload's source ids: [cite:doc:<id>], [cite:note:<id>], [cite:lender:<id>], etc. Additionally, when you name a specific file, mention the filename inline so the reader can locate it.
3. For ratios/calculations, show the formula and inputs alongside the citations.
4. Flag data-quality concerns proactively; distinguish payload facts from estimates.
5. For stress tests, state assumptions and step-by-step impacts.
6. Structure IC-ready: Executive Summary → Detail → Key Risks. Use markdown (tables, bold, bullets).

IMPORTANT: At the end of your response, on a new line, include a JSON block wrapped in <actions> tags suggesting 1-3 follow-up actions the user might want to take. Each action has a label, type, and optional prompt. Types: "add_to_report", "create_chart", "stress_test", "explain".
Example:
<actions>[{"label":"Add to report","type":"add_to_report"},{"label":"Chart this","type":"create_chart","prompt":"Create a chart of the revenue trend data"},{"label":"Stress test","type":"stress_test","prompt":"Run a downside scenario on these numbers"}]</actions>`;

    console.log("Deal diligence AI chat:", { userId: user.id, dealId, messageCount: messages?.length || 0 });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || []),
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI service error");
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

    // Extract actions from content
    let actions: any[] = [];
    const actionsMatch = content.match(/<actions>([\s\S]*?)<\/actions>/);
    if (actionsMatch) {
      try {
        actions = JSON.parse(actionsMatch[1]);
      } catch { /* ignore parse errors */ }
      content = content.replace(/<actions>[\s\S]*?<\/actions>/, "").trim();
    }

    return new Response(
      JSON.stringify({ content, actions, error: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in deal-diligence-ai:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
