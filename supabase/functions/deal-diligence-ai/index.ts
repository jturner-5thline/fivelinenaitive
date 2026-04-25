import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

    // Fetch deal info
    const { data: deal } = await supabase
      .from("deals")
      .select("company, value, stage, deal_type, notes")
      .eq("id", dealId)
      .single();

    // Fetch financial documents
    const { data: financials } = await supabase
      .from("deal_space_financials")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });

    // Fetch deal documents
    const { data: documents } = await supabase
      .from("deal_space_documents")
      .select("name, content_type, notes, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Build context
    const financialsContext = (financials || []).map((f: any) => {
      let info = `- ${f.name}`;
      if (f.fiscal_year && f.fiscal_period) info += ` (${f.fiscal_period} ${f.fiscal_year})`;
      if (f.notes) info += `: ${f.notes}`;
      return info;
    }).join("\n");

    const documentsContext = (documents || []).map((d: any) => `- ${d.name}${d.notes ? `: ${d.notes}` : ""}`).join("\n");

    if (action === "generate_section") {
      const { sectionTitle, sectionId, metricsContext } = await req.json().catch(() => ({}));
      
      const sectionPrompt = `You are a senior credit analyst writing an IC screening memo for ${deal?.company || "a company"}.
Deal Value: $${deal?.value ? (deal.value / 1e6).toFixed(1) + "MM" : "N/A"}
Stage: ${deal?.stage || "N/A"}

Available Financial Data:
${financialsContext || "No files uploaded"}

Documents:
${documentsContext || "No documents"}

${metricsContext ? `Key Metrics:\n${metricsContext}` : ""}

Write the "${sectionTitle || "Executive Summary"}" section of a deal screening memo.
- Use institutional-grade language appropriate for an Investment Committee
- Be specific with numbers and data points where available
- Clearly flag any estimates vs. confirmed data
- Keep it concise but thorough (2-4 paragraphs)
- Do not include the section title in your response
- Use plain text, no markdown headers`;

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
    const systemPrompt = `You are a senior financial analyst AI for private credit and PE deal diligence. You help analyze deals with institutional-grade rigor.

Context:
- Deal: ${deal?.company || "Unknown Company"}
- Deal Value: $${deal?.value ? (deal.value / 1000000).toFixed(1) + "MM" : "N/A"}
- Stage: ${deal?.stage || "N/A"}
- Type: ${deal?.deal_type || "N/A"}

Available Financial Files:
${financialsContext || "No financial files uploaded yet."}

Available Documents:
${documentsContext || "No documents uploaded yet."}

Instructions:
1. Provide analysis with the rigor of a seasoned investor
2. Use clear headings and structured formatting
3. CRITICAL SOURCE CITATION RULE: For EVERY financial number, metric, or data point you reference, you MUST include an inline source citation in the format: *(Source: [filename] → [sheet name] → [cell/row reference])*. Example: "Revenue was $3.47M *(Source: UPFLEX Model.xlsx → P&L → Row 12, Col D)*"
4. Be transparent about confidence levels - clearly distinguish between data you have vs estimates
5. When asked for ratios or calculations, show the formula and inputs with source references
6. Flag any data quality concerns proactively
7. For stress tests, clearly state assumptions and show step-by-step impacts
8. Structure responses for IC-ready consumption: Executive Summary → Detail → Key Risks
9. Use markdown formatting: tables for numbers, bold for key metrics, bullet points for observations
10. ONLY use data from the financial files listed above. Do NOT mix in or confuse data from other documents.

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
