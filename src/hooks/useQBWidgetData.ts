import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface QBConnectedEntity {
  realmId: string;
  companyName: string | null;
  expiresAt: string;
  isExpired: boolean;
}

export interface QBAccount {
  id: string;
  qbId: string;
  realmId: string;
  name: string | null;
  accountType: string | null;
  accountSubType: string | null;
  classification: string | null;
  fullyQualifiedName: string | null;
  currentBalance: number | null;
  active: boolean | null;
}

/** Fetch all connected QB entities (realms) for the current user's company */
export function useQBEntities() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-entities', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_tokens')
        .select('realm_id, company_name, expires_at')
        .order('company_name');

      if (error) throw error;

      return (data ?? []).map((row): QBConnectedEntity => ({
        realmId: row.realm_id,
        companyName: row.company_name,
        expiresAt: row.expires_at,
        isExpired: new Date(row.expires_at) < new Date(),
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

/** Fetch chart of accounts for a specific QB realm */
export function useQBAccounts(realmId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-accounts', user?.id, realmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('id, qb_id, realm_id, name, account_type, account_sub_type, classification, fully_qualified_name, current_balance, active')
        .eq('realm_id', realmId!)
        .eq('active', true)
        .order('account_type')
        .order('name');

      if (error) throw error;

      return (data ?? []).map((row): QBAccount => ({
        id: row.id,
        qbId: row.qb_id,
        realmId: row.realm_id,
        name: row.name,
        accountType: row.account_type,
        accountSubType: row.account_sub_type,
        classification: row.classification,
        fullyQualifiedName: row.fully_qualified_name,
        currentBalance: row.current_balance,
        active: row.active,
      }));
    },
    enabled: !!user && !!realmId,
    staleTime: 60_000,
  });
}
