// Shared quota + hydrate-once guardrails for Claap API calls.
// All Claap network traffic should go through `claapFetchRecording` so we
// (a) count every real call against the daily quota row,
// (b) short-circuit when we're out of quota, and
// (c) never re-fetch a recording that's already hydrated in Supabase.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  claapGetRecording,
  NormalizedClaapRecording,
} from "./claap-api.ts";

export type CallPriority = "high" | "normal" | "low";

export interface QuotaStatus {
  callsMade: number;
  dailyLimit: number;
  protectMode: boolean;
  outOfQuota: boolean;
  resetAt: string | null;
}

export interface ClaapFetchResult {
  ok: boolean;
  recording: NormalizedClaapRecording | null;
  skipped?: "already_hydrated" | "quota_protect" | "out_of_quota" | "no_external_id";
  error?: string;
  rateLimited?: boolean;
  quota?: QuotaStatus;
}

let cachedAdmin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  cachedAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return cachedAdmin;
}

export async function getQuotaStatus(): Promise<QuotaStatus> {
  const { data } = await admin().rpc("claap_quota_status");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    callsMade: row?.calls_made ?? 0,
    dailyLimit: row?.daily_limit ?? 1000,
    protectMode: !!row?.protect_mode,
    outOfQuota: !!row?.out_of_quota,
    resetAt: row?.reset_at ?? null,
  };
}

async function recordCall(): Promise<void> {
  await admin().rpc("claap_record_api_call", { _count: 1 });
  await maybeSendQuotaAlert("threshold");
}

async function markRateLimited(): Promise<void> {
  await admin().rpc("claap_mark_rate_limited");
  await maybeSendQuotaAlert("rate_limited");
}

const ALERT_RECIPIENT = "jturner@5thline.co";
const ALERT_THRESHOLD = 0.8;

function fmt(ts: string | null | undefined): string | undefined {
  if (!ts) return undefined;
  try {
    return `${new Date(ts).toISOString().replace("T", " · ").slice(0, 19)} UTC`;
  } catch {
    return undefined;
  }
}

/**
 * Sends a one-per-day alert to the Claap owner when we cross 80% of the daily
 * call ceiling, and a separate one-per-day alert the first time Claap 429s.
 * The `alert_80_sent_at` / `alert_429_sent_at` columns on today's usage row
 * act as the idempotency ledger, so repeat calls never re-send.
 */
async function maybeSendQuotaAlert(kind: "threshold" | "rate_limited"): Promise<void> {
  try {
    const db = admin();
    const today = new Date().toISOString().slice(0, 10);
    const { data: row } = await db
      .from("claap_api_usage")
      .select("usage_date, calls_made, daily_limit, last_call_at, first_429_at, last_429_at, reset_at, alert_80_sent_at, alert_429_sent_at")
      .eq("usage_date", today)
      .maybeSingle();
    if (!row) return;

    const limit = row.daily_limit || 1000;
    const pct = limit > 0 ? row.calls_made / limit : 0;

    if (kind === "threshold") {
      if (row.alert_80_sent_at) return;
      if (pct < ALERT_THRESHOLD) return;
    } else {
      if (row.alert_429_sent_at) return;
    }

    const column = kind === "threshold" ? "alert_80_sent_at" : "alert_429_sent_at";
    // Claim the alert first so concurrent invocations can't double-send.
    const { data: claimed } = await db
      .from("claap_api_usage")
      .update({ [column]: new Date().toISOString() })
      .eq("usage_date", today)
      .is(column, null)
      .select("usage_date");
    if (!claimed || claimed.length === 0) return;

    await db.functions.invoke("send-transactional-email", {
      body: {
        templateName: "claap-quota-alert",
        recipientEmail: ALERT_RECIPIENT,
        idempotencyKey: `claap-quota-${kind}-${today}`,
        templateData: {
          alertType: kind,
          callsMade: row.calls_made,
          dailyLimit: limit,
          percentUsed: Math.round(pct * 100),
          usageDate: row.usage_date,
          lastCallAt: fmt(row.last_call_at),
          last429At: fmt(row.last_429_at ?? row.first_429_at),
          resetAt: fmt(row.reset_at),
        },
      },
    });
  } catch (e) {
    console.error("[claap-quota] alert email failed:", (e as Error).message);
  }
}

/**
 * Decide whether we should even attempt a Claap call right now.
 * - `high`   : always allowed unless we're already 429'd today.
 * - `normal` : blocked when out of quota.
 * - `low`    : blocked whenever protect mode is active (>=80% or 429).
 */
export async function shouldDefer(priority: CallPriority): Promise<{ defer: boolean; quota: QuotaStatus }> {
  const quota = await getQuotaStatus();
  if (quota.outOfQuota) return { defer: true, quota };
  if (priority === "low" && quota.protectMode) return { defer: true, quota };
  return { defer: false, quota };
}

interface HydratedRow {
  id: string;
  external_id: string | null;
  hydration_complete: boolean;
  summary: string | null;
  transcript_url: string | null;
  transcript_available: boolean;
}

/**
 * The "hydrate once, then use Naitive" gate. Reads the current DB state for
 * the recording and returns true if we already have transcript + summary and
 * therefore MUST NOT call Claap again.
 */
export async function isAlreadyHydrated(recordingRowId: string): Promise<HydratedRow | null> {
  const { data } = await admin()
    .from("claap_recordings")
    .select("id, external_id, hydration_complete, summary, transcript_url, transcript_available")
    .eq("id", recordingRowId)
    .maybeSingle();
  return (data as HydratedRow) || null;
}

/**
 * Quota-aware, hydrate-once wrapper around `claapGetRecording`.
 *
 * Pass `recordingRowId` so we can short-circuit hydrated rows; pass
 * `externalId` so we can actually make the call. At least one is required.
 */
export async function claapFetchRecording(opts: {
  externalId: string | null;
  recordingRowId?: string | null;
  priority: CallPriority;
  /** Force through even if already hydrated (only user-initiated refresh should pass true). */
  force?: boolean;
}): Promise<ClaapFetchResult> {
  const { externalId, recordingRowId, priority, force = false } = opts;

  if (recordingRowId && !force) {
    const row = await isAlreadyHydrated(recordingRowId);
    if (row?.hydration_complete) {
      return { ok: true, recording: null, skipped: "already_hydrated" };
    }
  }

  if (!externalId) return { ok: false, recording: null, skipped: "no_external_id" };

  const gate = await shouldDefer(priority);
  if (gate.defer) {
    return {
      ok: false,
      recording: null,
      skipped: gate.quota.outOfQuota ? "out_of_quota" : "quota_protect",
      quota: gate.quota,
    };
  }

  try {
    const recording = await claapGetRecording(externalId);
    await recordCall();
    return { ok: true, recording, quota: await getQuotaStatus() };
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (/\b429\b/.test(msg) || /rate limit/i.test(msg)) {
      await markRateLimited();
      await recordCall();
      return { ok: false, recording: null, rateLimited: true, error: msg, quota: await getQuotaStatus() };
    }
    return { ok: false, recording: null, error: msg };
  }
}

/**
 * Mark a recording as hydrated after a successful content sync. The DB
 * trigger will also flip `hydration_complete` when summary + transcript are
 * present, but calling this explicitly makes the intent unambiguous.
 */
export async function markHydrated(recordingRowId: string): Promise<void> {
  await admin()
    .from("claap_recordings")
    .update({
      last_sync_status: "success",
      last_sync_error: null,
      hydrated_at: new Date().toISOString(),
      hydration_complete: true,
      refresh_requested_at: null,
    })
    .eq("id", recordingRowId);
}

export async function markRateLimitedRow(recordingRowId: string, err: string): Promise<void> {
  await admin()
    .from("claap_recordings")
    .update({
      last_sync_status: "rate_limited",
      last_sync_error: err.slice(0, 500),
      sync_attempts: (await admin()
        .from("claap_recordings")
        .select("sync_attempts")
        .eq("id", recordingRowId)
        .maybeSingle()).data?.sync_attempts + 1 || 1,
      // Retry after the next UTC midnight.
      next_sync_at: new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1,
        0, 5, 0,
      )).toISOString(),
    })
    .eq("id", recordingRowId);
}