/**
 * Claude Invocation Policy Layer
 * ------------------------------------------------------------------
 * Centralized decision path for every AI-triggering action in naitive.
 * Callers describe WHAT they want (an "AI intent") and this module
 * classifies it into one of five request classes:
 *
 *   1. `deterministic`         — answerable from existing data/logic,
 *                                no model call needed.
 *   2. `cached`                — a valid, non-expired cache entry
 *                                exists (server- or client-side).
 *   3. `lightweight_transform` — trivial local transform (string
 *                                normalization, formatting, dedup)
 *                                that must not hit Claude.
 *   4. `claude_reasoning`      — genuine reasoning/summarization/Q&A;
 *                                route synchronously through
 *                                `claude-gateway`.
 *   5. `claude_async`          — long-running / not latency-sensitive;
 *                                enqueue via the `ai_jobs` queue and
 *                                let the worker call `claude-gateway`.
 *
 * All current and future AI features MUST resolve their execution
 * path via `resolveInvocation` (or `runInvocation`) so that:
 *   - deterministic answers never spend Claude tokens
 *   - cached answers are served without a network round-trip
 *   - only true reasoning tasks reach the gateway
 *   - async workloads land on the job queue automatically
 *
 * Every helper here is pure and unit-safe (no React, no supabase
 * client imports at module scope), so this file can be re-used by
 * the deal assistant, analysis panels, dashboard widgets, tests,
 * and future edge-function-side callers.
 */

import {
  sendClaudeMessage,
  sendClaudeMessageDebounced,
  type ClaudeRequestOptions,
  type ClaudeResponse,
} from "@/services/claude";

export type InvocationClass =
  | "deterministic"
  | "cached"
  | "lightweight_transform"
  | "claude_reasoning"
  | "claude_async";

/** Latency profile — informs sync vs async routing. */
export type LatencyProfile = "interactive" | "background";

/**
 * Describes a single AI-triggered action. Callers construct one of
 * these instead of calling `sendClaudeMessage` directly.
 *
 * `deterministicResolver` and `cacheLookup` let callers plug their
 * feature-specific fast paths into the same policy pipeline without
 * this file having to know about them.
 */
export interface AiIntent<TResult = string> {
  /** Stable feature id, e.g. "deal_assistant.qa", "insights.summary". */
  feature: string;
  /** Free-form action name, e.g. "answer_question", "regenerate". */
  action: string;
  /** Interactive (blocks UI) vs background (fire-and-forget). */
  latency?: LatencyProfile;
  /**
   * Return a value (any non-nullish) to short-circuit the pipeline with
   * a deterministic answer. Return `undefined`/`null` to fall through.
   */
  deterministicResolver?: () => TResult | null | undefined | Promise<TResult | null | undefined>;
  /**
   * Return a value to short-circuit with a cached answer. Same semantics
   * as `deterministicResolver`. Server-side gateway caching still runs
   * even when this is omitted — this hook exists for client-side caches
   * (react-query, in-memory memo, localStorage, etc.).
   */
  cacheLookup?: () => TResult | null | undefined | Promise<TResult | null | undefined>;
  /**
   * Optional local transform — a pure, side-effect-free operation the
   * feature can perform without any AI. If this returns a value, we
   * classify as `lightweight_transform` and skip Claude entirely.
   */
  lightweightTransform?: () => TResult | null | undefined;
  /**
   * The Claude request to make if none of the fast paths hit. Omit to
   * assert that this intent MUST be resolvable without Claude — if the
   * pipeline falls through, `runInvocation` throws.
   */
  claudeRequest?: ClaudeRequestOptions;
  /**
   * When true and `claudeRequest` is present, enqueue via the async
   * `ai_jobs` pipeline instead of calling the gateway inline. Callers
   * can also set `latency: "background"` and let the policy decide.
   */
  async?: boolean;
  /**
   * Optional debounce (ms) for text-input-triggered calls. When set
   * with a `panelKey`, uses `sendClaudeMessageDebounced` so keystrokes
   * collapse into a single request.
   */
  debounceMs?: number;
}

export interface InvocationDecision<TResult = string> {
  class: InvocationClass;
  /** Human-readable reason, useful for logs and debugging. */
  reason: string;
  /** Present when class is deterministic / cached / lightweight_transform. */
  value?: TResult;
}

/**
 * Classify an intent WITHOUT executing anything. Runs the fast-path
 * resolvers in priority order and returns the first hit. Pure and
 * unit-safe — no Claude call is made here.
 */
export async function resolveInvocation<TResult = string>(
  intent: AiIntent<TResult>,
): Promise<InvocationDecision<TResult>> {
  // 1. Deterministic lookup — answerable from existing naitive data.
  if (intent.deterministicResolver) {
    const v = await intent.deterministicResolver();
    if (v !== null && v !== undefined) {
      return { class: "deterministic", reason: "deterministic resolver hit", value: v };
    }
  }

  // 2. Cached response — client-side cache hit.
  if (intent.cacheLookup) {
    const v = await intent.cacheLookup();
    if (v !== null && v !== undefined) {
      return { class: "cached", reason: "client cache hit", value: v };
    }
  }

  // 3. Lightweight local transform — no model needed.
  if (intent.lightweightTransform) {
    const v = intent.lightweightTransform();
    if (v !== null && v !== undefined) {
      return { class: "lightweight_transform", reason: "local transform sufficed", value: v };
    }
  }

  // 4. / 5. Claude required. Route sync vs async.
  if (!intent.claudeRequest) {
    return {
      class: "deterministic",
      reason:
        "no claudeRequest provided and no fast path resolved — caller asserted no Claude needed",
    };
  }

  const async =
    intent.async === true || intent.latency === "background";
  return {
    class: async ? "claude_async" : "claude_reasoning",
    reason: async
      ? "background workload — enqueue via ai_jobs"
      : "genuine reasoning required — route via claude-gateway",
  };
}

/** Result envelope returned by `runInvocation`. */
export type InvocationResult<TResult = string> =
  | { class: "deterministic" | "cached" | "lightweight_transform"; value: TResult }
  | { class: "claude_reasoning"; response: ClaudeResponse }
  | { class: "claude_async"; enqueued: true; note: string };

/**
 * Execute an intent through the policy pipeline. Fast paths short
 * circuit before any network call. Only genuine reasoning intents
 * reach `claude-gateway`, and only truly background ones are marked
 * for async enqueue.
 *
 * NOTE: This helper does NOT itself enqueue the async job — that
 * requires the caller's own domain payload (deal id, entity ids,
 * dedupe key). It returns a decision the caller uses to invoke
 * `ai-job-enqueue`. This keeps the policy layer free of supabase
 * client dependencies and unit-safe.
 */
export async function runInvocation<TResult = string>(
  intent: AiIntent<TResult>,
): Promise<InvocationResult<TResult>> {
  const decision = await resolveInvocation(intent);

  if (
    decision.class === "deterministic" ||
    decision.class === "cached" ||
    decision.class === "lightweight_transform"
  ) {
    if (decision.value === undefined) {
      throw new Error(
        `[claude-policy] ${intent.feature}/${intent.action}: classified as ${decision.class} but produced no value`,
      );
    }
    return { class: decision.class, value: decision.value };
  }

  if (decision.class === "claude_async") {
    return {
      class: "claude_async",
      enqueued: true,
      note: `enqueue ${intent.feature}/${intent.action} via ai-job-enqueue`,
    };
  }

  // Sync reasoning path.
  if (!intent.claudeRequest) {
    throw new Error(
      `[claude-policy] ${intent.feature}/${intent.action}: reasoning class without claudeRequest`,
    );
  }

  const req = intent.claudeRequest;
  const panelKey = req.requestManager?.panelKey;
  const response =
    intent.debounceMs && panelKey
      ? await sendClaudeMessageDebounced(panelKey, intent.debounceMs, req)
      : await sendClaudeMessage(req);

  return { class: "claude_reasoning", response };
}

/**
 * Type guard — narrows an `InvocationResult` to the Claude reasoning
 * branch so callers can access `.response` safely.
 */
export function isClaudeReasoningResult<T>(
  r: InvocationResult<T>,
): r is Extract<InvocationResult<T>, { class: "claude_reasoning" }> {
  return r.class === "claude_reasoning";
}

/**
 * Type guard — narrows to any of the non-Claude fast-path branches
 * (deterministic / cached / lightweight_transform) whose payload
 * shape is `{ value: T }`.
 */
export function isFastPathResult<T>(
  r: InvocationResult<T>,
): r is Extract<
  InvocationResult<T>,
  { class: "deterministic" | "cached" | "lightweight_transform" }
> {
  return (
    r.class === "deterministic" ||
    r.class === "cached" ||
    r.class === "lightweight_transform"
  );
}

/**
 * Convenience builders — each returns a well-typed `AiIntent` so
 * feature code stays declarative. They're intentionally thin: the
 * heavy lifting is `runInvocation` above.
 */
export const AiIntents = {
  deterministic<T>(
    feature: string,
    action: string,
    resolver: AiIntent<T>["deterministicResolver"],
  ): AiIntent<T> {
    return { feature, action, deterministicResolver: resolver };
  },
  cached<T>(
    feature: string,
    action: string,
    lookup: AiIntent<T>["cacheLookup"],
    fallback?: ClaudeRequestOptions,
  ): AiIntent<T> {
    return { feature, action, cacheLookup: lookup, claudeRequest: fallback };
  },
  reasoning(
    feature: string,
    action: string,
    request: ClaudeRequestOptions,
    opts?: Pick<AiIntent, "debounceMs" | "latency">,
  ): AiIntent<string> {
    return {
      feature,
      action,
      claudeRequest: request,
      debounceMs: opts?.debounceMs,
      latency: opts?.latency,
    };
  },
  async(
    feature: string,
    action: string,
    request: ClaudeRequestOptions,
  ): AiIntent<string> {
    return { feature, action, claudeRequest: request, async: true, latency: "background" };
  },
};
