import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RevenueAccount {
  accountId: string;
  accountName: string;
}

/**
 * Fetches distinct revenue accounts from QuickBooks invoice line items.
 * These are extracted from the metadata->Line->SalesItemLineDetail->ItemAccountRef.
 */
export function useQBRevenueAccounts(realmId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-revenue-accounts', user?.id, realmId],
    queryFn: async (): Promise<RevenueAccount[]> => {
      // Query invoices and extract unique account refs from line items
      let query = supabase
        .from('quickbooks_invoices')
        .select('metadata');

      if (realmId) {
        query = query.eq('realm_id', realmId);
      }

      const { data: invoices, error } = await query;
      if (error || !invoices) return [];

      const accountMap = new Map<string, string>();

      for (const inv of invoices) {
        const meta = inv.metadata as Record<string, unknown> | null;
        if (!meta) continue;
        const lines = (meta as { Line?: Array<Record<string, unknown>> }).Line;
        if (!Array.isArray(lines)) continue;

        for (const line of lines) {
          if (line.DetailType !== 'SalesItemLineDetail') continue;
          const detail = line.SalesItemLineDetail as Record<string, unknown> | undefined;
          if (!detail) continue;
          const accountRef = detail.ItemAccountRef as { name?: string; value?: string } | undefined;
          if (!accountRef?.value || !accountRef?.name) continue;

          accountMap.set(accountRef.value, accountRef.name);
        }
      }

      return Array.from(accountMap.entries())
        .map(([accountId, accountName]) => ({ accountId, accountName }))
        .sort((a, b) => a.accountName.localeCompare(b.accountName));
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}
