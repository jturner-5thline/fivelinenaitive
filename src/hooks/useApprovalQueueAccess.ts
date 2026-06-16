import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Master gate for the Approval Queue.
 *
 * Access is granted only when BOTH:
 *  - the `approval_queue_enabled` feature flag is `deployed`, AND
 *  - the current user belongs to the 5th Line account (email ends @5thline.co).
 *
 * This mirrors the SQL helper `public.can_use_approval_queue(uuid)` which
 * enforces the same rule at the RLS layer for `ai_action_queue` and
 * `deal_access_requests`.
 */
export function useApprovalQueueAccess(): { enabled: boolean; isLoading: boolean } {
  const { user } = useAuth();
  const is5thLine = !!user?.email?.toLowerCase().endsWith('@5thline.co');

  const { data, isLoading } = useQuery({
    queryKey: ['feature-flag', 'approval_queue_enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('status')
        .eq('name', 'approval_queue_enabled')
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 60_000,
  });

  const flagDeployed = (data as any)?.status === 'deployed';
  return { enabled: flagDeployed && is5thLine, isLoading };
}