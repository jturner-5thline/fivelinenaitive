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
  /** Optional usage-logging hints. Not sent to the AI. */
  usage?: {
    feature_subtype?: string;
    deal_id?: string | null;
    skip?: boolean;
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
  error?: string;
}

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

/**
 * Send a request to Claude via the secure edge function proxy.
 * All AI calls MUST go through this service layer — no direct Anthropic calls.
 * Includes timeout, retry with back-off, and normalized error shape.
 */
export async function sendClaudeMessage(
  options: ClaudeRequestOptions,
  { retries = MAX_RETRIES, timeoutMs = CLAUDE_TIMEOUT_MS } = {}
): Promise<ClaudeResponse> {
  let lastError: string = "Unknown error";
  const startedAt = Date.now();
  const { usage: usageHint, ...edgeOptions } = options;

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
