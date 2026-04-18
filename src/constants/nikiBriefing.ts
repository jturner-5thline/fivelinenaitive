// Centralized config for "Niki's Daily Briefing" visibility & access.
// Used by both the client render gate AND the briefing-for-user edge function
// (mirrored in supabase/functions/briefing-for-user/index.ts) so UI and
// server authorization stay in sync.

export const NIKI_BRIEFING_ALLOWED_EMAILS = [
  'jturner@5thline.co',
  'nheikali@5thline.co',
] as const;

export const NIKI_USER_ID = 'a757f375-7e93-4fc5-a49e-e371abb42fac';
export const NIKI_ASSIGNEE_NAME = 'Niki Heikali';
export const NIKI_EMAIL = 'nheikali@5thline.co';

export function canSeeNikiBriefing(email: string | null | undefined): boolean {
  if (!email) return false;
  return (NIKI_BRIEFING_ALLOWED_EMAILS as readonly string[]).includes(
    email.toLowerCase(),
  );
}
