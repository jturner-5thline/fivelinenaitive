import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';

// Allowlist of users (within the 5th Line tenant) that can see the
// unresolved FLEx Sync Requests badge in the sidebar. Extend as needed.
export const FLEX_SYNC_BADGE_ALLOWLIST = [
  'ppina@5thline.co',
  'jturner@5thline.co',
];

/**
 * Returns the number of UNRESOLVED FLEx Sync Requests (status = 'pending')
 * for the current 5th Line tenant. Gated by tenant + email allowlist;
 * returns 0 for everyone else. Subscribes to realtime updates so the
 * sidebar badge stays in sync as requests are resolved/created.
 */
export function useUnresolvedFlexSyncCount(): number {
  const { user } = useAuth();
  const { hasAccess: isFifthLine } = useNaitivePipelineAccess();
  const [count, setCount] = useState(0);

  const enabled =
    isFifthLine &&
    !!user?.email &&
    FLEX_SYNC_BADGE_ALLOWLIST.includes(user.email.toLowerCase());

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;

    const fetchCount = async () => {
      const { count: c, error } = await supabase
        .from('lender_sync_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!cancelled && !error && typeof c === 'number') setCount(c);
    };

    fetchCount();

    const channel = supabase
      .channel('sidebar-flex-sync-unresolved')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lender_sync_requests' },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return enabled ? count : 0;
}