import { supabase } from '@/integrations/supabase/client';

/**
 * Fire the `deal_flagged` notification trigger.
 *
 * The actual recipient resolution + dispatch (in-app + email) happens
 * server-side in the `notification-engine` edge function.
 *
 * Recipients are: deal owner + deal manager + all admins of the deal's company,
 * minus the actor (flagger), de-duplicated. See
 * `src/utils/dealFlaggedRecipients.ts` for the pure resolver mirroring this logic.
 */
export async function notifyDealFlagged(params: {
  dealId: string;
  dealName: string;
  actorUserId: string;
  flagNote?: string | null;
  companyId?: string | null;
}): Promise<void> {
  const { dealId, dealName, actorUserId, flagNote, companyId } = params;

  const trimmedNote = (flagNote ?? '').trim();
  const flagNoteSuffix = trimmedNote ? `: "${trimmedNote}"` : '';
  const flagNoteEmailSuffix = trimmedNote ? `\n\nFlag note: "${trimmedNote}"` : '';

  try {
    await supabase.functions.invoke('notification-engine', {
      body: {
        triggerKey: 'deal_flagged',
        actorUserId,
        context: {
          deal_id: dealId,
          deal_name: dealName,
          company_id: companyId ?? undefined,
          flag_note: trimmedNote,
          flag_note_suffix: flagNoteSuffix,
          flag_note_email_suffix: flagNoteEmailSuffix,
        },
      },
    });
  } catch (err) {
    // Non-fatal — the flag itself was already saved to the DB before this is called.
    console.error('[notifyDealFlagged] failed to dispatch notification', err);
  }
}
