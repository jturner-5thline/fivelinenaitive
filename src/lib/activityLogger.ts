import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight, fire-and-forget activity logger that writes to public.user_activity_log.
 * Failures are swallowed (best-effort instrumentation).
 */
export type ActivityEventType =
  | "page_view"
  | "sign_in"
  | "sign_out"
  | "feature_used";

export interface LogActivityInput {
  event_type: ActivityEventType | string;
  event_data?: Record<string, unknown>;
  company_id?: string | null;
}

export function logActivity(input: LogActivityInput): void {
  void (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return;

      let companyId = input.company_id ?? null;
      if (!companyId) {
        const { data: member } = await supabase
          .from("company_members")
          .select("company_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        companyId = member?.company_id ?? null;
      }

      await supabase.from("user_activity_log").insert([
        {
          user_id: userId,
          company_id: companyId ?? undefined,
          event_type: input.event_type,
          event_data: (input.event_data ?? {}) as never,
        },
      ]);
    } catch {
      // best-effort
    }
  })();
}