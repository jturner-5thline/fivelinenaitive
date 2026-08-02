import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AgentConfig {
  id: string;
  name: string;
  system_prompt: string;
  personality: string;
  temperature: number;
  can_access_deals: boolean;
  can_access_lenders: boolean;
  can_access_activities: boolean;
  can_access_milestones: boolean;
  can_search_web: boolean;
}

interface DealContext {
  id?: string;
  company?: string;
  value?: number;
  stage?: string;
  status?: string;
  successFeePercent?: number;
  retainerFee?: number;
  milestoneFee?: number;
  totalFee?: number;
  engagementType?: string;
  closingFeeAmount?: number;
  closingFeePercent?: number;
}

function buildSystemPrompt(agentConfig: AgentConfig, dealContext?: DealContext): string {
  let prompt = agentConfig.system_prompt || "You are a helpful AI assistant.";

  if (agentConfig.personality) {
    prompt += `\n\nPersonality: ${agentConfig.personality}`;
  }

  if (dealContext) {
    prompt += `\n\nCurrent Deal Context:`;
    if (dealContext.company) prompt += `\n- Company: ${dealContext.company}`;
    if (dealContext.value) prompt += `\n- Value: $${dealContext.value.toLocaleString()}`;
    if (dealContext.stage) prompt += `\n- Stage: ${dealContext.stage}`;
    if (dealContext.status) prompt += `\n- Status: ${dealContext.status}`;
    if (dealContext.engagementType) prompt += `\n- Engagement Type: ${dealContext.engagementType}`;
    if (dealContext.successFeePercent != null) prompt += `\n- Success Fee: ${dealContext.successFeePercent}%`;
    if (dealContext.retainerFee != null) prompt += `\n- Retainer Fee: $${dealContext.retainerFee.toLocaleString()}`;
    if (dealContext.milestoneFee != null) prompt += `\n- Milestone Fee: $${dealContext.milestoneFee.toLocaleString()}`;
    if (dealContext.totalFee != null) prompt += `\n- Total Fee: $${dealContext.totalFee.toLocaleString()}`;
    if (dealContext.closingFeeAmount != null) prompt += `\n- Closing Fee Amount: $${dealContext.closingFeeAmount.toLocaleString()}`;
    if (dealContext.closingFeePercent != null) prompt += `\n- Closing Fee %: ${dealContext.closingFeePercent}%`;
  }

  const capabilities: string[] = [];
  if (agentConfig.can_access_deals) capabilities.push("deals");
  if (agentConfig.can_access_lenders) capabilities.push("lenders");
  if (agentConfig.can_access_activities) capabilities.push("activities");
  if (agentConfig.can_access_milestones) capabilities.push("milestones");
  if (capabilities.length > 0) {
    prompt += `\n\nYou have access to: ${capabilities.join(", ")} data.`;
  }

  return prompt;
}

async function logUsage(
  supabase: any,
  companyId: string,
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  status: "success" | "error",
  errorMessage?: string
) {
  try {
    await supabase.from("ai_usage_logs").insert({
      company_id: companyId,
      user_id: userId,
      feature: "agents",
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      status,
      error_message: errorMessage ?? null,
    });
  } catch (_) { /* best-effort */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // ── Company + feature gating ─────────────────────────
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    const companyId = membership?.company_id;

    if (companyId) {
      const { data: aiConfig } = await supabase
        .from("ai_configuration")
        .select("features_enabled")
        .eq("company_id", companyId)
        .single();

      if (aiConfig?.features_enabled?.agents === false) {
        return new Response(
          JSON.stringify({ error: "AI Agents feature is disabled for your organization" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Parse request ────────────────────────────────────
    const { messages, agentConfig, dealContext } = await req.json() as {
      messages: Message[];
      agentConfig: AgentConfig;
      dealContext?: DealContext;
    };

    if (!messages || !agentConfig) {
      return new Response(
        JSON.stringify({ error: "Messages and agent config are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalLength > 50000) {
      return new Response(
        JSON.stringify({ error: "Message content too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullSystemPrompt = buildSystemPrompt(agentConfig, dealContext);

    // ── Call Anthropic ───────────────────────────────────
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      if (companyId) {
        await logUsage(supabase, companyId, userId, "claude-sonnet-4-5-20250929", 0, 0, "error", "ANTHROPIC_API_KEY not configured");
      }
      return new Response(
        JSON.stringify({ error: "AI service is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = "claude-sonnet-4-5-20250929";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    let response: Response;
    try {
      response = await anthropicFetch({ feature: "agent-chat" }, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: agentConfig.temperature || 0.7,
          system: fullSystemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const errMsg = fetchErr instanceof Error && fetchErr.name === "AbortError"
        ? "AI request timed out"
        : "Failed to reach AI service";
      if (companyId) {
        await logUsage(supabase, companyId, userId, model, 0, 0, "error", errMsg);
      }
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);

      const errMsg = response.status === 429
        ? "Rate limit exceeded. Please try again later."
        : "Failed to get AI response";

      if (companyId) {
        await logUsage(supabase, companyId, userId, model, 0, 0, "error", `Anthropic ${response.status}`);
      }

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: response.status === 429 ? 429 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.content
      ?.filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n") || "";

    // ── Log success ──────────────────────────────────────
    if (companyId) {
      await logUsage(
        supabase, companyId, userId,
        data.model || model,
        data.usage?.input_tokens || 0,
        data.usage?.output_tokens || 0,
        "success"
      );
    }

    // ── Update agent usage stats ─────────────────────────
    if (agentConfig.id) {
      await supabase
        .from("agents")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", agentConfig.id)
        .then(() => {})
        .catch(() => {});
    }

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Agent chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
