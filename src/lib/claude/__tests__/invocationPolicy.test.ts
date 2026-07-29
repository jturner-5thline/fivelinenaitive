import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/claude", () => ({
  sendClaudeMessage: vi.fn(async () => ({ success: true, response: "hi" })),
  sendClaudeMessageDebounced: vi.fn(async () => ({ success: true, response: "debounced" })),
}));

import {
  AiIntents,
  resolveInvocation,
  runInvocation,
  isFastPathResult,
  isClaudeReasoningResult,
} from "../invocationPolicy";
import { sendClaudeMessage, sendClaudeMessageDebounced } from "@/services/claude";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invocationPolicy", () => {
  it("classifies as deterministic when resolver returns a value", async () => {
    const d = await resolveInvocation(
      AiIntents.deterministic("t", "a", () => "answer"),
    );
    expect(d.class).toBe("deterministic");
    expect(d.value).toBe("answer");
  });

  it("classifies as cached when cache hits", async () => {
    const d = await resolveInvocation(
      AiIntents.cached("t", "a", () => "cached-val"),
    );
    expect(d.class).toBe("cached");
  });

  it("classifies as lightweight_transform when local transform returns", async () => {
    const d = await resolveInvocation({
      feature: "t",
      action: "a",
      lightweightTransform: () => "trimmed",
    });
    expect(d.class).toBe("lightweight_transform");
  });

  it("classifies as claude_reasoning when only claudeRequest is provided", async () => {
    const d = await resolveInvocation(
      AiIntents.reasoning("t", "a", { messages: [{ role: "user", content: "hi" }] }),
    );
    expect(d.class).toBe("claude_reasoning");
  });

  it("classifies as claude_async when async/latency=background", async () => {
    const d = await resolveInvocation(
      AiIntents.async("t", "a", { messages: [{ role: "user", content: "hi" }] }),
    );
    expect(d.class).toBe("claude_async");
  });

  it("fast paths never invoke Claude", async () => {
    await runInvocation(AiIntents.deterministic("t", "a", () => "x"));
    await runInvocation(AiIntents.cached("t", "a", () => "y"));
    expect(sendClaudeMessage).not.toHaveBeenCalled();
    expect(sendClaudeMessageDebounced).not.toHaveBeenCalled();
  });

  it("reasoning path calls sendClaudeMessage", async () => {
    const r = await runInvocation(
      AiIntents.reasoning("t", "a", { messages: [{ role: "user", content: "hi" }] }),
    );
    expect(sendClaudeMessage).toHaveBeenCalledTimes(1);
    expect(isClaudeReasoningResult(r)).toBe(true);
  });

  it("debounced reasoning path uses sendClaudeMessageDebounced when panelKey provided", async () => {
    await runInvocation({
      feature: "t",
      action: "a",
      debounceMs: 500,
      claudeRequest: {
        messages: [{ role: "user", content: "hi" }],
        requestManager: { panelKey: "panel-1" },
      },
    });
    expect(sendClaudeMessageDebounced).toHaveBeenCalledTimes(1);
    expect(sendClaudeMessage).not.toHaveBeenCalled();
  });

  it("async intents return an enqueue decision without calling Claude", async () => {
    const r = await runInvocation(
      AiIntents.async("t", "a", { messages: [{ role: "user", content: "hi" }] }),
    );
    expect(r.class).toBe("claude_async");
    expect(sendClaudeMessage).not.toHaveBeenCalled();
  });

  it("resolver priority: deterministic beats cache beats transform", async () => {
    const d = await resolveInvocation({
      feature: "t",
      action: "a",
      deterministicResolver: () => "det",
      cacheLookup: () => "cache",
      lightweightTransform: () => "xform",
    });
    expect(d.value).toBe("det");
  });

  it("isFastPathResult narrows correctly", async () => {
    const r = await runInvocation(AiIntents.deterministic("t", "a", () => 42));
    expect(isFastPathResult(r)).toBe(true);
  });
});