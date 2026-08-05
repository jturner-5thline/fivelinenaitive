import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

/** Deterministic key for a set of lender ids (order-independent). */
export function buildLenderDismissalKey(lenderIds: string[]): string {
  return [...lenderIds].sort().join('__');
}

/**
 * Persisted "not duplicates" decisions for funding-source duplicate groups.
 * A group is hidden when its exact member set was dismissed, or when every
 * member is contained in a previously dismissed (larger) set.
 */
export function useLenderDuplicateDismissals(enabled: boolean) {
  const { company } = useCompany();
  const [dismissedSets, setDismissedSets] = useState<string[][]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled || !company?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('lender_duplicate_dismissals')
        .select('lender_ids')
        .eq('company_id', company.id);
      if (cancelled) return;
      setDismissedSets(((data || []) as { lender_ids: string[] }[]).map((r) => r.lender_ids || []));
    })();
    return () => { cancelled = true; };
  }, [enabled, company?.id, version]);

  const isDismissed = useCallback(
    (lenderIds: string[]) => {
      if (!dismissedSets.length || lenderIds.length < 2) return false;
      return dismissedSets.some((set) => {
        const s = new Set(set);
        return lenderIds.every((id) => s.has(id));
      });
    },
    [dismissedSets],
  );

  const dismissGroup = useCallback(
    async (lenderIds: string[]) => {
      if (!company?.id) throw new Error('No company');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('lender_duplicate_dismissals')
        .upsert(
          {
            company_id: company.id,
            dismissal_key: buildLenderDismissalKey(lenderIds),
            lender_ids: lenderIds,
            created_by: user.id,
          },
          { onConflict: 'company_id,dismissal_key' },
        );
      if (error) throw error;
      // Optimistic local hide + refetch
      setDismissedSets((prev) => [...prev, lenderIds]);
      setVersion((v) => v + 1);
    },
    [company?.id],
  );

  return { isDismissed, dismissGroup };
}
