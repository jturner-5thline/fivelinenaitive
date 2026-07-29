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
  context?: string;
}

// Feature key normalisation: "financial-analysis" → "financial_analysis"
function normalizeFeatureKey(context: string): string {
  return context.replace(/-/g, "_");
}

// Compile firm-level Copilot Instructions into a system-prompt prefix.
// Mirrors src/lib/copilotInstructions.ts (kept inline to avoid cross-runtime imports).
function compileCopilotInstructions(raw: any): string {
  const TONE_GUIDANCE: Record<string, string> = {
    professional_concise:
      "Use a professional, concise tone. Skip preamble. Favor short sentences and scannable bullets. Be direct and action-oriented.",
    formal:
      "Use a formal, polished tone appropriate for institutional capital partners. Avoid slang and contractions. Prefer complete sentences and measured language.",
    casual:
      "Use a casual, conversational tone. Plain language, contractions are fine. Stay accurate, but feel free to be friendly.",
  };
  const r = raw && typeof raw === "object" ? raw : {};
  const company =
    typeof r.company_description === "string" && r.company_description.trim().length > 0
      ? r.company_description.trim()
      : "";
  const stagesArr = Array.isArray(r.lifecycle_stages) ? r.lifecycle_stages : [];
  const stages = stagesArr
    .map((s: any) => (typeof s === "string" ? { name: s, description: "" } : s))
    .filter((s: any) => s && typeof s.name === "string" && s.name.trim().length > 0);
  const tone = ["professional_concise", "formal", "casual"].includes(r.tone) ? r.tone : "professional_concise";
  const team = typeof r.team_structure === "string" ? r.team_structure.trim() : "";
  const custom = typeof r.custom_instructions === "string" ? r.custom_instructions.trim() : "";
  if (!company && stages.length === 0 && !team && !custom) return "";
  const parts: string[] = [];
  if (company) parts.push("## Firm Profile", company, "");
  if (stages.length > 0) {
    parts.push("## Deal Lifecycle Stages");
    parts.push(
      stages
        .map((s: any, i: number) => `${i + 1}. ${s.name}${s.description ? ` — ${s.description}` : ""}`)
        .join("\n"),
    );
    parts.push("");
  }
  parts.push("## Communication Tone", TONE_GUIDANCE[tone], "");
  if (team) parts.push("## Team Structure", team, "");
  if (custom) parts.push("## Custom Instructions", custom);
  return parts.join("\n").trim();
}

// Best-effort usage log — never blocks the response
async function logUsage(
  supabase: any,
  companyId: string,
  userId: string,
  feature: string,
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
      feature,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      status,
      error_message: errorMessage ?? null,
    });
  } catch (err) {
    console.error("Failed to log AI usage:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Shared state for usage logging on error paths
  let userId: string | undefined;
  let companyId: string | undefined;
  let feature = "chat";
  let model = "claude-sonnet-4-5-20250929";

  try {
    // ── Auth ──────────────────────────────────────────────
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    userId = user.id;

    // ── Company scoping ──────────────────────────────────
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    companyId = membership?.company_id;

    // ── Parse & validate request ─────────────────────────
    const body: ClaudeRequest = await req.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalLength = body.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalLength > 100000) {
      return new Response(
        JSON.stringify({ success: false, error: "Message content too long (max 100k chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    feature = body.context || "chat";

    // ── Feature gating (server-side enforcement) ─────────
    let aiConfig: any = null;
    if (companyId) {
      const { data } = await supabase
        .from("ai_configuration")
        .select("*")
        .eq("company_id", companyId)
        .single();
      aiConfig = data;
    }

    if (aiConfig?.features_enabled) {
      const featureKey = normalizeFeatureKey(feature);
      if (aiConfig.features_enabled[featureKey] === false) {
        // Log the rejected request
        if (companyId && userId) {
          await logUsage(supabase, companyId, userId, feature, model, 0, 0, "error", `Feature ${feature} disabled`);
        }
        return new Response(
          JSON.stringify({ success: false, error: `AI ${feature} feature is disabled for your organization` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Anthropic API key (server-side only) ─────────────
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      if (companyId && userId) {
        await logUsage(supabase, companyId, userId, feature, model, 0, 0, "error", "ANTHROPIC_API_KEY not configured");
      }
      return new Response(
        JSON.stringify({ success: false, error: "AI service is not configured. Contact your administrator." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Resolve model & params ───────────────────────────
    model = aiConfig?.default_model || "claude-sonnet-4-5-20250929";
    const temperature = body.temperature ?? aiConfig?.default_temperature ?? 0.7;
    const maxTokens = Math.min(body.max_tokens ?? aiConfig?.max_tokens ?? 4096, 8192);

    // ── Build Anthropic request ──────────────────────────
    const anthropicBody: any = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    const copilotPrefix = compileCopilotInstructions(aiConfig?.copilot_instructions);
    const composedSystem = [copilotPrefix, body.system?.trim()].filter(Boolean).join("\n\n");
    if (composedSystem) {
      anthropicBody.system = composedSystem;
    }

    // ── Call Anthropic with timeout ──────────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000); // 55s (edge fn limit ~60s)

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const errMsg = fetchErr instanceof Error && fetchErr.name === "AbortError"
        ? "AI request timed out"
        : "Failed to reach AI service";

      if (companyId && userId) {
        await logUsage(supabase, companyId, userId, feature, model, 0, 0, "error", errMsg);
      }
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
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

      if (companyId && userId) {
        await logUsage(supabase, companyId, userId, feature, model, 0, 0, "error", `Anthropic ${response.status}: ${errorText.slice(0, 200)}`);
      }

      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: response.status === 429 ? 429 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse response ───────────────────────────────────
    const data = await response.json();

    const responseText = data.content
      ?.filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n") || "";

    const usage = {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    };

    // ── Log successful usage ─────────────────────────────
    if (companyId && userId) {
      await logUsage(
        supabase, companyId, userId, feature,
        data.model || model, usage.input_tokens, usage.output_tokens,
        "success"
      );
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
    const errMsg = error instanceof Error ? error.message : "Unknown error";

    // Best-effort failure log
    if (companyId && userId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await logUsage(supabase, companyId, userId, feature, model, 0, 0, "error", errMsg);
      } catch (_) { /* swallow */ }
    }

    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
