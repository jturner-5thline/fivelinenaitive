// Shared Anthropic Messages API helper for edge functions moving off Gemini.
// Accepts OpenAI-shape tools/tool_choice for convenience and translates to
// Anthropic shape internally so call sites can be swapped with minimal churn.

import { anthropicFetch } from "./anthropicUsage.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";

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

/** True when the Anthropic account itself can't serve requests (no credits, bad/revoked key). */
export function isAnthropicAccountError(status: number, text: string): boolean {
  if (status === 401 || status === 403) return true;
  return status === 400 && /credit balance|billing|purchase credits/i.test(text);
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FALLBACK_MODEL = "google/gemini-3-flash-preview";

/** Fallback: same request through the built-in AI gateway, mapped back to the Claude result shape. */
async function callBuiltInFallback(params: CallClaudeParams): Promise<CallClaudeResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw Object.assign(new Error("Built-in AI fallback unavailable"), { status: 500 });
  const toText = (c: string | any[]) =>
    typeof c === "string" ? c : c.map((b: any) => (b?.type === "text" ? b.text : typeof b === "string" ? b : "")).join("\n");
  const messages: any[] = [];
  if (params.system) messages.push({ role: "system", content: params.system });
  for (const m of params.messages) messages.push({ role: m.role, content: toText(m.content) });
  const body: any = { model: FALLBACK_MODEL, messages, max_tokens: params.maxTokens ?? 4096 };
  const tools = normalizeTools(params.tools);
  if (tools) {
    body.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    const tc = normalizeToolChoice(params.toolChoice);
    if (tc?.type === "tool") body.tool_choice = { type: "function", function: { name: tc.name } };
    else if (tc?.type === "any") body.tool_choice = "required";
  }
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    const err = new Error(`Built-in AI ${resp.status}: ${t.slice(0, 300)}`) as any;
    err.status = resp.status;
    err.retryable = resp.status === 429 || resp.status >= 500;
    throw err;
  }
  const data = await resp.json();
  const msg = data?.choices?.[0]?.message ?? {};
  const toolUses = (msg.tool_calls ?? []).map((c: any) => {
    let input: any = {};
    try { input = JSON.parse(c.function?.arguments || "{}"); } catch { /* keep empty */ }
    return { id: c.id, name: c.function?.name, input };
  });
  const text = typeof msg.content === "string" ? msg.content.trim() : "";
  return {
    text,
    toolUse: toolUses[0] ? { name: toolUses[0].name, input: toolUses[0].input } : null,
    toolUses,
    contentBlocks: [
      ...(text ? [{ type: "text", text }] : []),
      ...toolUses.map((t: any) => ({ type: "tool_use", ...t })),
    ],
    stopReason: data?.choices?.[0]?.finish_reason ?? null,
    usage: data?.usage
      ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens }
      : null,
    raw: data,
  };
}

export async function callClaude(params: CallClaudeParams): Promise<CallClaudeResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("[claudeChat] ANTHROPIC_API_KEY missing — using built-in AI");
    return callBuiltInFallback(params);
  }

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
    if (isAnthropicAccountError(resp.status, errText)) {
      console.warn(`[claudeChat] Anthropic account unavailable (${resp.status}) — using built-in AI`);
      return callBuiltInFallback(params);
    }
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
