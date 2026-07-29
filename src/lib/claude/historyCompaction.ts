// ─────────────────────────────────────────────────────────────────────────────
// historyCompaction.ts — bound the size of the message array we send to
// Claude. Three guardrails, in order:
//
//   1. compactHistory  — collapse older turns into a single deterministic
//                        summary block so answer continuity is preserved
//                        without replaying the full thread.
//   2. trimHistory     — keep only the most recent N turns (turn = one
//                        user + assistant pair). Applied AFTER compaction so
//                        the summary block counts as one of the kept turns.
//   3. enforceCharCap  — hard char cap. If we're still over budget after
//                        (1) and (2), drop the OLDEST turns until we fit.
//                        The newest turn (current question) always survives.
//
// These are purely client-side: the edge function still enforces its own
// 100k-char ceiling and Anthropic enforces the model context. This layer
// exists so we don't pay for or wait on tokens we don't need.
// ─────────────────────────────────────────────────────────────────────────────
import type { ClaudeMessage } from "@/services/claude";

// Per-workflow budgets. Deliberately small — deal Q&A answer quality comes
// from the <deal_facts> block in dynamicSystem, not from replaying old chat.
export const HISTORY_BUDGETS = {
  chat: { maxRecentTurns: 12, maxTotalChars: 60_000 },
  deal_assistant: { maxRecentTurns: 6, maxTotalChars: 40_000 },
  deal_qa: { maxRecentTurns: 4, maxTotalChars: 30_000 },
  financial_analysis: { maxRecentTurns: 2, maxTotalChars: 20_000 },
  workflow: { maxRecentTurns: 2, maxTotalChars: 20_000 },
  agent: { maxRecentTurns: 4, maxTotalChars: 30_000 },
} as const;

export type HistoryBudgetKey = keyof typeof HISTORY_BUDGETS;

// A "turn" = one user message and (optionally) the assistant reply that
// followed. Splitting on user boundaries keeps trimming semantically
// meaningful — we never keep half of an exchange.
function splitIntoTurns(messages: ClaudeMessage[]): ClaudeMessage[][] {
  const turns: ClaudeMessage[][] = [];
  let current: ClaudeMessage[] = [];
  for (const m of messages) {
    if (m.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(m);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

function charsOf(messages: ClaudeMessage[]): number {
  return messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
}

/**
 * Deterministic (no model call) compaction of older turns into a single
 * assistant-authored summary block. Cheap, fast, and predictable — the
 * model sees "here's what we already covered" without paying to re-read
 * every prior message. Compacts everything outside the last `keepRecent`
 * turns; if there are fewer than `keepRecent + 1` turns, no-op.
 */
export function compactHistory(
  messages: ClaudeMessage[],
  { keepRecent }: { keepRecent: number },
): { messages: ClaudeMessage[]; compactedTurnCount: number } {
  const turns = splitIntoTurns(messages);
  if (turns.length <= keepRecent) {
    return { messages, compactedTurnCount: 0 };
  }
  const older = turns.slice(0, turns.length - keepRecent);
  const recent = turns.slice(turns.length - keepRecent);

  // Extract the user questions from older turns as bullet topics. Assistant
  // replies are omitted — the point is to remind the model what was ASKED,
  // not to replay its own prior answers. Truncate each topic aggressively.
  const topics = older.flatMap((turn) =>
    turn
      .filter((m) => m.role === "user")
      .map((m) => (m.content ?? "").trim().replace(/\s+/g, " ").slice(0, 160))
      .filter(Boolean),
  );

  const summaryBody = topics.length
    ? topics.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(no notable earlier exchanges)";

  const summary: ClaudeMessage = {
    role: "assistant",
    content:
      `[Earlier conversation summary — ${older.length} turn(s) compacted]\n` +
      `Topics previously discussed in this thread:\n${summaryBody}\n\n` +
      `(Full transcript omitted to keep the prompt small. Ask me to expand ` +
      `on any topic if you need the detail.)`,
  };

  return {
    messages: [summary, ...recent.flat()],
    compactedTurnCount: older.length,
  };
}

/** Keep only the last N turns (turn = one user message + its assistant reply). */
export function trimHistory(
  messages: ClaudeMessage[],
  { maxTurns }: { maxTurns: number },
): ClaudeMessage[] {
  const turns = splitIntoTurns(messages);
  if (turns.length <= maxTurns) return messages;
  return turns.slice(turns.length - maxTurns).flat();
}

/**
 * Hard-cap total character size. Peels turns off the FRONT (oldest) until
 * we fit; never drops the last turn (that's the current question). If the
 * final turn alone still exceeds the cap, its content is truncated at the
 * end with a marker so the model still gets the question.
 */
export function enforceCharCap(
  messages: ClaudeMessage[],
  { maxTotalChars }: { maxTotalChars: number },
): { messages: ClaudeMessage[]; dropped: number } {
  if (charsOf(messages) <= maxTotalChars) return { messages, dropped: 0 };
  const turns = splitIntoTurns(messages);
  let dropped = 0;
  while (turns.length > 1 && charsOf(turns.flat()) > maxTotalChars) {
    turns.shift();
    dropped++;
  }
  let flat = turns.flat();
  if (charsOf(flat) > maxTotalChars) {
    const last = flat[flat.length - 1];
    const overflow = charsOf(flat) - maxTotalChars;
    const cutTo = Math.max(200, (last.content?.length ?? 0) - overflow - 40);
    const truncated =
      (last.content ?? "").slice(0, cutTo) +
      "\n\n[…truncated to fit prompt budget]";
    flat = [...flat.slice(0, -1), { ...last, content: truncated }];
  }
  return { messages: flat, dropped };
}

export interface PrepareHistoryResult {
  messages: ClaudeMessage[];
  stats: {
    inputChars: number;
    outputChars: number;
    inputTurns: number;
    outputTurns: number;
    compactedTurns: number;
    droppedByCap: number;
  };
}

/** Full pipeline: compact → trim → enforce cap. Returns stats for logging. */
export function prepareHistoryForClaude(
  messages: ClaudeMessage[],
  budget: HistoryBudgetKey | { maxRecentTurns: number; maxTotalChars: number },
): PrepareHistoryResult {
  const cfg = typeof budget === "string" ? HISTORY_BUDGETS[budget] : budget;
  const inputChars = charsOf(messages);
  const inputTurns = splitIntoTurns(messages).length;

  const compacted = compactHistory(messages, { keepRecent: cfg.maxRecentTurns });
  // trim caps at maxRecentTurns + 1 so the summary block (a synthetic turn)
  // fits alongside the recent turns rather than pushing one of them out.
  const trimmed = trimHistory(compacted.messages, { maxTurns: cfg.maxRecentTurns + 1 });
  const capped = enforceCharCap(trimmed, { maxTotalChars: cfg.maxTotalChars });

  return {
    messages: capped.messages,
    stats: {
      inputChars,
      outputChars: charsOf(capped.messages),
      inputTurns,
      outputTurns: splitIntoTurns(capped.messages).length,
      compactedTurns: compacted.compactedTurnCount,
      droppedByCap: capped.dropped,
    },
  };
}
