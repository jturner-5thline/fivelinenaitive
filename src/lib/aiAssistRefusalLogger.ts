import { supabase } from '@/integrations/supabase/client';

export type AiAssistRefusalReason =
  | 'no_deal_match'
  | 'low_confidence'
  | 'newsletter_sender';

interface LogArgs {
  reason: AiAssistRefusalReason;
  threadId?: string | null;
  contactId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Writes a refusal row to `ai_action_log` when the AI Assist "Update
 * Lender Stage" button is clicked in a state where the action cannot
 * succeed (no linked deal, low confidence, or newsletter sender).
 *
 * Best-effort: silently logs and swallows errors so a telemetry failure
 * never blocks the UI path.
 */
export async function logUpdateLenderRefused(args: LogArgs): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    // Use the existing security-definer helper that returns the user's
    // primary company_id. Matches the RLS WITH CHECK on ai_action_log.
    const { data: companyId, error: companyErr } = await supabase
      .rpc('get_user_company_id', { _user_id: user.id });
    if (companyErr || !companyId) return;

    await supabase.from('ai_action_log').insert([
      {
        action: 'update_lender_refused',
        reason: args.reason,
        thread_id: args.threadId ?? undefined,
        contact_id: args.contactId ?? undefined,
        actor_user_id: user.id,
        company_id: companyId as string,
        metadata: args.metadata ?? {},
      },
    ]);
  } catch (err) {
    // Telemetry must never block UX.
    console.warn('[aiAssistRefusalLogger] insert failed', err);
  }
}
