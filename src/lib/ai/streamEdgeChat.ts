import { supabase } from '@/integrations/supabase/client';

export interface StreamEdgeChatOptions {
  /** Edge function name, e.g. `deal-space-ai`. */
  functionName: string;
  /** JSON body. `stream: true` is added automatically. */
  body: Record<string, unknown>;
  signal?: AbortSignal;
  /** Called with each text delta as it arrives. */
  onDelta: (text: string) => void;
  /** Called when the server emits a `{ type: 'sources' }` event. */
  onSources?: (sources: string[]) => void;
}

/**
 * Shared SSE reader for chat-style edge functions.
 *
 * Handles both SSE shapes used across the platform:
 *  - raw Anthropic events (`content_block_delta` / `text_delta`)
 *  - OpenAI-shaped deltas (`choices[0].delta.content`)
 * plus the platform-specific `{ type: 'sources' }` terminator event.
 *
 * Returns the full accumulated assistant text.
 */
export async function streamEdgeChat({
  functionName,
  body,
  signal,
  onDelta,
  onSources,
}: StreamEdgeChatOptions): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token =
    sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    },
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => null);
    throw new Error(err?.error || `Request failed (${resp.status})`);
  }
  if (!resp.body) throw new Error('No response body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const handlePayload = (payload: string) => {
    if (!payload || payload === '[DONE]') return;
    let evt: any;
    try {
      evt = JSON.parse(payload);
    } catch {
      return;
    }
    if (evt?.type === 'sources' && Array.isArray(evt.sources)) {
      onSources?.(evt.sources);
      return;
    }
    if (evt?.error) throw new Error(evt.error);
    const text: unknown =
      evt?.delta?.text ??
      evt?.content_block?.text ??
      evt?.choices?.[0]?.delta?.content;
    if (typeof text === 'string' && text) {
      full += text;
      onDelta(text);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      handlePayload(line.slice(5).trim());
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith('data:')) handlePayload(tail.slice(5).trim());

  return full;
}
