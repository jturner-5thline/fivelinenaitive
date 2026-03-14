import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';

export interface QBAccountField {
  id: string;
  qbId: string;
  realmId: string;
  name: string;
  fullyQualifiedName: string | null;
  accountType: string | null;
  accountSubType: string | null;
  classification: string | null;
  currentBalance: number | null;
  active: boolean;
}

export interface QBEntity {
  realmId: string;
  companyName: string | null;
}

export function useWidgetEditorData() {
  const { user } = useAuth();
  const { data: qbStatus } = useQuickBooksStatus();

  const entities: QBEntity[] = (qbStatus?.connections || []).map((c) => ({
    realmId: c.realmId,
    companyName: c.companyName,
  }));

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['widget-editor-accounts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('id, qb_id, realm_id, name, fully_qualified_name, account_type, account_sub_type, classification, current_balance, active')
        .eq('active', true)
        .order('name');

      if (error) throw error;

      return (data || []).map((row): QBAccountField => ({
        id: row.id,
        qbId: row.qb_id,
        realmId: row.realm_id,
        name: row.name || 'Unnamed',
        fullyQualifiedName: row.fully_qualified_name,
        accountType: row.account_type,
        accountSubType: row.account_sub_type,
        classification: row.classification,
        currentBalance: row.current_balance,
        active: row.active ?? true,
      }));
    },
    enabled: !!user,
  });

  return { accounts, entities, isLoading };
}
