import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeRequest {
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  max_tokens?: number;
  context?: string; // which feature is calling: "chat", "financial-analysis", "agent", "workflow"
  stream?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Get user's company
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    const companyId = membership?.company_id;

    // Parse request
    const body: ClaudeRequest = await req.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate message content length
    const totalLength = body.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalLength > 100000) {
      return new Response(
        JSON.stringify({ success: false, error: "Message content too long (max 100k chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check AI config if company exists
    let aiConfig: any = null;
    if (companyId) {
      const { data } = await supabase
        .from("ai_configuration")
        .select("*")
        .eq("company_id", companyId)
        .single();
      aiConfig = data;
    }

    // Check if feature is enabled
    const feature = body.context || "chat";
    if (aiConfig?.features_enabled) {
      const featureKey = feature.replace("-", "_").replace("financial-analysis", "financial_analysis");
      if (aiConfig.features_enabled[featureKey] === false) {
        return new Response(
          JSON.stringify({ success: false, error: `AI ${feature} feature is disabled for your organization` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Anthropic API key
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Anthropic API key is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = aiConfig?.default_model || body.context === "agent" 
      ? (aiConfig?.default_model || "claude-sonnet-4-20250514")
      : "claude-sonnet-4-20250514";
    const temperature = body.temperature ?? aiConfig?.default_temperature ?? 0.7;
    const maxTokens = body.max_tokens ?? aiConfig?.max_tokens ?? 4096;

    // Build Anthropic API request
    const anthropicBody: any = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: body.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (body.system) {
      anthropicBody.system = body.system;
    }

    // Call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "Failed to get AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract response text
    const responseText = data.content
      ?.filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n") || "";

    const usage = {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    };

    // Log usage (best-effort)
    if (companyId) {
      supabase
        .from("ai_usage_logs")
        .insert({
          company_id: companyId,
          user_id: userId,
          feature,
          model: data.model || model,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        })
        .then(() => {})
        .catch((err: any) => console.error("Failed to log AI usage:", err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: responseText,
        usage,
        model: data.model || model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Claude AI error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
