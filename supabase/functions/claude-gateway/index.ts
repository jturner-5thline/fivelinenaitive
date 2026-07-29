// ─────────────────────────────────────────────────────────────────────────────
// claude-gateway — canonical server-side proxy for every Claude/Anthropic call
// originating from the naitive frontend.
//
// The frontend MUST NEVER call api.anthropic.com directly. All React code
// routes through `src/services/claude.ts` (`sendClaudeMessage`), which invokes
// this function. ANTHROPIC_API_KEY lives only in Supabase project secrets.
//
// This function replaces the prior `claude-ai` edge function as the frontend
// entrypoint. `claude-ai` remains deployed for backwards-compatibility with
// server-to-server callers and legacy references; new frontend code must
// target `claude-gateway`.
//
// Responsibilities:
//   - Auth: verify Supabase JWT (401 if missing/invalid)
//   - Request validation: shape + length caps (400 on violation)
//   - Feature gating: honor per-company ai_configuration.features_enabled
//   - Firm-level Copilot instructions injection
//   - Anthropic call with timeout + normalized error handling
//   - Response logging: ai_usage_logs (success + error)
// ─────────────────────────────────────────────────────────────────────────────
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
  /**
   * Optional response-cache metadata. Callers set this to opt into the
   * server-side cache for repeatable outputs (deal summaries, deal Q&A over
   * unchanged context, document summaries keyed to a version/hash, and the
   * daily rundown). Cache signatures are always scoped to company + user so
   * cached responses never leak across tenants or permission boundaries.
   */
  cache?: {
    /** One of: deal_summary | deal_qa | document_summary | daily_rundown */
    mode?: string;
    dealId?: string | null;
    documentIds?: string[];
    noteIds?: string[];
    emailIds?: string[];
    /** File hash / version tag for document_summary invalidation. */
    documentVersion?: string | null;
    /**
     * Opaque scope tag (e.g. daily rundown refresh date bucket) that lets
     * callers pin a cache entry to a logical scheduling window.
     */
    scopeTag?: string | null;
    /** Force a refresh: skip lookup but still write the fresh entry. */
    bypass?: boolean;
    /** Override TTL in seconds (optional; defaults follow mode). */
    ttlSeconds?: number;
  };
}

// Feature key normalisation: "financial-analysis" → "financial_analysis"
function normalizeFeatureKey(context: string): string {
  return context.replace(/-/g, "_");
}

// ── Response cache ──────────────────────────────────────────────────────────
// Server-side cache for repeatable Claude outputs. Cache keys are derived
// from a deterministic signature that includes the company + user scope so
// results never cross tenant or permission boundaries. Frontend callers opt
// in per-request via ClaudeRequest.cache; when omitted, no cache is used.
//
// TTLs are chosen per mode:
//   deal_summary      → 10 minutes
//   deal_qa           → 5 minutes  (invalidates naturally if selected doc/
//                                    note/email ids change)
//   document_summary  → 7 days     (bounded by documentVersion in signature —
//                                    a version bump forces a fresh entry)
//   daily_rundown     → 24 hours   (bounded by scopeTag = refresh date; the
//                                    next scheduled refresh yields a new key)
const DEFAULT_TTL_SECONDS: Record<string, number> = {
  deal_summary: 10 * 60,
  deal_qa: 5 * 60,
  document_summary: 7 * 24 * 60 * 60,
  daily_rundown: 24 * 60 * 60,
};

function normalizePrompt(messages: ClaudeMessage[]): string {
  return messages
    .map((m) => `${m.role}:${(m.content ?? "").trim().replace(/\s+/g, " ")}`)
    .join("\n");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeCacheSignature(
  companyId: string | undefined,
  userId: string,
  system: string,
  body: ClaudeRequest,
): Promise<string | null> {
  const c = body.cache;
  if (!c || !c.mode) return null;
  const payload = {
    v: 1,
    company: companyId ?? null,
    user: userId, // user-scope keeps permission boundaries strict
    mode: c.mode,
    context: body.context ?? null,
    dealId: c.dealId ?? null,
    docs: [...(c.documentIds ?? [])].sort(),
    notes: [...(c.noteIds ?? [])].sort(),
    emails: [...(c.emailIds ?? [])].sort(),
    documentVersion: c.documentVersion ?? null,
    scopeTag: c.scopeTag ?? null,
    system,
    prompt: normalizePrompt(body.messages),
  };
  return sha256Hex(JSON.stringify(payload));
}

/** service-role client for cache table access (bypasses RLS deliberately). */
function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function lookupCachedResponse(signature: string, companyId: string | undefined, userId: string) {
  try {
    const svc = serviceClient();
    const { data } = await svc
      .from("claude_response_cache")
      .select("signature, response, model, input_tokens, output_tokens, company_id, user_id, expires_at, hit_count")
      .eq("signature", signature)
      .maybeSingle();
    if (!data) return null;
    // Defensive: reject any cross-tenant / cross-user match (should be
    // impossible because signature already includes both).
    if ((data.company_id ?? null) !== (companyId ?? null)) return null;
    if (data.user_id !== userId) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    // best-effort touch (non-atomic hit_count bump is fine here)
    svc.from("claude_response_cache")
      .update({ hit_count: ((data as any).hit_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("signature", signature)
      .then(() => {}, () => {});
    return data;
  } catch (err) {
    console.error("cache lookup failed:", err);
    return null;
  }
}

async function writeCachedResponse(params: {
  signature: string;
  companyId: string | undefined;
  userId: string;
  mode: string;
  dealId: string | null;
  response: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ttlSeconds: number;
}) {
  try {
    const svc = serviceClient();
    const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000).toISOString();
    await svc.from("claude_response_cache").upsert({
      signature: params.signature,
      company_id: params.companyId ?? null,
      user_id: params.userId,
      mode: params.mode,
      deal_id: params.dealId,
      response: params.response,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "signature" });
  } catch (err) {
    console.error("cache write failed:", err);
  }
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

    // ── Response cache lookup ────────────────────────────
    // Compute the deterministic signature first so both hit and miss paths
    // can log the cache_status consistently.
    const cacheMode = body.cache?.mode;
    const cacheBypass = body.cache?.bypass === true;
    // System prompt participates in signature (feature gating may inject
    // Copilot Instructions later, but those are company-scoped and the
    // signature already includes company_id).
    const signature = cacheMode
      ? await computeCacheSignature(companyId, userId!, body.system ?? "", body)
      : null;

    if (signature && !cacheBypass) {
      const hit = await lookupCachedResponse(signature, companyId, userId!);
      if (hit) {
        console.log(`[claude-gateway] cache_status=hit mode=${cacheMode} sig=${signature.slice(0, 12)}`);
        if (companyId && userId) {
          await logUsage(
            supabase, companyId, userId, feature,
            hit.model || model, 0, 0, "success",
            `cache_hit:${cacheMode}`,
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            response: hit.response,
            usage: { input_tokens: 0, output_tokens: 0 },
            model: hit.model || model,
            cache_status: "hit",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const cacheStatus: "miss" | "refresh" | "off" =
      !signature ? "off" : cacheBypass ? "refresh" : "miss";
    if (signature) {
      console.log(`[claude-gateway] cache_status=${cacheStatus} mode=${cacheMode} sig=${signature.slice(0, 12)}`);
    }

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
        "success",
        signature ? `cache_${cacheStatus}:${cacheMode}` : undefined,
      );
    }

    // ── Cache write (best effort) ────────────────────────
    if (signature && cacheMode) {
      const ttl = body.cache?.ttlSeconds
        ?? DEFAULT_TTL_SECONDS[cacheMode]
        ?? 5 * 60;
      await writeCachedResponse({
        signature,
        companyId,
        userId: userId!,
        mode: cacheMode,
        dealId: body.cache?.dealId ?? null,
        response: responseText,
        model: data.model || model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        ttlSeconds: ttl,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: responseText,
        usage,
        model: data.model || model,
        cache_status: cacheStatus,
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
