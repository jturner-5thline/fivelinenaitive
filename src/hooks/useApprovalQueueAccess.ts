import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';

/**
 * Master gate for the Approval Queue.
 *
 * Scoped strictly to the 5th Line account/tenant (canonical company ID),
 * NOT to an individual user email or the demo flag. Every 5th Line user
 * sees it; no other tenant does. Reuses `useNaitivePipelineAccess` as the
 * single source of truth for "is this the 5th Line org?".
 */
export function useApprovalQueueAccess(): { enabled: boolean; isLoading: boolean } {
  const { hasAccess, isLoading } = useNaitivePipelineAccess();
  return { enabled: hasAccess, isLoading };
}