import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';

/**
 * Returns true only for ppina@5thline.co or 5th Line admin users.
 * All other users (including regular 5th Line users) cannot see FLEx sync features.
 */
export function useCanSeeFlexSync() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRole();
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const isPpina = user?.email === 'ppina@5thline.co';

  // Only ppina or 5th Line admins can see FLEx sync
  const canSeeFlexSync = isPpina || (is5thLine && isAdmin);

  return { canSeeFlexSync };
}
