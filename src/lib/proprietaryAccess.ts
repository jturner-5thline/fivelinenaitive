/**
 * Centralized authorization gate for 5th Line proprietary actions.
 *
 * The features below are operational tools used internally by the 5th Line
 * advisory team and must not be exposed to other companies, even visually:
 *   - Auto-Fill from Deal Space
 *   - Generate AI Memo
 *   - Branded Document
 *
 * Source of truth: the authenticated user's company linkage. Today the
 * 5th Line company account is identified by the @5thline.co (and the
 * legacy @naitive.co) email domain — the same INTERNAL_DOMAINS list used
 * by the rest of the app for company-account gating.
 *
 * IMPORTANT: This helper is the canonical UI gate. Server actions /
 * edge functions for the same three features re-check the user's email
 * domain against the same list so non-5th-Line users cannot invoke them
 * via direct API calls or client-side spoofing.
 */
import { isInternalEmail } from '@/lib/internalDomains';

type AuthLike = { email?: string | null } | null | undefined;

export function canUse5thLineProprietaryActions(user: AuthLike): boolean {
  return isInternalEmail(user?.email ?? null);
}
