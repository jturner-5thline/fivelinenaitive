import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DealPeople {
  owner: string | null;
  manager: string | null;
}

/** HubSpot owner ids leak into `deal_owner` as numeric strings — never show them. */
function isDisplayName(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return t.length > 0 && !/^\d+$/.test(t);
}

/**
 * Loads deal_owner / manager for every deal the user can see, plus the option
 * lists that back the Debt Advisory owner & manager multi-selects.
 */
export function useDealPeopleIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ['deal-people-index'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, manager, deal_owner')
        .range(0, 9999);
      if (error) throw error;
      return (data ?? []) as { id: string; manager: string | null; deal_owner: string | null }[];
    },
  });

  return useMemo(() => {
    const byDeal = new Map<string, DealPeople>();
    const owners = new Set<string>();
    const managers = new Set<string>();
    for (const row of data ?? []) {
      const owner = isDisplayName(row.deal_owner) ? row.deal_owner.trim() : null;
      const manager = isDisplayName(row.manager) ? row.manager.trim() : null;
      byDeal.set(row.id, { owner, manager });
      if (owner) owners.add(owner);
      if (manager) managers.add(manager);
    }
    return {
      byDeal,
      ownerOptions: Array.from(owners).sort((a, b) => a.localeCompare(b)),
      managerOptions: Array.from(managers).sort((a, b) => a.localeCompare(b)),
      isLoading,
    };
  }, [data, isLoading]);
}

/**
 * Union semantics: a deal qualifies if its owner is selected OR its manager is
 * selected. Returns a Set of deal ids (dedupe is inherent), or `null` when no
 * filter is active.
 */
export function computeAllowedDealIds(
  byDeal: Map<string, DealPeople>,
  selectedOwners: string[],
  selectedManagers: string[],
): Set<string> | null {
  if (!selectedOwners.length && !selectedManagers.length) return null;
  const owners = new Set(selectedOwners);
  const managers = new Set(selectedManagers);
  const allowed = new Set<string>();
  byDeal.forEach((people, dealId) => {
    if ((people.owner && owners.has(people.owner)) || (people.manager && managers.has(people.manager))) {
      allowed.add(dealId);
    }
  });
  return allowed;
}
