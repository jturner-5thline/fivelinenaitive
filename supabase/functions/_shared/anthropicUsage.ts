// ── Anthropic usage logging wrapper ──────────────────────────────────────
// Single choke point for EVERY Anthropic API call made from edge functions.
// Wraps `fetch("https://api.anthropic.com/v1/messages", init)` and writes a
// row into `public.claude_usage_logs` with model, latency, token usage and
// cache-token counts. Best-effort: logging failures never affect the caller.
//
// Usage (drop-in replacement for the raw fetch):
//   import { anthropicFetch } from "../_shared/anthropicUsage.ts";
//   const res = await anthropicFetch({ feature: "deal-space-ai", userId }, {
//     method: "POST", headers: {...}, body: JSON.stringify(payload),
//   });
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Beta header that enables prompt caching. Harmless when no markers exist. */
export const PROMPT_CACHING_BETA = "prompt-caching-2024-07-31";

/**
 * Anthropic only caches prefixes of at least ~1024 tokens (Sonnet/Opus).
 * ~4 chars per token, plus headroom so we never pay the 25% cache-write
 * premium on a block that is too small to ever be cached.
 */
const MIN_CACHEABLE_CHARS = 5_000;

type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

function hasCacheControl(blocks: SystemBlock[]): boolean {
  return blocks.some((b) => !!b?.cache_control);
}

/**
 * Marks the (large, repeated) system prompt as an `ephemeral` cache block so
 * follow-up turns read the prefix from Anthropic's cache instead of re-sending
 * tens of thousands of input tokens.
 *
 * Applied centrally here so every edge function that talks to Anthropic gets
 * caching without touching each call site. Callers that already build their
 * own `system` block array with a `cache_control` marker (claude-gateway) are
 * left untouched.
 *
 * Caveat for call sites: the cached prefix must be byte-identical across
 * turns. Never interpolate timestamps, request ids, or the user's current
 * question into the system prompt — put those in the messages array.
 */
export function applyPromptCaching(body: unknown): { body: unknown; cached: boolean } {
  if (!body || typeof body !== "object") return { body, cached: false };
  const b = body as Record<string, unknown>;
  const system = b.system;

  if (typeof system === "string") {
    if (system.length < MIN_CACHEABLE_CHARS) return { body, cached: false };
    return {
      body: {
        ...b,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      },
      cached: true,
    };
  }

  if (Array.isArray(system) && system.length > 0) {
    const blocks = system as SystemBlock[];
    if (hasCacheControl(blocks)) return { body, cached: true };
    const chars = blocks.reduce((n, s) => n + (typeof s?.text === "string" ? s.text.length : 0), 0);
    if (chars < MIN_CACHEABLE_CHARS) return { body, cached: false };
    const next = blocks.map((s, i) =>
      i === blocks.length - 1 ? { ...s, cache_control: { type: "ephemeral" as const } } : s
    );
    return { body: { ...b, system: next }, cached: true };
  }

  return { body, cached: false };
}

export interface AnthropicUsageContext {
  /** Stable feature key — use the edge function name unless a finer label helps. */
  feature: string;
  userId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  promptMode?: string | null;
  signature?: string | null;
  cacheMode?: string | null;
  cacheStatus?: "hit" | "miss" | "refresh" | "off";
  cacheHit?: boolean;
  /** Override model when it is not present in the request body. */
  model?: string | null;
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Keep the insert alive after the handler returns. Edge functions are torn
 * down as soon as the response is sent, which silently drops plain
 * fire-and-forget promises — `waitUntil` is what makes logging reliable.
 */
function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
  else void p;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function logAnthropicUsage(row: {
  ctx: AnthropicUsageContext;
  model?: string | null;
  latencyMs: number;
  usage?: Record<string, unknown> | null;
  status: "success" | "error";
  httpStatus?: number | null;
  errorMessage?: string | null;
}) {
  try {
    const u = (row.usage ?? {}) as Record<string, number | undefined>;
    const { ctx } = row;
    const { error } = await serviceClient().from("claude_usage_logs").insert({
      user_id: isUuid(ctx.userId) ? ctx.userId : null,
      company_id: isUuid(ctx.companyId) ? ctx.companyId : null,
      deal_id: isUuid(ctx.dealId) ? ctx.dealId : null,
      feature: ctx.feature,
      prompt_mode: ctx.promptMode ?? null,
      signature: ctx.signature ?? null,
      cache_mode: ctx.cacheMode ?? null,
      cache_status: ctx.cacheStatus ?? "off",
      cache_hit: ctx.cacheHit ?? false,
      model: row.model ?? ctx.model ?? null,
      latency_ms: Math.max(0, Math.round(row.latencyMs)),
      input_tokens: u.input_tokens ?? null,
      output_tokens: u.output_tokens ?? null,
      prompt_cache_read_tokens: u.cache_read_input_tokens ?? null,
      prompt_cache_create_tokens: u.cache_creation_input_tokens ?? null,
      status: row.status,
      http_status: row.httpStatus ?? null,
      error_message: row.errorMessage ? String(row.errorMessage).slice(0, 1000) : null,
    });
    if (error) console.error("[anthropicUsage] insert error:", error.message);
  } catch (err) {
    console.error("[anthropicUsage] log failed:", err);
  }
}

/**
 * Drop-in wrapper around the Anthropic Messages API that always logs usage.
 * Non-streaming JSON responses are cloned to read `usage`; streaming responses
 * are logged without token counts (the body is never consumed).
 */
export async function anthropicFetch(
  ctx: AnthropicUsageContext,
  init: RequestInit,
  url: string = ANTHROPIC_MESSAGES_URL,
): Promise<Response> {
  const started = Date.now();
  let model: string | null = ctx.model ?? null;
  let streaming = false;
  let requestInit = init;
  let cacheEnabled = false;
  try {
    if (typeof init.body === "string") {
      const parsed = JSON.parse(init.body);
      model = parsed?.model ?? model;
      streaming = parsed?.stream === true;
      const { body: nextBody, cached } = applyPromptCaching(parsed);
      cacheEnabled = cached;
      if (cached) {
        const headers = new Headers(init.headers as HeadersInit | undefined);
        if (!headers.has("anthropic-beta")) headers.set("anthropic-beta", PROMPT_CACHING_BETA);
        requestInit = { ...init, headers, body: JSON.stringify(nextBody) };
      }
    }
  } catch { /* body not JSON — fine */ }

  try {
    const res = await fetch(url, requestInit);
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      let errorMessage: string | null = null;
      try {
        errorMessage = await res.clone().text();
      } catch { /* ignore */ }
      background(logAnthropicUsage({
        ctx: { ...ctx, cacheMode: cacheEnabled ? "ephemeral" : ctx.cacheMode ?? null },
        model, latencyMs, status: "error",
        httpStatus: res.status, errorMessage,
      }));
      return res;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (streaming || !contentType.includes("application/json")) {
      background(logAnthropicUsage({
        ctx: { ...ctx, cacheMode: cacheEnabled ? "ephemeral" : ctx.cacheMode ?? null },
        model, latencyMs, status: "success", httpStatus: res.status,
      }));
      return res;
    }

    // Read usage off a clone so the caller's body stays intact.
    let usage: Record<string, unknown> | null = null;
    let respModel = model;
    try {
      const json = await res.clone().json();
      usage = json?.usage ?? null;
      respModel = json?.model ?? model;
    } catch { /* ignore */ }
    // Derive real cache outcome from the response so the usage dashboard
    // reports actual hit rates instead of the caller's guess.
    const cacheRead = Number((usage as any)?.cache_read_input_tokens ?? 0);
    const cacheWrite = Number((usage as any)?.cache_creation_input_tokens ?? 0);
    const observedCtx: AnthropicUsageContext = {
      ...ctx,
      cacheMode: cacheEnabled ? "ephemeral" : ctx.cacheMode ?? null,
      cacheStatus: cacheRead > 0
        ? "hit"
        : cacheWrite > 0
          ? "refresh"
          : cacheEnabled
            ? "miss"
            : ctx.cacheStatus ?? "off",
      cacheHit: cacheRead > 0 ? true : ctx.cacheHit ?? false,
    };
    background(logAnthropicUsage({
      ctx: observedCtx, model: respModel, latencyMs, usage, status: "success", httpStatus: res.status,
    }));

    return res;
  } catch (err) {
    background(logAnthropicUsage({
      ctx,
      model,
      latencyMs: Date.now() - started,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    }));
    throw err;
  }
}
