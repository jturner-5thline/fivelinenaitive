import { useAuth } from '@/contexts/AuthContext';

const FLEX_SYNC_EMAILS = new Set([
  'jturner@5thline.co',
  'ffustinoni@5thline.co',
  'ppina@5thline.co',
]);

/**
 * Returns true only for explicitly allowed 5th Line users.
 */
export function useCanSeeFlexSync() {
  const { user } = useAuth();
  const canSeeFlexSync = !!user?.email && FLEX_SYNC_EMAILS.has(user.email);
  return { canSeeFlexSync };
}
