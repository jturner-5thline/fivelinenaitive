// Centralized config for "Moffitt's Daily Rundown" visibility & access.
// Mirrored in supabase/functions/briefing-for-user/index.ts so UI and
// server authorization stay in sync.

export const MOFFITT_BRIEFING_ALLOWED_EMAILS = [
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
] as const;

export const MOFFITT_USER_ID = 'bb211b16-282f-4eb5-a461-4168d6459154';
export const MOFFITT_ASSIGNEE_NAME = 'John Moffitt';
export const MOFFITT_EMAIL = 'jmoffitt@5thline.co';

export function canSeeMoffittBriefing(email: string | null | undefined): boolean {
  if (!email) return false;
  return (MOFFITT_BRIEFING_ALLOWED_EMAILS as readonly string[]).includes(
    email.toLowerCase(),
  );
}