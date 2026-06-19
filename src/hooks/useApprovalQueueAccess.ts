import { useEffect } from 'react';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Master gate for the Approval Queue.
 *
 * Scoped strictly to the 5th Line account/tenant (canonical company ID),
 * NOT to an individual user email or the demo flag. Every 5th Line user
 * sees it; no other tenant does. Reuses `useNaitivePipelineAccess` as the
 * single source of truth for "is this the 5th Line org?".
 *
 * To avoid a flash where eligible users have to wait for the company
 * membership query to resolve before the header badge appears, we cache
 * the last-known "enabled" verdict per user in localStorage and seed
 * subsequent loads from it. The async query still runs and corrects the
 * value if access has changed.
 */
const CACHE_PREFIX = 'naitive:approvalQueueAccess:';

function readCached(userId: string | undefined): boolean {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CACHE_PREFIX + userId) === '1';
  } catch {
    return false;
  }
}

function writeCached(userId: string | undefined, enabled: boolean): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    if (enabled) window.localStorage.setItem(CACHE_PREFIX + userId, '1');
    else window.localStorage.removeItem(CACHE_PREFIX + userId);
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function useApprovalQueueAccess(): { enabled: boolean; isLoading: boolean } {
  const { user } = useAuth();
  const { hasAccess, isLoading } = useNaitivePipelineAccess();

  // Persist the verdict once the live query resolves so the next session
  // (and any other tab) can render the badge instantly on first paint.
  useEffect(() => {
    if (!user?.id || isLoading) return;
    writeCached(user.id, hasAccess);
  }, [user?.id, hasAccess, isLoading]);

  // While the live query is still loading, fall back to the cached value
  // so eligible users never see the badge pop in mid-session.
  const enabled = isLoading ? readCached(user?.id) : hasAccess;
  return { enabled, isLoading };
}