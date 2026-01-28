import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId, messages } = await req.json();

    if (!dealId) {
      throw new Error("dealId is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch financial documents for this deal
    const { data: financials, error: financialsError } = await supabase
      .from("deal_space_financials")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });

    if (financialsError) {
      console.error("Error fetching financials:", financialsError);
      throw new Error("Failed to fetch financial documents");
    }

    if (!financials || financials.length === 0) {
      return new Response(
        JSON.stringify({ 
          content: "No financial documents have been uploaded yet. Please upload some financial files first.",
          error: null 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch deal info for context
    const { data: deal } = await supabase
      .from("deals")
      .select("company, value, stage")
      .eq("id", dealId)
      .single();

    // Build context about the financials
    const financialsContext = financials.map(f => {
      let info = `- ${f.name}`;
      if (f.fiscal_year && f.fiscal_period) {
        info += ` (${f.fiscal_period} ${f.fiscal_year})`;
      }
      if (f.notes) {
        info += `: ${f.notes}`;
      }
      return info;
    }).join("\n");

    const systemPrompt = `You are a financial analyst AI assistant helping analyze deal financials. 

Context:
- Deal: ${deal?.company || "Unknown Company"}
- Deal Value: $${deal?.value?.toLocaleString() || "N/A"}
- Stage: ${deal?.stage || "N/A"}

Uploaded Financial Documents:
${financialsContext}

Important notes:
1. You have information about which documents are uploaded but cannot read their actual content yet
2. Base your analysis on the document names, fiscal periods, and any notes provided
3. Be helpful in suggesting what insights could be gained from these documents
4. When users ask specific questions about numbers, remind them that you can see document metadata but detailed analysis requires the documents to be processed
5. Provide financial analysis frameworks and suggest what to look for
6. Be concise but thorough in your responses`;

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
          ...messages,
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
    const content = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

    return new Response(
      JSON.stringify({ content, error: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in deal-space-financials-ai:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
