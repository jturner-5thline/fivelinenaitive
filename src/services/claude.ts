import { supabase } from "@/integrations/supabase/client";
import { logUsage } from "@/lib/usageLogger";
import { logActivity } from "@/lib/activityLogger";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequestOptions {
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  max_tokens?: number;
  context?: "chat" | "financial-analysis" | "agent" | "workflow" | "deal-assistant";
  /**
   * Prompt-cache mode selector. Picks a stable server-side template in
   * `claude-gateway/prompts.ts` — e.g. "deal_assistant", "deal_qa",
   * "deal_summary", "financial_analysis", "document_summary",
   * "daily_rundown". The template is placed first in the system prefix
   * and marked as a cache breakpoint so byte-identical prefixes reuse
   * Anthropic's prompt cache across requests.
   */
  promptMode?:
    | "chat"
    | "deal_assistant"
    | "deal_qa"
    | "deal_summary"
    | "financial_analysis"
    | "document_summary"
    | "daily_rundown"
    | "agent"
    | "workflow";
  /**
   * Stable, byte-identical addition to the system prefix (feature-scoped
   * rules that never change per request). Sits BEFORE the cache
   * breakpoint. Never put timestamps, ids, or the user's question here —
   * that would invalidate the cache on every call.
   */
  staticSystem?: string;
  /**
   * Dynamic system text (per-request timestamps, ad-hoc UI state, one-off
   * variables). Sits AFTER the cache breakpoint so it never invalidates
   * the cached prefix. Prefer putting the user's latest question in
   * `messages`; use this only for per-request context that must live
   * outside the turn.
   */
  dynamicSystem?: string;
  /**
   * Opt into the server-side response cache in `claude-gateway`. Set `mode`
   * to one of the TTL-governed cache buckets:
   *   - `deal_summary`      → 10 min
   *   - `deal_qa`           → 5 min (invalidates automatically when the
   *                                   selected doc/note/email ids change)
   *   - `document_summary`  → keyed by `documentVersion`; reused until the
   *                            document's version/hash changes
   *   - `daily_rundown`     → until the next refresh window (pass a
   *                            `scopeTag` like today's ET date bucket)
   *
   * Cache signatures always include the current company + user, so entries
   * never cross tenant or permission boundaries. Set `bypass: true` for an
   * explicit "regenerate" action — the cache is skipped for lookup but the
   * fresh response is still written.
   */
  cache?: {
    mode: "deal_summary" | "deal_qa" | "document_summary" | "daily_rundown";
    dealId?: string | null;
    documentIds?: string[];
    noteIds?: string[];
    emailIds?: string[];
    documentVersion?: string | null;
    scopeTag?: string | null;
    bypass?: boolean;
    ttlSeconds?: number;
  };
  /** Optional usage-logging hints. Not sent to the AI. */
  usage?: {
    feature_subtype?: string;
    deal_id?: string | null;
    skip?: boolean;
  };
  /**
   * Client-side request-manager options — not sent to the edge function.
   * See `sendClaudeMessage` for behavior.
   */
  requestManager?: {
    /**
     * Groups requests by panel/component. When a newer request with the same
     * panelKey is issued, older in-flight requests resolve with the stale
     * sentinel (`CLAUDE_STALE_ERROR`) so callers can ignore them.
     */
    panelKey?: string;
    /**
     * Custom in-flight dedupe key. Defaults to a hash of the request payload.
     * Two callers issuing the same signature share one in-flight promise.
     */
    dedupeKey?: string;
    /** Disable dedupe/panel tracking for a specific call. */
    bypass?: boolean;
  };
}

export interface ClaudeResponse {
  success: boolean;
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  model?: string;
  /** Server-side cache signal: hit | miss | refresh | off. */
  cache_status?: "hit" | "miss" | "refresh" | "off";
  error?: string;
}

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

/**
 * Sentinel returned as `error` when a request was superseded by a newer
 * request for the same `panelKey`. Callers should treat this as a silent
 * no-op (do not toast, do not overwrite state).
 */
export const CLAUDE_STALE_ERROR = "__CLAUDE_STALE__";

export function isStaleClaudeResponse(resp: ClaudeResponse | undefined | null): boolean {
  return !!resp && !resp.success && resp.error === CLAUDE_STALE_ERROR;
}

// In-flight promises keyed by dedupe signature — identical concurrent
// requests share one network round-trip instead of firing multiple times
// (rerenders, double-clicks, rapid state changes).
const inflight = new Map<string, Promise<ClaudeResponse>>();

// Monotonic sequence per panelKey. Only the latest sequence "wins"; older
// requests still resolve internally but return the stale sentinel to the
// caller so their UI state isn't clobbered by an out-of-order response.
const panelSeq = new Map<string, number>();

function computeDedupeKey(o: ClaudeRequestOptions): string {
  try {
    return JSON.stringify({
      c: o.context ?? null,
      s: o.system ?? null,
      t: o.temperature ?? null,
      x: o.max_tokens ?? null,
      m: o.messages,
    });
  } catch {
    return `fallback:${Math.random()}`;
  }
}

// Debounce timers for `sendClaudeMessageDebounced`. Keyed by caller-supplied
// key (typically panelKey). A newer debounced call cancels the pending one.
const debounceTimers = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; reject: (v: ClaudeResponse) => void }
>();

/**
 * Debounced variant for text-input-triggered calls (autosuggest, live
 * summaries). Successive invocations with the same key within `delayMs`
 * cancel earlier ones. Cancelled calls resolve with the stale sentinel.
 */
export function sendClaudeMessageDebounced(
  key: string,
  delayMs: number,
  options: ClaudeRequestOptions,
  runOptions?: { retries?: number; timeoutMs?: number },
): Promise<ClaudeResponse> {
  return new Promise((resolve) => {
    const existing = debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reject({ success: false, response: "", error: CLAUDE_STALE_ERROR });
    }
    const timer = setTimeout(async () => {
      debounceTimers.delete(key);
      const merged: ClaudeRequestOptions = {
        ...options,
        requestManager: { panelKey: key, ...(options.requestManager ?? {}) },
      };
      resolve(await sendClaudeMessage(merged, runOptions));
    }, delayMs);
    debounceTimers.set(key, { timer, reject: resolve });
  });
}

/**
 * Send a request to Claude via the secure edge function proxy.
 * All AI calls MUST go through this service layer — no direct Anthropic calls.
 * Includes timeout, retry with back-off, and normalized error shape.
 *
 * Client-side request manager (opt-in via `requestManager`):
 *  - `panelKey`  – newer requests supersede older ones; superseded requests
 *                  resolve with `{ success:false, error: CLAUDE_STALE_ERROR }`.
 *  - `dedupeKey` – identical in-flight requests share a single promise so a
 *                  rerender/double-click does not fan out multiple network
 *                  calls to Anthropic.
 */
export async function sendClaudeMessage(
  options: ClaudeRequestOptions,
  { retries = MAX_RETRIES, timeoutMs = CLAUDE_TIMEOUT_MS } = {}
): Promise<ClaudeResponse> {
  const rm = options.requestManager;
  const bypass = rm?.bypass === true;
  const panelKey = !bypass ? rm?.panelKey : undefined;
  const dedupeKey = !bypass ? rm?.dedupeKey ?? computeDedupeKey(options) : undefined;

  // Track this request's sequence within its panel so we can detect if a
  // newer request has been issued by the time we resolve.
  let mySeq = 0;
  if (panelKey) {
    mySeq = (panelSeq.get(panelKey) ?? 0) + 1;
    panelSeq.set(panelKey, mySeq);
  }

  // Reuse an in-flight identical request instead of firing another one.
  if (dedupeKey) {
    const existing = inflight.get(dedupeKey);
    if (existing) {
      const result = await existing;
      if (panelKey && panelSeq.get(panelKey) !== mySeq) {
        return { success: false, response: "", error: CLAUDE_STALE_ERROR };
      }
      return result;
    }
  }

  const exec = executeClaudeRequest(options, { retries, timeoutMs });
  if (dedupeKey) {
    inflight.set(dedupeKey, exec);
    exec.finally(() => {
      if (inflight.get(dedupeKey) === exec) inflight.delete(dedupeKey);
    });
  }
  const result = await exec;
  if (panelKey && panelSeq.get(panelKey) !== mySeq) {
    return { success: false, response: "", error: CLAUDE_STALE_ERROR };
  }
  return result;
}

async function executeClaudeRequest(
  options: ClaudeRequestOptions,
  { retries, timeoutMs }: { retries: number; timeoutMs: number },
): Promise<ClaudeResponse> {
  let lastError: string = "Unknown error";
  const startedAt = Date.now();
  const { usage: usageHint, requestManager: _rm, ...edgeOptions } = options;

  // Client-side pre-flight cap. The edge function enforces its own 100k-char
  // ceiling; we refuse locally at 90k so callers see a fast, actionable
  // error instead of a slow round-trip. Per-workflow budgets in
  // `historyCompaction.ts` should keep us well under this in practice.
  const CLIENT_MAX_TOTAL_CHARS = 90_000;
  const msgChars = (edgeOptions.messages ?? []).reduce(
    (n, m) => n + (m.content?.length ?? 0),
    0,
  );
  const sysChars =
    (edgeOptions.system?.length ?? 0) +
    (edgeOptions.staticSystem?.length ?? 0) +
    (edgeOptions.dynamicSystem?.length ?? 0);
  const totalChars = msgChars + sysChars;
  if (totalChars > CLIENT_MAX_TOTAL_CHARS) {
    console.warn(
      `[claude] payload too large (${totalChars} chars > ${CLIENT_MAX_TOTAL_CHARS}); ` +
        `messages=${msgChars} system=${sysChars}. Refusing to send.`,
    );
    return {
      success: false,
      response: "",
      error:
        "Request too large to send. Ask a more focused question or clear older messages.",
    };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // Routes through the `claude-gateway` edge function (server-side wrapper
      // around the Anthropic API). Prior to the gateway refactor this invoked
      // `claude-ai` directly — that function is kept only for legacy
      // server-to-server callers. Frontend code MUST NEVER call Anthropic
      // directly; ANTHROPIC_API_KEY lives only in project secrets.
      const { data, error } = await supabase.functions.invoke("claude-gateway", {
        body: edgeOptions,
      });

      clearTimeout(timer);

      if (error) {
        lastError = error.message || "Failed to reach AI service";

        // Don't retry on auth / feature-gating errors
        if (
          error.message?.includes("Unauthorized") ||
          error.message?.includes("disabled") ||
          error.message?.includes("403")
        ) {
          return { success: false, response: "", error: lastError };
        }

        // Retry on transient errors
        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        return { success: false, response: "", error: lastError };
      }

      // Edge function returned a JSON body
      const result = data as ClaudeResponse;

      if (!result.success) {
        lastError = result.error || "AI request failed";

        // Don't retry on 4xx-class errors from the edge function
        if (
          lastError.includes("disabled") ||
          lastError.includes("Unauthorized") ||
          lastError.includes("too long")
        ) {
          return result;
        }

        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        return result;
      }

      if (!usageHint?.skip) {
        const subtype =
          usageHint?.feature_subtype ||
          (options.context === "deal-assistant" ? "deal_query" : "general");
        const tokens =
          (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
        logUsage({
          feature_type: "AI_CHAT",
          feature_subtype: subtype,
          deal_id: usageHint?.deal_id ?? null,
          token_count: tokens || null,
          duration_ms: Date.now() - startedAt,
          metadata: { model: result.model, context: options.context ?? null },
        });
        logActivity({
          event_type: "feature_used",
          event_data: {
            feature: "ai_query",
            context: options.context ?? null,
            subtype,
            deal_id: usageHint?.deal_id ?? null,
          },
        });
      }

      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = "Request timed out. Please try again.";
      } else {
        lastError = err instanceof Error ? err.message : "Unknown error";
      }

      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  return { success: false, response: "", error: lastError };
}

/**
 * Convenience wrapper for simple single-turn questions
 */
export async function askClaude(
  question: string,
  systemPrompt?: string,
  context?: ClaudeRequestOptions["context"]
): Promise<string> {
  const result = await sendClaudeMessage({
    messages: [{ role: "user", content: question }],
    system: systemPrompt,
    context,
  });

  if (!result.success) {
    throw new Error(result.error || "AI request failed");
  }

  return result.response;
}

/**
 * System prompts for different features
 */
export const SYSTEM_PROMPTS: Record<string, string> = {
  chat: `You are naitive AI, an intelligent assistant for the naitive platform — a deal management, lender relations, and financial operations platform.

You help users with:
- Understanding their deal pipeline and lender relationships
- Providing insights on deal progress and next steps
- Drafting communications and summaries
- Answering questions about the platform's features
- General business and financial guidance

Be concise, professional, and actionable. Format responses with markdown when helpful.`,

  financialAnalysis: `You are a senior financial analyst AI assistant. Analyze the provided financial data and deliver structured, actionable insights.

Your analysis should include:
1. **Summary** — A brief executive overview
2. **Strengths** — Key financial positives and strong metrics
3. **Risks** — Potential concerns, red flags, or areas of weakness
4. **Recommendations** — Specific, actionable next steps
5. **Key Metrics** — Important ratios and figures worth highlighting

Use precise financial terminology. Be data-driven and objective. Format with clear headings and bullet points.`,

  agent: `You are an AI agent executing a specific task within the naitive platform. Follow your instructions precisely and return structured, actionable output.

When returning results that should be parsed as JSON, wrap them in a \`\`\`json code block.

Be thorough but concise. Focus on delivering exactly what was requested.`,

  workflow: `You are an AI processor within an automated workflow. Process the provided data according to the instructions and return structured output.

Always return your output in a parseable format. If the workflow expects JSON, return valid JSON wrapped in a \`\`\`json code block.

Be deterministic and precise. Do not add commentary unless specifically requested.`,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
