// ── Deal Admin Agent · model response cache + in-flight dedupe ──────────────
// The agent re-analyzes the same deals on every sweep. When neither the deal
// signals nor the prompt changed, the model input is byte-identical and the
// output is deterministic for our purposes — so we serve the previous raw
// response instead of paying for another call.
//
// Two layers:
//   1. In-flight dedupe (per isolate): concurrent callers with the same
//      signature share ONE promise instead of firing N identical requests.
//   2. Persistent response cache (`public.claude_response_cache`): repeat
//      signatures within the TTL window read the stored raw response.
//
// Cache key = sha256(company_id + deal_id + system prompt + normalized prompt).
// Company-scoped (not user-scoped) on purpose: the deal signal bundle is
// company data, so two users sweeping the same deal see the same input.
//
// User-visible behavior is unchanged: a cache hit returns the exact raw
// model output that a fresh call produced for the identical input.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

/** Repeat sweeps of an unchanged deal are common; 6h keeps them off the API. */
export const DEAL_ADMIN_AGENT_TTL_SECONDS = Number(
  Deno.env.get("DEAL_ADMIN_AGENT_CACHE_TTL_SECONDS") ?? 6 * 60 * 60,
);

const CACHE_MODE = "deal_admin_agent";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

function svc() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Collapse whitespace so cosmetic formatting differences don't miss the cache. */
function normalize(text: string): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

export async function computeDealAdminAgentSignature(params: {
  companyId?: string | null;
  dealId?: string | null;
  system: string;
  prompt: string;
}): Promise<string> {
  return await sha256Hex(JSON.stringify({
    v: 1,
    mode: CACHE_MODE,
    company: params.companyId ?? null,
    deal: params.dealId ?? null,
    system: normalize(params.system),
    prompt: normalize(params.prompt),
  }));
}

async function lookup(signature: string): Promise<string | null> {
  try {
    const client = svc();
    const { data } = await client
      .from("claude_response_cache")
      .select("response, hit_count, expires_at")
      .eq("signature", signature)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data?.response) return null;
    void client
      .from("claude_response_cache")
      .update({ hit_count: (data.hit_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("signature", signature);
    return data.response as string;
  } catch (err) {
    console.error("[deal-admin-agent-cache] lookup failed:", err);
    return null;
  }
}

async function store(params: {
  signature: string;
  companyId?: string | null;
  userId?: string | null;
  dealId?: string | null;
  response: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  ttlSeconds: number;
}): Promise<void> {
  try {
    await svc().from("claude_response_cache").upsert({
      signature: params.signature,
      company_id: params.companyId ?? null,
      user_id: params.userId ?? SYSTEM_USER_ID,
      mode: CACHE_MODE,
      deal_id: params.dealId ?? null,
      response: params.response,
      model: params.model ?? null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      hit_count: 0,
      expires_at: new Date(Date.now() + params.ttlSeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "signature" });
  } catch (err) {
    console.error("[deal-admin-agent-cache] write failed:", err);
  }
}

/** Per-isolate in-flight map: identical signatures share one live request. */
const inFlight = new Map<string, Promise<{
  raw: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}>>();

export interface CachedModelResult {
  raw: string;
  cacheStatus: "hit" | "inflight" | "miss" | "bypass";
}

/**
 * Runs `exec` unless an identical (company, deal, system, prompt) request is
 * already in flight or cached. Returns the raw model text either way.
 */
export async function cachedDealAdminAgentCall(
  params: {
    companyId?: string | null;
    userId?: string | null;
    dealId?: string | null;
    system: string;
    prompt: string;
    bypass?: boolean;
    ttlSeconds?: number;
  },
  exec: () => Promise<{
    raw: string;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }>,
): Promise<CachedModelResult> {
  if (params.bypass) {
    const fresh = await exec();
    return { raw: fresh.raw, cacheStatus: "bypass" };
  }

  const signature = await computeDealAdminAgentSignature(params);
  const ttlSeconds = params.ttlSeconds ?? DEAL_ADMIN_AGENT_TTL_SECONDS;

  const pending = inFlight.get(signature);
  if (pending) {
    const shared = await pending;
    console.log(`[deal-admin-agent-cache] inflight-share ${signature.slice(0, 12)}`);
    return { raw: shared.raw, cacheStatus: "inflight" };
  }

  const cached = await lookup(signature);
  if (cached !== null) {
    console.log(`[deal-admin-agent-cache] hit ${signature.slice(0, 12)}`);
    return { raw: cached, cacheStatus: "hit" };
  }

  const run = exec();
  inFlight.set(signature, run);
  try {
    const result = await run;
    if (result.raw && result.raw.trim().length > 0) {
      await store({
        signature,
        companyId: params.companyId,
        userId: params.userId,
        dealId: params.dealId,
        response: result.raw,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        ttlSeconds,
      });
    }
    console.log(`[deal-admin-agent-cache] miss→stored ${signature.slice(0, 12)}`);
    return { raw: result.raw, cacheStatus: "miss" };
  } finally {
    inFlight.delete(signature);
  }
}
