export interface DrilldownRow {
  feature: string;
  provider: string;
  model: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  cache_hits: number;
  errors: number;
  avg_latency_ms: number | null;
  distinct_signatures: number;
  repeat_calls: number;
  distinct_users: number;
  first_call_at: string;
  last_call_at: string;
}

export interface UsageRecommendation {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** Estimated calls or tokens that could be avoided. */
  savings?: string;
}

const n = (v: unknown) => Number(v ?? 0);

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/**
 * Heuristics that turn raw per-feature usage into concrete "how to make fewer /
 * cheaper calls" advice. Pure function — safe to unit test.
 */
export function recommendationsForRow(row: DrilldownRow): UsageRecommendation[] {
  const out: UsageRecommendation[] = [];
  const calls = n(row.calls);
  if (calls === 0) return out;

  const avgIn = n(row.input_tokens) / calls;
  const avgOut = n(row.output_tokens) / calls;
  const repeats = n(row.repeat_calls);
  const errorRate = pct(n(row.errors), calls);
  const cacheRate = pct(n(row.cache_hits), calls);
  const callsPerUser = row.distinct_users > 0 ? calls / row.distinct_users : calls;
  const spanMinutes =
    (new Date(row.last_call_at).getTime() - new Date(row.first_call_at).getTime()) / 60000;
  const callsPerMinute = spanMinutes > 1 ? calls / spanMinutes : calls;

  if (repeats > 0) {
    out.push({
      id: "dedupe",
      severity: repeats / calls > 0.3 ? "high" : "medium",
      title: "Identical requests repeated",
      detail: `${repeats} of ${calls} calls had a prompt signature already seen in this window. Serve them from the claude-gateway response cache (raise the TTL for this feature) or dedupe in-flight requests client-side.`,
      savings: `~${repeats} calls avoidable`,
    });
  }

  if (row.provider === "anthropic" && cacheRate < 25 && avgIn > 3000) {
    out.push({
      id: "prompt-cache",
      severity: avgIn > 12000 ? "high" : "medium",
      title: "Prompt caching underused",
      detail: `Average ${Math.round(avgIn).toLocaleString()} input tokens per call with only ${cacheRate.toFixed(0)}% cache hits. Move the static system prompt / deal context to an \`ephemeral\` cache block so repeat turns read instead of re-send it.`,
      savings: `up to ~${Math.round(avgIn * calls * 0.7).toLocaleString()} input tokens`,
    });
  }

  if (avgIn > 20000) {
    out.push({
      id: "trim-context",
      severity: "high",
      title: "Oversized context payload",
      detail:
        "Trim the assembled DealContextPayload (cap notes/emails/transcript chunks, drop unused fields) and compact conversation history to the last 6–12 turns before sending.",
    });
  }

  if (avgOut < 120 && calls > 20) {
    out.push({
      id: "deterministic",
      severity: "medium",
      title: "Short answers — likely deterministic work",
      detail:
        "Responses average under ~120 output tokens, which usually means classification or extraction. Route this through the invocation policy layer to a rule/regex/SQL resolver first and only fall back to the model when it can't decide.",
      savings: `~${Math.round(calls * 0.6)} calls avoidable`,
    });
  }

  if (callsPerMinute > 2 && calls > 30) {
    out.push({
      id: "debounce",
      severity: "medium",
      title: "Bursty call pattern",
      detail: `~${callsPerMinute.toFixed(1)} calls/min sustained. Add or lengthen debouncing (800–1200ms) on the triggering UI, and batch per-record calls into one multi-record prompt.`,
    });
  }

  if (callsPerUser > 40 && row.distinct_users > 0) {
    out.push({
      id: "per-user",
      severity: "low",
      title: "High volume per user",
      detail: `${Math.round(callsPerUser)} calls per active user. Consider memoizing results per deal/session so revisiting a screen doesn't re-invoke the model.`,
    });
  }

  if (errorRate > 10) {
    out.push({
      id: "errors",
      severity: "high",
      title: "Failed calls are being paid for",
      detail: `${errorRate.toFixed(0)}% of calls failed — likely retry storms or oversized payloads. Cap retries with backoff and validate inputs before invoking.`,
      savings: `~${n(row.errors)} wasted calls`,
    });
  }

  if (!out.length) {
    out.push({
      id: "ok",
      severity: "low",
      title: "No obvious waste",
      detail:
        "Call volume, token size, cache usage and error rate all look reasonable for this action. Move it to the async ai_jobs queue if it isn't latency-sensitive.",
    });
  }

  return out;
}

/** Roll-up advice across the whole selection, ordered by impact. */
export function recommendationsForSelection(rows: DrilldownRow[]): {
  row: DrilldownRow;
  recs: UsageRecommendation[];
}[] {
  const rank = { high: 0, medium: 1, low: 2 };
  return rows
    .map((row) => ({ row, recs: recommendationsForRow(row) }))
    .sort((a, b) => {
      const sa = Math.min(...a.recs.map((r) => rank[r.severity]));
      const sb = Math.min(...b.recs.map((r) => rank[r.severity]));
      if (sa !== sb) return sa - sb;
      return Number(b.row.calls) - Number(a.row.calls);
    });
}