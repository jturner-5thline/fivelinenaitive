// Shared context/token budget helpers.
//
// Two jobs:
//   1. compactHistory() — cap the conversation replayed to the model at the
//      last N turns (6–12 by default) and truncate long individual messages.
//   2. small string/array trimming utilities used by context builders.
//
// Keeping this in one place means every Claude/LLM call site trims the same
// way, which is what keeps "oversized context payload" out of usage logs.

export interface ChatTurn {
  role: string;
  content: any;
  [k: string]: any;
}

export interface CompactHistoryOptions {
  /** Max number of prior messages (not exchanges) to keep. Default 12. */
  maxTurns?: number;
  /** Never drop below this many messages when trimming for size. Default 6. */
  minTurns?: number;
  /** Max chars kept for any single message's text content. Default 4000. */
  maxCharsPerMessage?: number;
  /** Max total chars across the kept history. Default 24000. */
  maxTotalChars?: number;
}

const DEFAULTS: Required<CompactHistoryOptions> = {
  maxTurns: 12,
  minTurns: 6,
  maxCharsPerMessage: 4000,
  maxTotalChars: 24000,
};

export function truncateText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function contentChars(content: any): number {
  if (typeof content === "string") return content.length;
  try {
    return JSON.stringify(content ?? "").length;
  } catch {
    return 0;
  }
}

function truncateContent(content: any, max: number): any {
  if (typeof content === "string") return truncateText(content, max);
  // Structured content blocks (tool_use / tool_result / text): trim text blocks only.
  if (Array.isArray(content)) {
    return content.map((b: any) =>
      b && typeof b === "object" && typeof b.text === "string"
        ? { ...b, text: truncateText(b.text, max) }
        : b
    );
  }
  return content;
}

/**
 * Keep only the most recent `maxTurns` messages, truncate oversized ones, and
 * drop from the oldest end until the whole history fits `maxTotalChars`
 * (never going below `minTurns` messages).
 *
 * Any leading `system` message is preserved and never counted/dropped, so this
 * is safe to run over an already-assembled OpenAI-shape `messages` array.
 */
export function compactHistory<T extends ChatTurn>(
  history: T[] | null | undefined,
  options: CompactHistoryOptions = {},
): T[] {
  const opts = { ...DEFAULTS, ...options };
  const all = Array.isArray(history) ? history.filter((m) => m && m.role) : [];
  if (all.length === 0) return [];

  const leadingSystem = all[0].role === "system" ? [all[0]] : [];
  const rest = leadingSystem.length ? all.slice(1) : all;

  let kept = rest.slice(-Math.max(opts.maxTurns, opts.minTurns));
  kept = kept.map((m) => ({ ...m, content: truncateContent(m.content, opts.maxCharsPerMessage) }));

  let total = kept.reduce((sum, m) => sum + contentChars(m.content), 0);
  while (total > opts.maxTotalChars && kept.length > opts.minTurns) {
    const dropped = kept.shift()!;
    total -= contentChars(dropped.content);
  }

  return [...leadingSystem, ...kept] as T[];
}

/** Human-readable summary for logging how much a compaction saved. */
export function historyStats(before: any[] | null | undefined, after: any[]) {
  const count = (arr: any[] | null | undefined) => (Array.isArray(arr) ? arr.length : 0);
  const chars = (arr: any[] | null | undefined) =>
    (Array.isArray(arr) ? arr : []).reduce((s, m) => s + contentChars(m?.content), 0);
  return {
    messages_before: count(before),
    messages_after: count(after),
    chars_before: chars(before),
    chars_after: chars(after),
  };
}
