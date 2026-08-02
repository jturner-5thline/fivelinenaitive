// Shared Anthropic Messages API helper for edge functions moving off Gemini.
// Accepts OpenAI-shape tools/tool_choice for convenience and translates to
// Anthropic shape internally so call sites can be swapped with minimal churn.

import { anthropicFetch } from "./anthropicUsage.ts";

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
  toolUses: { id: string; name: string; input: any }[];
  contentBlocks: any[];
  stopReason: string | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  raw: any;
}

function normalizeTools(tools?: OpenAIStyleTool[]) {
  if (!tools || tools.length === 0) return undefined;
  const stripAP = (schema: any): any => {
    if (!schema || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map(stripAP);
    const out: any = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "additionalProperties") continue;
      out[k] = stripAP(v);
    }
    return out;
  };
  return tools.map((t) => {
    if (t.function) {
      return {
        name: t.function.name,
        description: t.function.description ?? "",
        input_schema: stripAP(t.function.parameters) ?? { type: "object", properties: {} },
      };
    }
    return {
      name: t.name!,
      description: t.description ?? "",
      input_schema: stripAP(t.input_schema) ?? { type: "object", properties: {} },
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

  const resp = await anthropicFetch({ feature: "claudeChat" }, {
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
  const toolBlocks = blocks.filter((b) => b?.type === "tool_use");
  const toolBlock = toolBlocks[0];

  return {
    text: textParts.join("").trim(),
    toolUse: toolBlock ? { name: toolBlock.name, input: toolBlock.input } : null,
    toolUses: toolBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
    contentBlocks: blocks,
    stopReason: data?.stop_reason ?? null,
    usage: data?.usage ?? null,
    raw: data,
  };
}

// Streaming: hits Anthropic with stream:true and returns a Response whose body
// is Server-Sent Events in OpenAI Chat Completions shape:
//   data: {"choices":[{"delta":{"content":"..."}}]}
//   data: [DONE]
// This lets clients that already parse OpenAI-style SSE (choices[0].delta.content)
// consume Claude output with no client changes.
export async function streamClaudeAsOpenAISSE(
  params: CallClaudeParams,
  responseInit?: ResponseInit,
): Promise<Response> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const body: any = {
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 4096,
    messages: params.messages,
    stream: true,
  };
  if (params.system) body.system = params.system;
  if (typeof params.temperature === "number") body.temperature = params.temperature;
  const tools = normalizeTools(params.tools);
  if (tools) body.tools = tools;
  const toolChoice = normalizeToolChoice(params.toolChoice);
  if (toolChoice) body.tool_choice = toolChoice;

  const upstream = await anthropicFetch({ feature: "claudeChat" }, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    const err = new Error(`Anthropic ${upstream.status}: ${errText.slice(0, 500)}`) as any;
    err.status = upstream.status;
    err.retryable = upstream.status === 429 || upstream.status === 529 || upstream.status >= 500;
    throw err;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const outStream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      const emitText = (text: string) => {
        const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);

            for (const line of rawEvent.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const dataStr = line.slice(5).trim();
              if (!dataStr) continue;
              try {
                const evt = JSON.parse(dataStr);
                if (
                  evt?.type === "content_block_delta" &&
                  evt?.delta?.type === "text_delta" &&
                  typeof evt.delta.text === "string"
                ) {
                  emitText(evt.delta.text);
                }
                // message_stop / message_delta terminate the response; we send [DONE] once the upstream stream closes.
              } catch {
                // ignore malformed line
              }
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        controller.close();
      }
    },
  });

  const headers = new Headers(responseInit?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/event-stream");
  return new Response(outStream, { ...responseInit, headers });
}
