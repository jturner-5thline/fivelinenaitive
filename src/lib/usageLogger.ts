import { supabase } from "@/integrations/supabase/client";

/**
 * Feature types tracked in `public.usage_events`. Powers the Admin Usage Analytics dashboard.
 * Add new values here whenever a new significant user action is wired up.
 */
export type UsageFeatureType =
  | "AI_CHAT"
  | "EMAIL_DRAFT"
  | "EMAIL_SENT"
  | "LENDER_SUBMISSION"
  | "DEAL_SPACE_VIEW"
  | "DEAL_SPACE_AI_LOOKUP"
  | "DATA_ROOM_UPLOAD"
  | "DATA_ROOM_DOWNLOAD"
  | "WRITE_UP_GENERATED"
  | "AGENT_RUN"
  | "CLAAP_ANALYZED"
  | "CASH_FLOW_ACTION"
  | "SCHEDULED_REPORT_SENT"
  | "SESSION_START"
  | "SESSION_END";

export interface LogUsageInput {
  feature_type: UsageFeatureType;
  feature_subtype?: string | null;
  deal_id?: string | null;
  token_count?: number | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
}

const SESSION_KEY = "naitive.usage_session_id";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `sess_${Date.now()}`;
  }
}

/**
 * Fire-and-forget usage event logger.
 * Never throws — failures are swallowed and console-warned so they cannot
 * break the user-facing action that triggered them.
 */
export function logUsage(input: LogUsageInput): void {
  void (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return; // anonymous — skip

      const payload = {
        user_id: userId,
        feature_type: input.feature_type,
        feature_subtype: input.feature_subtype ?? null,
        deal_id: input.deal_id ?? null,
        token_count: input.token_count ?? null,
        duration_ms: input.duration_ms ?? null,
        session_id: getSessionId(),
        metadata: input.metadata ?? {},
      };

      const { error } = await supabase.from("usage_events").insert(payload);
      if (error) console.warn("[usageLogger] insert failed", error.message);
    } catch (err) {
      console.warn("[usageLogger] unexpected error", err);
    }
  })();
}

/** Mark a session start. Safe to call multiple times; session id is stable per tab. */
export function markSessionStart(): void {
  try {
    if (sessionStorage.getItem(SESSION_KEY + ".started") === "1") return;
    sessionStorage.setItem(SESSION_KEY + ".started", "1");
  } catch {
    // ignore
  }
  logUsage({ feature_type: "SESSION_START" });
}

/** Mark a session end. Best-effort — fired on tab close via `pagehide`. */
export function markSessionEnd(): void {
  logUsage({ feature_type: "SESSION_END" });
}