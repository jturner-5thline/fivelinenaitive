import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { REGISTRY, REGISTRY_BY_KEY, classifyByAlias, type ToolEntry } from "./registry.ts";
import { matchDeny, denyExplainer } from "./denyList.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

// 5th Line allow-list — feature flag default-on only for these companies.
const FEATURE_FLAG_ALLOWLIST = new Set<string>([
  // Populated server-side; if empty the flag falls back to company_settings.feature_flags.ai_settings_mutations.
]);

interface Body {
  prompt: string;
  company_id: string;
  context?: { route?: string; deal_id?: string };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isFlagOn(adminSb: ReturnType<typeof createClient>, companyId: string): Promise<boolean> {
  if (FEATURE_FLAG_ALLOWLIST.has(companyId)) return true;
  const { data } = await adminSb
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .maybeSingle();
  const v: any = (data?.value as any) ?? {};
  return v?.feature_flags?.ai_settings_mutations === true;
}

async function rateLimitDryRun(adminSb: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await adminSb
    .from("settings_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", userId)
    .eq("action", "dry_run")
    .gte("created_at", since);
  return (count ?? 0) >= 60;
}

async function llmClassify(prompt: string): Promise<{ tool_name: string; value: unknown; confidence: number } | null> {
  if (!LOVABLE_API_KEY) return null;
  const enumKeys = REGISTRY.map((t) => t.key);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              `Classify the user prompt as a settings change. Output JSON {"tool_name":string,"value":any,"confidence":0..1}. tool_name MUST be one of: ${enumKeys.join(", ")}. If no good match, set tool_name to "none" and confidence < 0.6.`,
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed?.tool_name || parsed.tool_name === "none") return null;
    if (!REGISTRY_BY_KEY[parsed.tool_name]) return null;
    return {
      tool_name: parsed.tool_name,
      value: parsed.value,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
    };
  } catch {
    return null;
  }
}

async function buildProposal(
  tool: ToolEntry,
  rawValue: unknown,
  prompt: string,
  confidence: number,
  userSb: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
) {
  const validation = tool.validator(rawValue);
  if (!validation.ok) {
    return { error: `Invalid value for ${tool.human_name}: ${validation.error}` };
  }
  const current = await tool.dry_run_query({ sb: userSb, company_id: companyId, user_id: userId });
  const diff_id = crypto.randomUUID();
  return {
    proposal: {
      diff_id,
      tool_name: tool.key,
      human_name: tool.human_name,
      description: tool.description,
      settings_tab: tool.settings_tab,
      target_table: tool.target_table,
      target_column: tool.target_column,
      scope: tool.scope,
      current_value: current,
      proposed_value: validation.value,
      args: { value: validation.value },
      json_schema: tool.json_schema,
      source_prompt: prompt,
      requires_role: "company_admin",
      confidence,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userSb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminSb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: userData, error: userErr } = await userSb.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const prompt = (body.prompt ?? "").trim();
  const company_id = body.company_id;
  if (!prompt || !company_id) return json({ error: "prompt and company_id required" }, 400);

  // Feature flag.
  if (!(await isFlagOn(adminSb, company_id))) {
    return json({
      ok: true,
      refusal: { reason: "feature_off", explainer: "AI settings edits aren't enabled for this workspace yet." },
    });
  }

  // Admin gate (defense in depth — UI also gates Accept).
  const { data: isAdmin } = await adminSb.rpc("is_company_admin", { _user_id: userId, _company_id: company_id });
  if (!isAdmin) {
    await adminSb.from("settings_audit_log").insert({
      company_id, actor_user_id: userId, tool_key: "router", action: "deny",
      reason: "not_admin", source_prompt: prompt,
    });
    return json({
      ok: true,
      refusal: { reason: "not_admin", explainer: "Only workspace admins can change settings from the AI bar." },
    });
  }

  // Deny-list pre-check.
  const deny = matchDeny(prompt);
  if (deny.denied) {
    await adminSb.from("settings_audit_log").insert({
      company_id, actor_user_id: userId, tool_key: "router", action: "deny",
      reason: `deny_listed:${deny.pattern}`, source_prompt: prompt,
    });
    return json({ ok: true, refusal: { reason: "deny_listed", explainer: denyExplainer(prompt) } });
  }

  // Rate-limit dry-runs.
  if (await rateLimitDryRun(adminSb, userId)) {
    return json({ ok: true, refusal: { reason: "rate_limited", explainer: "Too many AI settings requests in the last minute. Try again shortly." } });
  }

  // 1. Cheap classifier.
  let tool: ToolEntry | null = null;
  let rawValue: unknown = null;
  let confidence = 0;

  const cheap = classifyByAlias(prompt);
  if (cheap && cheap.rawValue !== null) {
    tool = cheap.tool;
    rawValue = cheap.rawValue;
    confidence = 0.95;
  }

  // 2. LLM fallback when cheap classifier is unsure.
  if (!tool) {
    const llm = await llmClassify(prompt);
    if (llm) {
      tool = REGISTRY_BY_KEY[llm.tool_name];
      rawValue = llm.value;
      confidence = llm.confidence;
    }
  }

  if (!tool || confidence < 0.6) {
    return json({
      ok: true,
      refusal: {
        reason: "low_confidence",
        explainer: "I'm not sure which setting you mean. Open Settings to make this change manually.",
      },
    });
  }

  const built = await buildProposal(tool, rawValue, prompt, confidence, userSb, company_id, userId);
  if ("error" in built) {
    return json({ ok: true, refusal: { reason: "invalid_value", explainer: built.error } });
  }

  // Audit the dry-run.
  await adminSb.from("settings_audit_log").insert({
    company_id,
    actor_user_id: userId,
    tool_key: tool.key,
    target_table: tool.target_table,
    target_column: tool.target_column,
    diff_id: built.proposal.diff_id,
    old_value: { value: built.proposal.current_value } as any,
    new_value: { value: built.proposal.proposed_value } as any,
    action: "dry_run",
    source_prompt: prompt,
    confidence,
  });

  return json({ ok: true, proposal: built.proposal });
});