export interface ClaapDrilldownRow {
  source: string;
  operation: string;
  calls: number;
  billable_calls: number;
  skipped_calls: number;
  rate_limited: number;
  errors: number;
  hydrate_skips: number;
  distinct_recordings: number;
  repeat_recordings: number;
  avg_latency_ms: number | null;
  first_call_at: string;
  last_call_at: string;
}

export interface ClaapRecommendation {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** Estimated calls that could be avoided. */
  savings?: string;
}

/** One row of public.claap_api_usage — the daily quota ledger. */
export interface ClaapQuotaDay {
  usage_date: string;
  calls_made: number | null;
  daily_limit: number | null;
  first_429_at: string | null;
  last_429_at: string | null;
}

const n = (v: unknown) => Number(v ?? 0);
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/** Human label for each known Claap traffic source. */
export const CLAAP_SOURCE_LABELS: Record<string, string> = {
  "claap-bulk-sync": "Scheduled bulk sync",
  "claap-backfill": "Historical backfill",
  "claap-backfill-summaries": "Summary backfill",
  "claap-sync-recording-content": "Recording content sync",
  "manual-refresh": "User-initiated refresh",
  unknown: "Unattributed",
};

export function claapSourceLabel(source: string): string {
  return CLAAP_SOURCE_LABELS[source] ?? source;
}

/**
 * Per-source recommendations. Every suggestion here reduces *calls*, never
 * data availability — the pattern is always "serve it from the local mirror
 * instead of asking Claap again".
 */
export function recommendationsForClaapRow(row: ClaapDrilldownRow): ClaapRecommendation[] {
  const recs: ClaapRecommendation[] = [];
  const billable = n(row.billable_calls);
  const repeats = n(row.repeat_recordings);
  const skips = n(row.hydrate_skips);

  if (repeats > 0 && pct(repeats, billable) >= 15) {
    recs.push({
      id: "repeat-fetch",
      severity: repeats > 50 ? "high" : "medium",
      title: "Same recordings fetched more than once",
      detail: `${repeats.toLocaleString()} of ${billable.toLocaleString()} billable calls re-fetched a recording already pulled in this window. The hydrate-once gate is not catching them (usually a missing recordingRowId or hydration_complete never flipping).`,
      savings: `~${repeats.toLocaleString()} calls/window`,
    });
  }

  if (n(row.rate_limited) > 0) {
    recs.push({
      id: "rate-limited",
      severity: "high",
      title: "This source is hitting 429s",
      detail: `${n(row.rate_limited).toLocaleString()} calls came back rate limited. Every 429 still consumes quota and forces a retry the next day.`,
      savings: "Removes wasted retry calls",
    });
  }

  if (n(row.errors) > 0 && pct(n(row.errors), billable) >= 5) {
    recs.push({
      id: "errors",
      severity: "medium",
      title: "Failed calls are burning quota",
      detail: `${n(row.errors).toLocaleString()} calls errored (${pct(n(row.errors), billable).toFixed(0)}% of billable). Failures count against the daily ceiling exactly like successes.`,
      savings: `~${n(row.errors).toLocaleString()} calls/window`,
    });
  }

  if (billable > 200 && (row.source === "claap-bulk-sync" || row.source === "claap-backfill")) {
    recs.push({
      id: "spread-batch",
      severity: billable > 500 ? "high" : "medium",
      title: "Large batch concentrated in one run",
      detail: `${billable.toLocaleString()} calls from a single scheduled source. Spreading the batch across the day (smaller page size, more frequent runs) keeps headroom for user-initiated refreshes instead of exhausting quota in one sweep.`,
      savings: "Same total, no lockout",
    });
  }

  if (row.source === "manual-refresh" && billable > 30) {
    recs.push({
      id: "manual-cooldown",
      severity: "medium",
      title: "Manual refreshes are frequent",
      detail: `${billable.toLocaleString()} user-initiated refreshes. A short per-recording cooldown (e.g. 6h) with a "last synced" timestamp gives users the same data without a new Claap call.`,
      savings: `~${Math.round(billable * 0.6).toLocaleString()} calls/window`,
    });
  }

  if (skips > 0 && recs.length === 0) {
    recs.push({
      id: "healthy",
      severity: "low",
      title: "Hydrate-once gate is working",
      detail: `${skips.toLocaleString()} calls were avoided because the recording was already mirrored locally. No change needed for this source.`,
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "healthy",
      severity: "low",
      title: "No waste detected",
      detail: "Call volume here maps 1:1 to distinct recordings with no errors or throttling.",
    });
  }

  return recs;
}

/** Roll up recommendations across every source in the selected window. */
export function recommendationsForClaapSelection(
  rows: ClaapDrilldownRow[],
  quotaDays: ClaapQuotaDay[] = [],
): {
  totals: {
    calls: number;
    billable: number;
    skipped: number;
    rateLimited: number;
    errors: number;
    repeats: number;
    hydrateSkips: number;
    saturatedDays: number;
    nearLimitDays: number;
    peakUtilizationPct: number;
  };
  recommendations: ClaapRecommendation[];
} {
  const base = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + n(r.calls),
      billable: acc.billable + n(r.billable_calls),
      skipped: acc.skipped + n(r.skipped_calls),
      rateLimited: acc.rateLimited + n(r.rate_limited),
      errors: acc.errors + n(r.errors),
      repeats: acc.repeats + n(r.repeat_recordings),
      hydrateSkips: acc.hydrateSkips + n(r.hydrate_skips),
    }),
    { calls: 0, billable: 0, skipped: 0, rateLimited: 0, errors: 0, repeats: 0, hydrateSkips: 0 },
  );

  // Quota ledger: a day can exhaust the ceiling without a single 429 landing in
  // the call log (calls get deferred/skipped once protect mode kicks in), so the
  // ledger — not the call log — is the source of truth for "we hit the limit".
  const saturated = quotaDays.filter(
    (d) =>
      !!d.first_429_at ||
      (n(d.daily_limit) > 0 && n(d.calls_made) >= n(d.daily_limit)),
  );
  const nearLimit = quotaDays.filter(
    (d) =>
      !saturated.includes(d) &&
      n(d.daily_limit) > 0 &&
      n(d.calls_made) >= n(d.daily_limit) * 0.8,
  );
  const peakUtilizationPct = quotaDays.reduce(
    (max, d) => Math.max(max, n(d.daily_limit) > 0 ? pct(n(d.calls_made), n(d.daily_limit)) : 0),
    0,
  );

  const totals = { ...base, saturatedDays: saturated.length, nearLimitDays: nearLimit.length, peakUtilizationPct };

  const recs: ClaapRecommendation[] = [];
  const top = [...rows].sort((a, b) => n(b.billable_calls) - n(a.billable_calls))[0];

  if (saturated.length > 0) {
    const worst = [...saturated].sort((a, b) => n(b.calls_made) - n(a.calls_made))[0];
    const days = saturated
      .map((d) => d.usage_date)
      .slice(0, 5)
      .join(", ");
    recs.push({
      id: "quota-exhausted",
      severity: "high",
      title:
        saturated.length === 1
          ? `Daily ceiling was hit on ${saturated[0].usage_date}`
          : `Daily ceiling was hit on ${saturated.length} days`,
      detail: `${days}${saturated.length > 5 ? ", …" : ""} reached the limit (peak ${n(worst.calls_made).toLocaleString()} of ${n(worst.daily_limit).toLocaleString()} calls). Once the ceiling is reached, later syncs and user refreshes are deferred entirely — ${top ? `${claapSourceLabel(top.source)} spent the most quota in this window` : "review the sources below"}. Cut the scheduled batch size and reserve the last 20% of quota for user-initiated calls.`,
      savings: "Removes lockout windows",
    });
  } else if (nearLimit.length > 0) {
    recs.push({
      id: "quota-near-limit",
      severity: "medium",
      title: `Quota ran at ${peakUtilizationPct.toFixed(0)}% of the daily ceiling`,
      detail: `${nearLimit.length} day(s) used 80%+ of the allowance without hitting the wall. There is little headroom left for user-initiated refreshes${top ? ` — ${claapSourceLabel(top.source)} is the largest consumer` : ""}.`,
    });
  }

  if (top && pct(n(top.billable_calls), totals.billable) >= 60) {
    recs.push({
      id: "concentration",
      severity: "medium",
      title: `${claapSourceLabel(top.source)} drives most of the quota`,
      detail: `${pct(n(top.billable_calls), totals.billable).toFixed(0)}% of billable calls come from one source. Throttle or reschedule it first — it is the only lever that meaningfully moves the daily total.`,
    });
  }

  if (totals.repeats > 0) {
    recs.push({
      id: "repeat-fetch",
      severity: totals.repeats > 100 ? "high" : "medium",
      title: "Re-fetching recordings we already mirror",
      detail: `${totals.repeats.toLocaleString()} redundant calls across all sources. Serving these from claap_recordings / claap_transcripts costs nothing and returns identical data.`,
      savings: `~${totals.repeats.toLocaleString()} calls/window`,
    });
  }

  if (totals.rateLimited > 0) {
    recs.push({
      id: "rate-limited",
      severity: "high",
      title: "Daily ceiling was reached",
      detail: `${totals.rateLimited.toLocaleString()} throttled calls. Lower the batch size on scheduled syncs and reserve the last 20% of quota for user-initiated refreshes.`,
    });
  }

  if (totals.errors > 0) {
    recs.push({
      id: "errors",
      severity: "medium",
      title: "Errored calls still consume quota",
      detail: `${totals.errors.toLocaleString()} failed calls. Cap retries and quarantine recordings that fail repeatedly.`,
      savings: `~${totals.errors.toLocaleString()} calls/window`,
    });
  }

  if (!recs.length) {
    recs.push({
      id: "healthy",
      severity: "low",
      title: "Claap usage is efficient",
      detail: `${totals.hydrateSkips.toLocaleString()} calls avoided by the local mirror, no throttling or duplicate fetches in this window.`,
    });
  }

  return { totals, recommendations: recs };
}

/** Ready-to-paste Lovable prompt implementing one fix, scoped to one source. */
export function promptForClaapRecommendation(
  rec: ClaapRecommendation,
  row: ClaapDrilldownRow,
): string {
  const asks: Record<string, string> = {
    "repeat-fetch": `Stop re-fetching Claap recordings we already mirror. In supabase/functions/_shared/claap-quota.ts make sure every caller from "${row.source}" passes recordingRowId so the hydrate-once gate can short-circuit, and confirm hydration_complete flips to true once summary + transcript are stored. Where the caller only has an external_id, resolve the claap_recordings row first. Serve reads from claap_recordings/claap_transcripts instead of calling Claap.`,
    "rate-limited": `Reduce 429s from the Claap source "${row.source}". Lower the per-run batch size, add exponential backoff between calls, and reserve the last 20% of the daily quota for priority "high" (user-initiated) calls only — scheduled low-priority syncs should defer instead of consuming it.`,
    errors: `Fix failing Claap calls from "${row.source}". Inspect claap_api_call_log error_message values for this source, cap retries with backoff, and quarantine recordings that fail 3+ times by setting a far-future next_sync_at so they stop consuming quota.`,
    "spread-batch": `Spread the Claap "${row.source}" workload across the day. Reduce the batch size per run and increase the cron frequency so the same volume of recordings is synced without exhausting the daily ceiling in one sweep. Keep total throughput unchanged.`,
    "manual-cooldown": `Add a per-recording refresh cooldown for user-initiated Claap refreshes. If a recording was hydrated within the last 6 hours, return the mirrored data immediately with a "last synced" timestamp and only call Claap when the user explicitly forces a re-sync.`,
    concentration: `Throttle the dominant Claap source "${row.source}". Cut its per-run batch size and mark its calls priority "low" so they defer whenever protect mode is active, keeping quota available for user-facing refreshes.`,
    "quota-exhausted": `We are exhausting the Claap daily call ceiling. Add a quota governor in supabase/functions/_shared/claap-quota.ts: reserve the final 20% of the daily allowance for priority "high" (user-initiated) calls, defer priority "low" scheduled work to the next window instead of consuming it, shrink the per-run batch size for "${row.source}", and record deferrals in claap_api_call_log so the drilldown shows what was pushed back.`,
    "quota-near-limit": `We are running close to the Claap daily ceiling. Shrink the per-run batch for "${row.source}", spread scheduled syncs across more frequent smaller runs, and keep at least 20% of the daily allowance free for user-initiated refreshes.`,
    healthy: `Review the Claap sync path for "${row.source}" and confirm nothing calls Claap for data already present in claap_recordings/claap_transcripts.`,
  };

  const context = [
    `Source: ${claapSourceLabel(row.source)} (${row.source})`,
    `Operation: ${row.operation}`,
    `Window: ${n(row.billable_calls).toLocaleString()} billable calls, ${n(row.skipped_calls).toLocaleString()} avoided, ${n(row.distinct_recordings).toLocaleString()} distinct recordings, ${n(row.repeat_recordings).toLocaleString()} repeats, ${n(row.errors)} errors, ${n(row.rate_limited)} rate limited`,
  ].join("\n- ");

  return [
    `Reduce our Claap API call volume for one specific source.`,
    ``,
    `Context:`,
    `- ${context}`,
    ``,
    `Problem: ${rec.title} — ${rec.detail}`,
    rec.savings ? `Estimated upside: ${rec.savings}` : "",
    ``,
    `What to do: ${asks[rec.id] ?? rec.detail}`,
    ``,
    `Do not reduce what users can see: all recordings, transcripts and summaries must still be available from the local mirror.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
