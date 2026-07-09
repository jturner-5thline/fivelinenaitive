// Shared Anthropic Messages API helper for edge functions moving off Gemini.
// Accepts OpenAI-shape tools/tool_choice for convenience and translates to
// Anthropic shape internally so call sites can be swapped with minimal churn.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | any[];
}

export interface OpenAIStyleTool {
  // OpenAI shape: { type: "function", function: { name, description, parameters } }
  type?: string;
  function?: { name: string; description?: string; parameters?: any };
  // Anthropic shape: { name, description, input_schema }
  name?: string;
  description?: string;
  input_schema?: any;
}

export interface CallClaudeParams {
  system?: string;
  messages: ClaudeMessage[];
  tools?: OpenAIStyleTool[];
  toolChoice?:
    | "auto"
    | "any"
    | { type: "function"; function: { name: string } }
    | { type: "tool"; name: string };
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface CallClaudeResult {
  text: string;
  toolUse: { name: string; input: any } | null;
  stopReason: string | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  raw: any;
}

function normalizeTools(tools?: OpenAIStyleTool[]) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => {
    if (t.function) {
      return {
        name: t.function.name,
        description: t.function.description ?? "",
        input_schema: t.function.parameters ?? { type: "object", properties: {} },
      };
    }
    return {
      name: t.name!,
      description: t.description ?? "",
      input_schema: t.input_schema ?? { type: "object", properties: {} },
    };
  });
}

function normalizeToolChoice(tc: CallClaudeParams["toolChoice"]) {
  if (!tc) return undefined;
  if (tc === "auto") return { type: "auto" };
  if (tc === "any") return { type: "any" };
  if (typeof tc === "object" && "function" in tc && tc.function?.name) {
    return { type: "tool", name: tc.function.name };
  }
  if (typeof tc === "object" && "name" in tc && tc.name) {
    return { type: "tool", name: tc.name };
  }
  return undefined;
}

export async function callClaude(params: CallClaudeParams): Promise<CallClaudeResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const body: any = {
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 4096,
    messages: params.messages,
  };
  if (params.system) body.system = params.system;
  if (typeof params.temperature === "number") body.temperature = params.temperature;
  const tools = normalizeTools(params.tools);
  if (tools) body.tools = tools;
  const toolChoice = normalizeToolChoice(params.toolChoice);
  if (toolChoice) body.tool_choice = toolChoice;

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    const err = new Error(`Anthropic ${resp.status}: ${errText.slice(0, 500)}`) as any;
    err.status = resp.status;
    err.retryable = resp.status === 429 || resp.status === 529 || resp.status >= 500;
    throw err;
  }

  const data = await resp.json();
  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  const textParts = blocks.filter((b) => b?.type === "text").map((b) => b.text ?? "");
  const toolBlock = blocks.find((b) => b?.type === "tool_use");

  return {
    text: textParts.join("").trim(),
    toolUse: toolBlock ? { name: toolBlock.name, input: toolBlock.input } : null,
    stopReason: data?.stop_reason ?? null,
    usage: data?.usage ?? null,
    raw: data,
  };
}
