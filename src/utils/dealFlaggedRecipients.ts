/**
 * Pure recipient-resolution logic for the "Deal Flagged" notification.
 *
 * Mirrors the logic in `supabase/functions/notification-engine/index.ts`
 * for the `deal_flagged` rule:
 *   - Start from [deal.owner_user_id, deal.manager_user_id]
 *   - Union with all admins of the deal's company
 *   - Drop null/undefined, drop the actor (flagger), de-duplicate
 *
 * The actual notification dispatch (in-app rows + email) happens server-side
 * in the `notification-engine` edge function. This helper exists primarily
 * for unit testing and for any client-side preview UI.
 */

export interface FlaggedDealInput {
  /** Resolved user_id of the deal's "Deal Owner" (display-name resolved on server). */
  owner_user_id?: string | null;
  /** Resolved user_id of the deal's "Deal Manager". */
  manager_user_id?: string | null;
  /** Deal's company_id used to scope admin lookup. */
  company_id?: string | null;
}

export interface CompanyAdmin {
  user_id: string;
  company_id: string;
}

/**
 * Resolve the final list of recipients for a deal-flagged event.
 *
 * @param deal               The deal whose flag changed
 * @param actorUserId        The user who performed the flag (always excluded)
 * @param companyAdmins      All admins (with their company_id) — usually fetched
 *                           from `user_roles` joined to `company_members`.
 *                           Pass an empty array if not yet loaded.
 */
export function resolveFlaggedDealRecipients(
  deal: FlaggedDealInput,
  actorUserId: string | null | undefined,
  companyAdmins: CompanyAdmin[],
): string[] {
  const set = new Set<string>();

  if (deal.owner_user_id) set.add(deal.owner_user_id);
  if (deal.manager_user_id) set.add(deal.manager_user_id);

  if (deal.company_id) {
    for (const admin of companyAdmins) {
      if (admin.company_id === deal.company_id && admin.user_id) {
        set.add(admin.user_id);
      }
    }
  }

  if (actorUserId) set.delete(actorUserId);

  return Array.from(set);
}
