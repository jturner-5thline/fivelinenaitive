import { supabase } from "@/integrations/supabase/client";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequestOptions {
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  max_tokens?: number;
  context?: "chat" | "financial-analysis" | "agent" | "workflow";
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

/**
 * Send a request to Claude via the secure edge function proxy.
 * All AI calls should go through this service layer.
 */
export async function sendClaudeMessage(options: ClaudeRequestOptions): Promise<ClaudeResponse> {
  const { data, error } = await supabase.functions.invoke("claude-ai", {
    body: options,
  });

  if (error) {
    console.error("Claude service error:", error);
    return {
      success: false,
      response: "",
      error: error.message || "Failed to reach AI service",
    };
  }

  return data as ClaudeResponse;
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
export const SYSTEM_PROMPTS = {
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
