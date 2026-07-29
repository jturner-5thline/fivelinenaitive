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
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Use anon key with user's auth header for RLS-scoped access
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { dealId, messages } = await req.json();

    if (!dealId) {
      throw new Error("dealId is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Deterministically build a compact, citable JSON snapshot of the deal
    // (financial docs, notes, activity) BEFORE calling the model. This keeps
    // token usage predictable and makes Claude's answers cite real rows.
    const context = await buildDealContext(supabase, dealId, {
      include: { recordings: false, emails: false },
    });

    if (context.documents.length === 0) {
      return new Response(
        JSON.stringify({
          content: "No financial documents have been uploaded yet. Please upload some financial files first.",
          error: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `${DEAL_CONTEXT_SYSTEM_FRAGMENT}

You are a financial-analyst assistant. Interpret the deal's financial documents (see \`documents[]\` in the payload) with institutional rigor. When you quote a metric or observation from a document, cite it with [cite:doc:<id>]. If a specific number the user asks about is not in the payload, say the document must be processed further rather than guessing.

${renderDealContextBlock(context)}`;

    console.log('Deal space financials AI request:', {
      userId: user.id,
      dealId,
      messageCount: messages?.length || 0,
      contextChars: context.approx_chars,
      docs: context.documents.length,
    });

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
