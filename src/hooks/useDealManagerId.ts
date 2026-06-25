import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the user id of the deal's Deal Manager
 * (prefers `deal_owner`, falls back to legacy `manager` field).
 * Returns null while loading or if none is set.
 */
export function useDealManagerId(dealId?: string | null): string | null {
  const [managerId, setManagerId] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) {
      setManagerId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deals')
        .select('manager, deal_owner')
        .eq('id', dealId)
        .maybeSingle();
      if (cancelled) return;
      const id = (data as any)?.deal_owner || (data as any)?.manager || null;
      setManagerId(typeof id === 'string' ? id : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  return managerId;
}